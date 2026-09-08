import { useCallback, useEffect, useRef, useState } from "react"

import { PLANCHA_LAYER_ID, PLANCHA_SOURCE_ID, TRANSPARENT_PIXEL } from "../../utils/mapStyles"
import { prepararPlancha } from "../../utils/planchaPdf"

/**
 * La plancha geológica en PDF, puesta sobre el mapa.
 *
 * Une las tres piezas: pide el archivo a `/api/plancha` —que existe por CORS—,
 * se lo da a `planchaPdf` para que lo mida y lo recorte, y le entrega el recorte
 * a MapLibre con las cuatro esquinas que salieron de las cuentas.
 *
 * ## Qué se le entrega a MapLibre, y qué error tiene
 *
 * Un lienzo y cuatro esquinas. MapLibre lo dibuja como un cuadrilátero en Web
 * Mercator, o sea que interpola entre las cuatro y no reproyecta de verdad. La
 * hoja está en Gauss —MAGNA-SIRGAS con origen en alguno de los cinco husos—, así
 * que ese atajo mete un error: se midió sobre la plancha 132 y son **8,5 metros
 * en el peor punto**, que a 1:100.000 es menos que el grosor de una línea del
 * propio mapa. Reproyectar de verdad exigiría deformar la imagen píxel a píxel
 * en un worker, y sería trabajar para ganar ocho metros.
 *
 * ## Una sola a la vez
 *
 * Dos planchas encendidas serían dos texturas de cuatro mil píxeles de lado —unos
 * 130 MB de memoria de vídeo cada una— y la de encima taparía a la de abajo casi
 * entera, porque las hojas vecinas se solapan poco. Cargar otra reemplaza la que
 * hubiera, que es lo que uno espera al pulsar en otra cuadrícula.
 */

/** Cuánto se espera al SGC antes de rendirse. Estas hojas pesan decenas de megas. */
const TIMEOUT_MS = 90000

/**
 * Un fallo del que se conoce el motivo, para poder enseñarlo.
 *
 * Se distingue de cualquier otro error porque su mensaje **viene del servidor**
 * y está escrito para que lo lea una persona; el resto de excepciones son de
 * programación y no se enseñan.
 */
class FalloDeRed extends Error {}

const MENSAJES = {
  "sin-rotulos": "El PDF no trae capa de texto: probablemente es un escaneo, y no se le pueden leer las coordenadas.",
  "sin-cuadricula": "No se encontró la cuadrícula rotulada en los márgenes de la hoja.",
  "sin-ajuste": "Se leyeron los rótulos pero no se encontraron sus líneas sobre el mapa.",
  "ejes-discordantes": "Los dos ejes de la cuadrícula no concuerdan: el ajuste no es de fiar.",
  "origen-desconocido": "La cuadrícula no cae cerca de esta plancha en ninguno de los orígenes conocidos.",
  "lienzo-fallido": "El dispositivo no pudo procesar la imagen del mapa.",
}

const formatearTamano = (bytes) => {
  if (!bytes || bytes <= 0) return "0 KB"
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`
  return `${(bytes / 1e6).toFixed(1)} MB`
}

/**
 * @param {Object} mapRef mapa donde se **dibuja** la plancha (el lienzo de arriba)
 * @param {Object} mapInstance ese mismo mapa, como estado, para saber cuándo existe
 * @param {Object} cameraRef mapa que se **mueve** al pulsar «Encuadrar»
 *
 * Son dos mapas distintos y tienen que serlo. La plancha se pinta arriba, en el
 * lienzo que se funde con el relieve, pero ese lienzo no manda: solo sigue al de
 * abajo. Con `fitBounds` sobre él, el botón de encuadrar no hacía nada visible
 * —el de arriba se movía y el primer movimiento del de abajo lo devolvía a su
 * sitio—. La cámara la lleva siempre el mapa de abajo.
 */
export const usePlanchaGL = (mapRef, mapInstance, cameraRef = mapRef) => {
  /** `null` | `{cargando:true}` | `{plancha}` | `{error}` */
  const [plancha, setPlancha] = useState(null)
  const [opacity, setOpacity] = useState(1)
  const cancelar = useRef(null)

  /** Enciende o apaga la capa y le pone la opacidad que toque. */
  useEffect(() => {
    const map = mapRef.current
    if (!map?.getLayer?.(PLANCHA_LAYER_ID)) return
    map.setLayoutProperty(PLANCHA_LAYER_ID, "visibility", plancha?.canvas ? "visible" : "none")
    map.setPaintProperty(PLANCHA_LAYER_ID, "raster-opacity", opacity)
  }, [mapRef, mapInstance, plancha, opacity])

  /** Salvaguarda ante pérdida de contexto WebGL en móviles: solicitar restauración y reasociar la plancha. */
  useEffect(() => {
    const map = mapRef.current
    const canvas = map?.getCanvas?.()
    if (!canvas?.addEventListener) return

    const alPerderContexto = (evento) => {
      evento.preventDefault?.()
      console.warn("Se perdió el contexto WebGL del mapa. Solicitando restauración...")
    }
    const alRestaurarContexto = () => {
      console.info("Contexto WebGL restaurado exitosamente en el mapa.")
      const fuente = map?.getSource?.(PLANCHA_SOURCE_ID)
      if (fuente?.updateImage && plancha?.canvas && plancha?.corners) {
        fuente.updateImage({ image: plancha.canvas, coordinates: plancha.corners })
      }
    }

    canvas.addEventListener("webglcontextlost", alPerderContexto)
    canvas.addEventListener("webglcontextrestored", alRestaurarContexto)
    return () => {
      canvas.removeEventListener("webglcontextlost", alPerderContexto)
      canvas.removeEventListener("webglcontextrestored", alRestaurarContexto)
    }
  }, [mapRef, mapInstance, plancha])

  const quitar = useCallback(() => {
    cancelar.current?.abort()
    cancelar.current = null
    const map = mapRef.current
    const fuente = map?.getSource?.(PLANCHA_SOURCE_ID)
    // Se le devuelve el píxel transparente: una fuente de imagen no se puede
    // vaciar, solo se le puede dar otra imagen. Y así el lienzo grande queda sin
    // referencias y el navegador puede soltar los megas.
    if (fuente?.updateImage) fuente.updateImage({ url: TRANSPARENT_PIXEL })
    setPlancha(null)
  }, [mapRef])

  /**
   * Trae la plancha, la georreferencia y la coloca.
   *
   * @param {Object} peticion
   * @param {string} peticion.url el `ECG_URL_PL` de la ficha
   * @param {string} peticion.titulo cómo se llama, para el panel
   * @param {[number,number]} peticion.cerca dónde se tocó, para elegir el origen
   */
  const cargar = useCallback(
    async ({ url, titulo, cerca }) => {
      cancelar.current?.abort()
      const control = new AbortController()
      cancelar.current = control
      setPlancha({
        cargando: true,
        titulo,
        progreso: { etapa: "descarga", porcentaje: 5, detalle: "Iniciando descarga del PDF..." },
      })

      // **Por qué se abortó, no solo si se abortó.** Son dos cosas distintas y
      // este hook las trataba igual: que el usuario pida otra plancha —y
      // entonces callar es lo correcto, porque la nueva petición ya puso su
      // propio «cargando»— o que se acabe el tiempo, que hay que **decirlo**.
      //
      // Sin esta distinción, el `catch` de abajo se rendía en silencio ante el
      // reloj y el panel se quedaba en «cargando» para siempre. El aviso de
      // «tardó demasiado» estaba escrito y era inalcanzable: cuando llegaba,
      // `signal.aborted` ya era cierto y el `return` de más arriba se lo comía.
      let porTiempo = false
      // En qué fase se quedó, para poder decirlo. «Tardó demasiado» a secas no
      // sirve de nada: descargando apunta al SGC o a la conexión, y dibujando
      // apunta al aparato. Son dos problemas y se arreglan por sitios distintos.
      let fase = "descargando el PDF"
      let dondeIba = null
      const arrancado = Date.now()
      const reloj = setTimeout(() => {
        porTiempo = true
        control.abort()
      }, TIMEOUT_MS)
      /** Se acabó el tiempo: decirlo, con la fase y los números. */
      const seAcaboElTiempo = () => {
        setPlancha({
          titulo,
          url,
          error: `Se acabó el tiempo ${fase}.`,
          detalle: [
            `${Math.round((Date.now() - arrancado) / 1000)} s esperando, con ${TIMEOUT_MS / 1000} s de tope`,
            dondeIba,
          ]
            .filter(Boolean)
            .join(" · "),
        })
      }
      try {
        let archivo
        try {
          const respuesta = await fetch(`/api/plancha?url=${encodeURIComponent(url)}`, {
            signal: control.signal,
          })
          // **El mensaje del servidor se enseña, no se tira.** La ruta contesta
          // cosas útiles —«el SGC respondió 404», «tardó demasiado», «esa
          // dirección no es un PDF»— y aquí se sustituían todas por un «no se
          // pudo traer la plancha» que no señalaba a ningún sitio. Fue lo que
          // dejó sin diagnosticar el fallo de la duración de la función.
          if (!respuesta.ok) throw new FalloDeRed((await respuesta.text()).trim())

          const totalBytes = Number(respuesta.headers?.get?.("content-length") ?? 0)
          const reader = respuesta.body?.getReader?.()
          if (!reader) {
            archivo = await respuesta.arrayBuffer()
          } else {
            const chunks = []
            let bytesCargados = 0
            let ultimoReporte = 0
            while (true) {
              const { done, value } = await reader.read()
              if (done) break
              chunks.push(value)
              bytesCargados += value.length
              const ahora = Date.now()
              // Reportar cada 120 ms para mantener la barra fluida sin saturar el hilo de React
              if (ahora - ultimoReporte > 120) {
                ultimoReporte = ahora
                const mb = (bytesCargados / 1e6).toFixed(1)
                let pct = 10
                let detalle = `${mb} MB descargados...`
                if (totalBytes > 0) {
                  const mbTotal = (totalBytes / 1e6).toFixed(1)
                  const fraccion = Math.min(1, bytesCargados / totalBytes)
                  pct = Math.round(5 + fraccion * 35) // Fase descarga: 5% a 40%
                  detalle = `${mb} MB de ${mbTotal} MB (${Math.round(fraccion * 100)}%)`
                }
                setPlancha((prev) =>
                  prev?.cargando
                    ? { ...prev, progreso: { etapa: "descarga", porcentaje: pct, detalle } }
                    : prev,
                )
              }
            }
            const buffer = new Uint8Array(bytesCargados)
            let offset = 0
            for (const chunk of chunks) {
              buffer.set(chunk, offset)
              offset += chunk.length
            }
            chunks.length = 0 // Liberar inmediatamente todos los trozos del stream
            archivo = buffer.buffer
          }
          if (!archivo || archivo.byteLength === 0) {
            throw new FalloDeRed("El archivo recibido está incompleto o vacío.")
          }
        } catch (fallo) {
          if (fallo instanceof FalloDeRed || fallo?.name === "AbortError") throw fallo
          // Aquí llega la conexión que se corta a mitad de la descarga, que es
          // lo que pasaba cuando la plataforma mataba la función. Decirlo así
          // —«se cortó»— es lo que distingue este caso de «el SGC no contesta».
          throw new FalloDeRed("La descarga se cortó antes de terminar.")
        }
        const descarga = Date.now() - arrancado
        dondeIba = `${formatearTamano(archivo.byteLength)} bajados en ${Math.round(descarga / 1000)} s`
        fase = "dibujando el PDF"
        // Solo se calla si lo que abortó fue **otra petición**: esa ya puso su
        // propio «cargando» y escribirle encima sería enseñar el fallo de algo
        // que el usuario ya no espera. Si fue el reloj, se dice más abajo.
        if (control.signal.aborted && !porTiempo) return

        let resultado
        try {
          // La señal va también aquí, y no solo al `fetch`. Dibujar el PDF son
          // varios segundos de cálculo, y sin esto el reloj saltaba mientras
          // tanto sin poder detener nada: el navegador seguía trabajando en una
          // plancha que ya nadie iba a ver.
          resultado = await prepararPlancha(archivo, cerca, {
            signal: control.signal,
            onProgress: (progreso) => {
              setPlancha((prev) => (prev?.cargando ? { ...prev, progreso } : prev))
            },
          })
        } catch (fallo) {
          if (fallo?.name === "AbortError") throw fallo
          // Un PDF que llega incompleto revienta al abrirse, no al descargarse.
          // Sin separar las dos cosas, el aviso culpaba a la red de un archivo
          // que sí llegó entero pero venía roto, y al revés.
          console.error("No se pudo leer el PDF de la plancha:", fallo)
          setPlancha({
            titulo,
            url,
            error: "El PDF llegó incompleto o el navegador no pudo abrirlo.",
            detalle: `${formatearTamano(archivo?.byteLength ?? 0)} recibidos`,
          })
          return
        }
        // Si llegó hasta aquí, el trabajo está hecho aunque el reloj haya
          // saltado por los pelos: se enseña la plancha, que es mejor que tirarla.
        if (control.signal.aborted && !porTiempo) return

        if (!resultado.ok) {
          setPlancha({
            titulo,
            error: MENSAJES[resultado.reason] ?? "No se pudo georreferenciar esta plancha.",
            // El detalle se enseña tal cual. Las hojas son casi mil y no se
            // parecen entre sí, así que la siguiente que falle lo hará por algo
            // que aquí no se ha visto: sin los números, informar del fallo no
            // sirve para arreglarlo.
            detalle: resultado.detail,
            url,
          })
          return
        }

        const map = mapRef.current
        const fuente = map?.getSource?.(PLANCHA_SOURCE_ID)
        if (!fuente?.updateImage) {
          setPlancha({ titulo, error: "El mapa todavía no está listo.", url })
          return
        }
        setPlancha((prev) =>
          prev?.cargando
            ? {
                ...prev,
                progreso: { etapa: "mapa", porcentaje: 96, detalle: "Sincronizando capa sobre el visor..." },
              }
            : prev,
        )
        // Las esquinas y la imagen en la misma llamada: puestas por separado, hay
        // un fotograma en el que la imagen nueva se dibuja con las esquinas
        // viejas, y la hoja aparece un instante en el sitio de la anterior.
        fuente.updateImage({ image: resultado.canvas, coordinates: resultado.corners })
        // Asegurar que MapLibre remedida y repinte el lienzo temático de inmediato
        map?.resize?.()
        map?.triggerRepaint?.()
        setPlancha({
          titulo,
          url,
          ...resultado,
          // El tiempo de red se mide aquí, que es el único sitio que lo sabe; el
          // resto lo trae `prepararPlancha`. Juntos son lo que el panel enseña.
          tiempos: { ...resultado.tiempos, descarga },
        })
      } catch (fallo) {
        // Se acabó el tiempo: hay que decirlo. Aquí estaba el fallo que dejaba
        // el panel girando para siempre — se comprobaba `signal.aborted`, que el
        // reloj acababa de poner a cierto, y se salía sin escribir nada.
        if (porTiempo) {
          seAcaboElTiempo()
          return
        }
        // Y si el aborto no fue del reloj, fue porque se pidió otra plancha: esa
        // petición ya puso su propio «cargando» y pisar su estado sería peor.
        if (control.signal.aborted) return
        setPlancha({
          titulo,
          url,
          error:
            fallo?.name === "AbortError"
              ? "El SGC tardó demasiado en entregar la plancha."
              : "No se pudo traer la plancha del SGC.",
          // Lo que dijo el servidor, tal cual. Es la diferencia entre saber que
          // falló y saber por qué.
          detalle: fallo instanceof FalloDeRed ? fallo.message : undefined,
        })
      } finally {
        clearTimeout(reloj)
        if (cancelar.current === control) cancelar.current = null
      }
    },
    [mapRef],
  )

  /** Lleva el mapa a la hoja entera. */
  const encuadrar = useCallback(() => {
    const map = cameraRef.current
    const esquinas = plancha?.corners
    if (!map || !esquinas) return
    const lngs = esquinas.map(([lng]) => lng)
    const lats = esquinas.map(([, lat]) => lat)
    map.fitBounds(
      [
        [Math.min(...lngs), Math.min(...lats)],
        [Math.max(...lngs), Math.max(...lats)],
      ],
      { padding: 40, duration: 600 },
    )
  }, [cameraRef, plancha])

  // Al desmontar, cortar lo que estuviera en marcha: una plancha tarda decenas
  // de segundos y el usuario puede irse antes.
  useEffect(() => () => cancelar.current?.abort(), [])

  return {
    plancha,
    planchaOpacity: opacity,
    setPlanchaOpacity: setOpacity,
    cargarPlancha: cargar,
    quitarPlancha: quitar,
    cancelarPlancha: quitar,
    encuadrarPlancha: encuadrar,
  }
}
