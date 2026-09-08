import { georeferencePlancha } from "./planchaGeo"

/**
 * Abrir el PDF de una plancha, medirlo y recortarle el mapa.
 *
 * Este módulo es el único que sabe de PDF. `planchaGeo` hace las cuentas —recibe
 * texto y píxeles y devuelve coordenadas— y aquí se le da de comer: se abre el
 * archivo con pdf.js, se dibuja la página, se le saca la capa de texto y se
 * recorta lo que el otro módulo diga.
 *
 * ## Dos dibujados y no uno
 *
 * El primero es **para medir** y va a baja resolución: solo hace falta encontrar
 * las líneas de la cuadrícula y el marco, y para eso sobran unos tres mil píxeles
 * de ancho. El segundo es **para ver** y va a la resolución que aguante la
 * tarjeta gráfica, pero **solo del rectángulo del mapa**, que es como dos tercios
 * de la hoja.
 *
 * Hacerlo en un solo dibujado a máxima resolución obligaría a tener en memoria la
 * hoja entera —una plancha es un pliego de 90 × 70 cm, y a 200 puntos por
 * pulgada son 7000 × 5500 píxeles, o sea 150 MB de lienzo— para tirar después un
 * tercio. En un teléfono eso es la pestaña cerrándose.
 *
 * ## El worker
 *
 * pdf.js reparte el trabajo a un hilo aparte, y lo localiza con una ruta que el
 * empaquetador de Next reescribe mal. Es exactamente la trampa nº 7 del proyecto
 * —la del worker de MapLibre—, así que se resuelve igual: el archivo se copia a
 * `public/pdfjs/` antes de arrancar (ver `scripts/copy-workers.mjs`) y aquí se
 * dice dónde está.
 */

/**
 * Cuántos píxeles de ancho para la pasada de medida.
 *
 * Con la plancha 132 —2563 puntos de ancho— esto sale a poco más de un aumento, y
 * el ajuste de la cuadrícula queda con un residuo de tres décimas de píxel. Subir
 * de aquí no mejora el ajuste y multiplica la memoria por el cuadrado.
 */
export const ANCHO_MEDIDA = 3000

/**
 * Presupuesto de resolución para la pasada de medida.
 *
/**
 * Detecta si el dispositivo es móvil o táctil para ajustar presupuestos de memoria gráfica.
 *
 * Considera móviles en vertical u horizontal (landscape), tablets y navegadores móviles
 * independientemente del ancho reportado por la ventana o densidad de píxeles.
 */
export const esDispositivoMovil = () => {
  if (typeof window === "undefined") return false
  const ancho = typeof window.innerWidth === "number" ? window.innerWidth : 1280
  const alto = typeof window.innerHeight === "number" ? window.innerHeight : 800
  const esPantallaPequena = Math.min(ancho, alto) < 768
  const tieneTouch =
    typeof navigator !== "undefined" && (navigator.maxTouchPoints > 0 || "ontouchstart" in window)
  const esUserAgentMovil =
    typeof navigator !== "undefined" &&
    /Android|iPhone|iPad|iPod|Mobile|webOS|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent)
  return Boolean(esUserAgentMovil || (tieneTouch && esPantallaPequena) || ancho < 768)
}

/**
 * Cuántos píxeles de ancho darle a la primera pasada de la plancha.
 *
 * En escritorio 3000 px da una resolución óptima. En móviles se limita a 1000 px
 * (presupuesto ~0.85 MP) en primer intento y 800 px (~0.6 MP) en segundo intento.
 * Es más que suficiente para detectar la cuadrícula (líneas cada 5 km) y previene
 * que el proceso de Chrome Android sea terminado por falta de memoria (OOM killer).
 */
export const calcularEscalaMedida = (tamano, { intento = 1 } = {}) => {
  const esMovil = esDispositivoMovil()
  const anchoObjetivo = esMovil ? (intento > 1 ? 800 : 1000) : (intento > 1 ? 2000 : ANCHO_MEDIDA)
  const maxPixeles = esMovil ? (intento > 1 ? 600000 : 850000) : (intento > 1 ? 4000000 : 7500000)

  // Validar dominio de entrada numérico y finito estrictamente positivo sin coerción de tipos
  const w = tamano?.width
  const h = tamano?.height
  if (
    typeof w !== "number" ||
    !Number.isFinite(w) ||
    w <= 0 ||
    typeof h !== "number" ||
    !Number.isFinite(h) ||
    h <= 0
  ) {
    return 0
  }

  const escalaPorDimension = Math.min(2, anchoObjetivo / Math.max(w, h))
  // Descomponer raíces para prevenir desbordamiento a Infinity en w * h (ej. dimensiones extremas)
  const escalaPorArea = Math.sqrt(maxPixeles) / (Math.sqrt(w) * Math.sqrt(h))
  let escala = Math.min(escalaPorDimension, escalaPorArea)

  // Presupuesto estricto garantizado: comprobar sobre las dimensiones efectivas
  // del canvas (Math.max(1, Math.round(...))) sin ningún umbral inferior arbitrario
  const dimEfectivas = (s) => ({
    ancho: Math.max(1, Math.round(w * s)),
    alto: Math.max(1, Math.round(h * s)),
  })

  while (escala > 0 && Number.isFinite(escala)) {
    const { ancho, alto } = dimEfectivas(escala)
    if (ancho <= anchoObjetivo && ancho * alto <= maxPixeles) break
    const factorExceso = Math.max(ancho / anchoObjetivo, Math.sqrt((ancho * alto) / maxPixeles))
    const siguiente = escala / Math.max(1.0001, factorExceso)
    if (siguiente >= escala) {
      escala *= 0.99
    } else {
      escala = siguiente
    }
  }

  // Garantía final: verificar que el retorno jamás sea 1 si 1 excede el presupuesto
  if (!Number.isFinite(escala) || escala <= 0 || dimEfectivas(escala).ancho * dimEfectivas(escala).alto > maxPixeles) {
    escala = Math.min(anchoObjetivo / w, Math.sqrt(maxPixeles) / (Math.sqrt(w) * Math.sqrt(h)))
  }

  return escala
}

/**
 * Y cuántos como mucho para la imagen que se ve.
 *
 * Es un tope de tarjeta gráfica, no de gusto: MapLibre sube la plancha como una
 * textura, y una textura más grande que `MAX_TEXTURE_SIZE` no se dibuja. Cuatro
 * mil es el mínimo que garantiza WebGL; si la tarjeta admite más, se usa más, y
 * de ahí que se le pregunte en vez de escribirlo fijo.
 */
const ANCHO_MAXIMO = 4096

let pdfjs = null

/**
 * Carga pdf.js la primera vez que hace falta, no al abrir el visor.
 *
 * Va con `import()` y no arriba del archivo por peso: pdf.js son más de un mega,
 * y quien nunca pide una plancha no tiene por qué descargarlo. Así el paquete
 * inicial del visor no cambia.
 *
 * **Y lleva un remiendo para los navegadores de antes de 2024.** pdf.js 4 usa
 * `Promise.withResolvers`, que Safari no tiene hasta la 17.4 y Chrome hasta la
 * 119. Sin esto, en un teléfono con el sistema sin actualizar —que en campo es lo
 * normal— la librería revienta al cargarse, con un error que no dice nada de lo
 * que pasa. Son cinco líneas y evitan tener que empaquetar la versión «legacy»,
 * que pesa bastante más.
 */
export const cargarPdfjs = async () => {
  if (pdfjs) return pdfjs
  if (typeof Promise.withResolvers !== "function") {
    Promise.withResolvers = function withResolvers() {
      let resolve
      let reject
      const promise = new this((si, no) => {
        resolve = si
        reject = no
      })
      return { promise, resolve, reject }
    }
  }
  const modulo = await import("pdfjs-dist")
  modulo.GlobalWorkerOptions.workerSrc = "/pdfjs/pdf.worker.min.mjs"
  pdfjs = modulo
  return pdfjs
}

/**
 * Un fallo con el mismo nombre que usa el navegador al cancelar, para que quien
 * llama no tenga que distinguir de dónde vino la cancelación.
 */
const cancelado = () => Object.assign(new Error("Cancelado"), { name: "AbortError" })

/**
 * Soltar el hilo un momento, y rendirse si ya no hace falta seguir.
 *
 * Dibujar una plancha son varios segundos de cálculo seguido, y mientras tanto
 * el navegador no puede hacer **nada más**: ni pintar el mapa, ni atender un
 * clic, ni dejar que salte el reloj que la cancela. Eso era lo que convertía una
 * plancha lenta en un visor colgado, y lo que dejaba el aviso de «tardó
 * demasiado» sin poder llegar nunca.
 *
 * Entre fase y fase se devuelve el hilo. Cuesta unos milisegundos y es lo que
 * hace que una espera larga siga siendo una espera y no una caída.
 */
const respirar = (signal) =>
  new Promise((sigue, para) => {
    if (signal?.aborted) return para(cancelado())
    setTimeout(() => (signal?.aborted ? para(cancelado()) : sigue()), 0)
  })

let limiteTexturaCache = null

export const _resetLimiteTexturaCache = () => {
  limiteTexturaCache = null
}

/**
 * Lo más ancho que la tarjeta acepta como textura, sin pasarse del tope.
 *
 * En móviles acota a 2048 para no saturar el límite estricto de memoria de canvas
 * (WebKit ~384 MB combinados y 16.7 Mpx) ni agotar la VRAM de GPUs móviles.
 * En escritorio permite hasta 4096.
 *
 * Libera de inmediato el contexto WebGL de prueba para evitar que el navegador
 * expulse el contexto WebGL de MapLibre (trampa de WebGL context lost en móviles).
 */
export const anchoMaximoDeTextura = (max = ANCHO_MAXIMO) => {
  const esMovil = esDispositivoMovil()

  if (limiteTexturaCache !== null && limiteTexturaCache.esMovil === esMovil) {
    return Math.min(limiteTexturaCache.hardware, max)
  }

  const fallback = esMovil ? 2048 : ANCHO_MAXIMO
  try {
    const lienzo = document.createElement("canvas")
    const gl = lienzo.getContext("webgl2") ?? lienzo.getContext("webgl")
    const limite = gl?.getParameter(gl.MAX_TEXTURE_SIZE)
    gl?.getExtension("WEBGL_lose_context")?.loseContext()
    lienzo.width = 0
    lienzo.height = 0
    const hardware = Number.isFinite(limite) ? (esMovil ? Math.min(limite, 2048) : limite) : fallback
    limiteTexturaCache = { hardware, esMovil }
    return Math.min(hardware, max)
  } catch {
    limiteTexturaCache = { hardware: fallback, esMovil }
    return Math.min(fallback, max)
  }
}

/** La luminancia de un lienzo, que es lo único que mira `planchaGeo`. */
const luminancia = (datos, total) => {
  const gris = new Uint8Array(total)
  for (let i = 0; i < total; i += 1) {
    const p = i * 4
    // Los pesos de siempre para pasar de color a gris. Importan poco aquí —lo
    // que se busca son líneas oscuras sobre un mapa claro— pero un promedio
    // simple aclara los azules de los drenajes y oscurece los amarillos.
    gris[i] = (datos[p] * 299 + datos[p + 1] * 587 + datos[p + 2] * 114) / 1000
  }
  return gris
}

/**
 * Rasteriza la página a la escala indicada y extrae su luminancia para medición.
 *
 * Libera el canvas inmediatamente tras extraer los píxeles (incluso ante errores)
 * y valida que el renderizado no haya quedado vacío ni transparente por colapso del proceso gráfico.
 */
export const rasterizarParaMedir = async (pagina, escala, signal) => {
  if (signal?.aborted) throw cancelado()
  if (!Number.isFinite(escala) || escala <= 0) {
    throw Object.assign(new Error("Escala de rasterización no válida."), { code: "INVALID_SCALE" })
  }

  const vista = pagina.getViewport({ scale: escala })
  const ancho = Math.max(1, Math.round(vista.width))
  const alto = Math.max(1, Math.round(vista.height))

  const lienzo = document.createElement("canvas")
  lienzo.width = ancho
  lienzo.height = alto

  try {
    const pincel = lienzo.getContext("2d", { willReadFrequently: true })
    if (!pincel || pincel.isContextLost?.()) {
      throw Object.assign(new Error("No se pudo inicializar el lienzo 2D en este dispositivo."), {
        code: "CONTEXT_LOST",
      })
    }

    // Fondo blanco: un PDF no lo trae, y sobre el lienzo transparente todas las
    // comprobaciones de «más oscuro que sus vecinos» darían lo mismo.
    pincel.fillStyle = "#ffffff"
    pincel.fillRect(0, 0, ancho, alto)

    let renderTask
    let onAbort
    try {
      if (signal) {
        onAbort = () => {
          try {
            renderTask?.cancel()
          } catch {}
        }
        signal.addEventListener("abort", onAbort, { once: true })
      }

      renderTask = pagina.render({ canvasContext: pincel, viewport: vista })
      await renderTask.promise
    } catch (err) {
      if (signal?.aborted || err?.name === "RenderingCancelledException") {
        throw cancelado()
      }
      throw err
    } finally {
      if (signal && onAbort) signal.removeEventListener("abort", onAbort)
    }

    if (signal?.aborted) throw cancelado()

    if (pincel.isContextLost?.()) {
      throw Object.assign(new Error("El contexto gráfico 2D se perdió durante el renderizado."), {
        code: "CONTEXT_LOST",
      })
    }

    const imagen = pincel.getImageData(0, 0, ancho, alto)
    const total = ancho * alto
    const data = imagen.data

    // Verificación de integridad del raster: comprobar que no sea una imagen
    // totalmente vacía o transparente por descarte del compositor en móviles.
    let pixelesOpacos = 0
    const pasoMuestreo = Math.max(1, Math.floor(total / 4000))
    for (let i = 0; i < total; i += pasoMuestreo) {
      if (data[i * 4 + 3] > 0) {
        pixelesOpacos += 1
        break
      }
    }

    if (total > 0 && pixelesOpacos === 0) {
      throw Object.assign(
        new Error("El lienzo rasterizado quedó vacío o transparente."),
        { code: "RASTER_EMPTY" },
      )
    }

    const gris = luminancia(data, total)
    return { gris, vista, escala, ancho, alto }
  } finally {
    // Garantizar liberación de memoria tanto en éxito como en fallo o cancelación
    lienzo.width = 1
    lienzo.height = 1
  }
}

export const prepararPlancha = async (archivo, cerca, { signal, onProgress } = {}) => {
  if (signal?.aborted) throw cancelado()
  const reloj = () => (typeof performance !== "undefined" ? performance.now() : Date.now())
  const tiempos = {}
  onProgress?.({ etapa: "abriendo", porcentaje: 42, detalle: "Abriendo documento PDF..." })
  const pdf = await cargarPdfjs()
  const documento = await pdf.getDocument({ data: archivo }).promise
  try {
    const pagina = await documento.getPage(1)
    await respirar(signal)
    onProgress?.({ etapa: "medida", porcentaje: 52, detalle: "Midiendo cuadrícula y extrayendo textos..." })
    const inicioMedida = reloj()
    const tamano = pagina.getViewport({ scale: 1 })
    const esMovil = esDispositivoMovil()

    const escala1 = calcularEscalaMedida(tamano, { intento: 1 })
    if (escala1 <= 0) {
      return {
        ok: false,
        reason: "lienzo-fallido",
        detail: "Las dimensiones del documento no son válidas para rasterización.",
      }
    }

    // Intentar rasterizar con el presupuesto adaptativo (1000 px en móvil / 3000 px en escritorio).
    // Solo si es móvil y ocurrió un fallo recuperable de contexto/memoria, reintentar a 800 px.
    let raster
    try {
      raster = await rasterizarParaMedir(pagina, escala1, signal)
    } catch (primerFallo) {
      if (primerFallo?.name === "AbortError" || signal?.aborted) throw primerFallo
      const esFalloRecuperable =
        primerFallo?.code === "CONTEXT_LOST" || primerFallo?.code === "RASTER_EMPTY"
      if (esMovil && esFalloRecuperable) {
        console.warn("Reintentando rasterizar plancha a resolución de emergencia...", primerFallo?.message)
        await respirar(signal)
        try {
          raster = await rasterizarParaMedir(pagina, calcularEscalaMedida(tamano, { intento: 2 }), signal)
        } catch (segundoFallo) {
          if (segundoFallo?.name === "AbortError" || signal?.aborted) throw segundoFallo
          return {
            ok: false,
            reason: "lienzo-fallido",
            detail: segundoFallo?.message || "No se pudo procesar la imagen de la plancha",
          }
        }
      } else {
        return {
          ok: false,
          reason: "lienzo-fallido",
          detail: primerFallo?.message || "No se pudo procesar la imagen de la plancha",
        }
      }
    }
    tiempos.medida = Math.round(reloj() - inicioMedida)
    await respirar(signal)

    const texto = await pagina.getTextContent()
    const items = texto.items
      .filter((item) => typeof item?.str === "string" && item.str.trim())
      .map((item) => {
        // El `transform` de pdf.js viene en coordenadas del PDF —la `y` hacia
        // arriba— y el lienzo las cuenta al revés. `convertToViewportPoint` hace
        // la conversión con la misma matriz que usó para dibujar, que es la
        // única forma de que texto y píxeles hablen del mismo sitio.
        const [x, y] = raster.vista.convertToViewportPoint(item.transform[4], item.transform[5])
        return { text: item.str, x, y }
      })

    onProgress?.({ etapa: "georreferenciacion", porcentaje: 68, detalle: "Calculando coordenadas Gauss y marco..." })
    const inicioGeo = reloj()
    const geo = georeferencePlancha({
      items,
      gray: raster.gris,
      width: raster.ancho,
      height: raster.alto,
      cerca,
    })
    // Liberar inmediatamente el búfer de luminancia (ocupa megas de memoria) antes de generar el recorte HD
    raster.gris = null
    tiempos.geo = Math.round(reloj() - inicioGeo)
    if (!geo.ok) return { ...geo, tiempos }

    await respirar(signal)
    onProgress?.({ etapa: "recorte", porcentaje: 82, detalle: "Generando imagen de alta fidelidad..." })
    const inicioRecorte = reloj()
    const recorte = await recortarMapa(pagina, geo, raster.escala, { signal })
    tiempos.recorte = Math.round(reloj() - inicioRecorte)
    return { ...geo, canvas: recorte.canvas, escala: recorte.escala, tiempos }
  } finally {
    // Cerrar el documento libera el worker y la memoria del PDF, que en una
    // plancha son decenas de megas.
    await documento.destroy()
  }
}

/**
 * Dibuja **solo** el rectángulo del mapa, a la mayor resolución razonable.
 *
 * El truco es la matriz que se le pasa a `render`: pdf.js dibuja la página
 * entera en el sistema de la vista, y esa matriz la corre para que la esquina del
 * marco caiga en el origen del lienzo. Así el lienzo mide lo que el recorte y no
 * lo que la hoja.
 */
export const recortarMapa = async (pagina, geo, escalaMedida, { signal } = {}) => {
  if (signal?.aborted) throw cancelado()

  const { left, right, top, bottom } = geo.frame
  const anchoMedida = right - left
  const altoMedida = bottom - top

  const tope = anchoMaximoDeTextura()
  const aumento = Math.min(tope / anchoMedida, tope / altoMedida)
  const escala = escalaMedida * Math.max(1, aumento)

  const vista = pagina.getViewport({ scale: escala })
  const proporcion = escala / escalaMedida

  const lienzo = document.createElement("canvas")
  lienzo.width = Math.max(1, Math.round(anchoMedida * proporcion))
  lienzo.height = Math.max(1, Math.round(altoMedida * proporcion))

  let exitoso = false
  try {
    const pincel = lienzo.getContext("2d")
    if (!pincel || pincel.isContextLost?.()) {
      throw Object.assign(new Error("No se pudo inicializar el lienzo para recortar el mapa."), {
        code: "CONTEXT_LOST",
      })
    }
    pincel.fillStyle = "#ffffff"
    pincel.fillRect(0, 0, lienzo.width, lienzo.height)

    let renderTask
    let onAbort
    try {
      if (signal) {
        onAbort = () => {
          try {
            renderTask?.cancel()
          } catch {}
        }
        signal.addEventListener("abort", onAbort, { once: true })
      }

      renderTask = pagina.render({
        canvasContext: pincel,
        viewport: vista,
        transform: [1, 0, 0, 1, -left * proporcion, -top * proporcion],
      })
      await renderTask.promise
    } catch (err) {
      if (signal?.aborted || err?.name === "RenderingCancelledException") {
        throw cancelado()
      }
      throw err
    } finally {
      if (signal && onAbort) signal.removeEventListener("abort", onAbort)
    }

    if (signal?.aborted) throw cancelado()

    if (pincel.isContextLost?.()) {
      throw Object.assign(new Error("Contexto gráfico 2D perdido durante el recorte del mapa."), {
        code: "CONTEXT_LOST",
      })
    }

    exitoso = true
    return { canvas: lienzo, escala }
  } finally {
    if (!exitoso) {
      lienzo.width = 1
      lienzo.height = 1
    }
  }
}
