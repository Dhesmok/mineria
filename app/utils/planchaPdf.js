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
const ANCHO_MEDIDA = 3000

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

/** Lo más ancho que la tarjeta acepta como textura, sin pasarse del tope. */
export const anchoMaximoDeTextura = (max = ANCHO_MAXIMO) => {
  try {
    const lienzo = document.createElement("canvas")
    const gl = lienzo.getContext("webgl2") ?? lienzo.getContext("webgl")
    const limite = gl?.getParameter(gl.MAX_TEXTURE_SIZE)
    return Number.isFinite(limite) ? Math.min(limite, max) : max
  } catch {
    return max
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
 * Abre el PDF, lo georreferencia y devuelve el mapa recortado.
 *
 * @param {ArrayBuffer} archivo el PDF entero
 * @param {[number,number]} cerca dónde tocó el usuario, para elegir el origen
 * @returns {Promise<{ok:true, canvas:HTMLCanvasElement, ...}|{ok:false, reason:string}>}
 */
export const prepararPlancha = async (archivo, cerca) => {
  const pdf = await cargarPdfjs()
  const documento = await pdf.getDocument({ data: archivo }).promise
  try {
    const pagina = await documento.getPage(1)
    const tamano = pagina.getViewport({ scale: 1 })
    const escalaMedida = Math.min(2, ANCHO_MEDIDA / Math.max(tamano.width, tamano.height))
    const vistaMedida = pagina.getViewport({ scale: escalaMedida })

    const lienzo = document.createElement("canvas")
    lienzo.width = Math.round(vistaMedida.width)
    lienzo.height = Math.round(vistaMedida.height)
    const pincel = lienzo.getContext("2d", { willReadFrequently: true })
    // Fondo blanco: un PDF no lo trae, y sobre el lienzo transparente todas las
    // comprobaciones de «más oscuro que sus vecinos» darían lo mismo.
    pincel.fillStyle = "#ffffff"
    pincel.fillRect(0, 0, lienzo.width, lienzo.height)
    await pagina.render({ canvasContext: pincel, viewport: vistaMedida }).promise

    const imagen = pincel.getImageData(0, 0, lienzo.width, lienzo.height)
    const gris = luminancia(imagen.data, lienzo.width * lienzo.height)

    const texto = await pagina.getTextContent()
    const items = texto.items
      .filter((item) => typeof item?.str === "string" && item.str.trim())
      .map((item) => {
        // El `transform` de pdf.js viene en coordenadas del PDF —la `y` hacia
        // arriba— y el lienzo las cuenta al revés. `convertToViewportPoint` hace
        // la conversión con la misma matriz que usó para dibujar, que es la
        // única forma de que texto y píxeles hablen del mismo sitio.
        const [x, y] = vistaMedida.convertToViewportPoint(item.transform[4], item.transform[5])
        return { text: item.str, x, y }
      })

    const geo = georeferencePlancha({
      items,
      gray: gris,
      width: lienzo.width,
      height: lienzo.height,
      cerca,
    })
    // El lienzo de medida ya no hace falta: se le quita el tamaño para que el
    // navegador suelte los megas antes de pedirle el siguiente, que es más
    // grande. Sin esto los dos conviven un instante.
    lienzo.width = 1
    lienzo.height = 1
    if (!geo.ok) return geo

    const recorte = await recortarMapa(pagina, geo, escalaMedida)
    return { ...geo, canvas: recorte.canvas, escala: recorte.escala }
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
const recortarMapa = async (pagina, geo, escalaMedida) => {
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
  const pincel = lienzo.getContext("2d")
  pincel.fillStyle = "#ffffff"
  pincel.fillRect(0, 0, lienzo.width, lienzo.height)
  await pagina.render({
    canvasContext: pincel,
    viewport: vista,
    transform: [1, 0, 0, 1, -left * proporcion, -top * proporcion],
  }).promise

  return { canvas: lienzo, escala }
}
