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

const MENSAJES = {
  "sin-rotulos": "El PDF no trae capa de texto: probablemente es un escaneo, y no se le pueden leer las coordenadas.",
  "sin-cuadricula": "No se encontró la cuadrícula rotulada en los márgenes de la hoja.",
  "sin-ajuste": "Se leyeron los rótulos pero no se encontraron sus líneas sobre el mapa.",
  "ejes-discordantes": "Los dos ejes de la cuadrícula no concuerdan: el ajuste no es de fiar.",
  "origen-desconocido": "La cuadrícula no cae cerca de esta plancha en ninguno de los orígenes conocidos.",
}

export const usePlanchaGL = (mapRef, mapInstance) => {
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
      setPlancha({ cargando: true, titulo })

      const reloj = setTimeout(() => control.abort(), TIMEOUT_MS)
      try {
        const respuesta = await fetch(`/api/plancha?url=${encodeURIComponent(url)}`, {
          signal: control.signal,
        })
        if (!respuesta.ok) throw new Error(await respuesta.text())
        const archivo = await respuesta.arrayBuffer()
        if (control.signal.aborted) return

        const resultado = await prepararPlancha(archivo, cerca)
        if (control.signal.aborted) return

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
        // Las esquinas y la imagen en la misma llamada: puestas por separado, hay
        // un fotograma en el que la imagen nueva se dibuja con las esquinas
        // viejas, y la hoja aparece un instante en el sitio de la anterior.
        fuente.updateImage({ image: resultado.canvas, coordinates: resultado.corners })
        setPlancha({ titulo, url, ...resultado })
      } catch (fallo) {
        if (control.signal.aborted) return
        setPlancha({
          titulo,
          url,
          error:
            fallo?.name === "AbortError"
              ? "El SGC tardó demasiado en entregar la plancha."
              : "No se pudo traer la plancha del SGC.",
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
    const map = mapRef.current
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
  }, [mapRef, plancha])

  // Al desmontar, cortar lo que estuviera en marcha: una plancha tarda decenas
  // de segundos y el usuario puede irse antes.
  useEffect(() => () => cancelar.current?.abort(), [])

  return {
    plancha,
    planchaOpacity: opacity,
    setPlanchaOpacity: setOpacity,
    cargarPlancha: cargar,
    quitarPlancha: quitar,
    encuadrarPlancha: encuadrar,
  }
}
