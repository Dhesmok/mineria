import { useEffect, useRef, useState } from "react"
import { Map as MapLibreMap } from "maplibre-gl"
import {
  createOverlayStyle,
  MAX_ZOOM,
  PLANCHA_LAYER_ID,
  TERRAIN_SOURCE_ID,
} from "../../utils/mapStyles"
import { PITCH_MAX } from "./useTerrainGL"

/**
 * El segundo mapa: el lienzo de arriba donde van las capas que se funden con el
 * relieve —geología del SGC, hidrocarburos de la ANH y la plancha—.
 *
 * Va en un mapa aparte y no en una capa más del de abajo porque lo que se busca
 * es `mix-blend-mode: multiply`, que es una propiedad del navegador y actúa
 * sobre un elemento entero: hace falta que esas capas vivan en su propio lienzo
 * para poder multiplicarlas contra el resto del mapa. MapLibre no sabe hacer eso
 * dentro de un mismo estilo.
 *
 * Cuesta un contexto WebGL y un juego de teselas de relieve más. En un teléfono
 * eso no es gratis, y por eso el lienzo se apaga —`display: none`— mientras no
 * haya ninguna de esas capas encendida.
 */
export const useDualMapSyncGL = (
  baseMapRef,
  baseMapInstance,
  overlayContainerRef,
  options = {},
) => {
  // `blendMode` no está aquí: cómo se funde el lienzo es cosa del CSS y lo pone
  // React al pintar. Este hook solo se ocupa del mapa.
  const { is3D = false, exaggeration = 1.5, hasActiveOverlayLayers = false } = options

  const overlayMapRef = useRef(null)
  const [overlayMapInstance, setOverlayMapInstance] = useState(null)

  // 1. Construirlo, pero solo cuando ya exista el de abajo.
  //
  // Esperar al de abajo resuelve dos cosas de una: hereda su cámara —si no, el
  // lienzo de arriba arrancaba en la vista de fábrica aunque el usuario tuviera
  // otra guardada— y además hereda su contenedor ya medido, porque el de abajo
  // no se anuncia hasta que `whenSized` le da tamaño (trampa nº 25).
  useEffect(() => {
    const container = overlayContainerRef?.current
    if (!baseMapInstance || !container || overlayMapRef.current) return

    let canceled = false
    const overlayMap = new MapLibreMap({
      container,
      style: createOverlayStyle(),
      center: baseMapInstance.getCenter(),
      zoom: baseMapInstance.getZoom(),
      bearing: baseMapInstance.getBearing(),
      pitch: baseMapInstance.getPitch(),
      maxZoom: MAX_ZOOM,
      maxPitch: PITCH_MAX,
      interactive: false,
      attributionControl: false,
      // El nombre importa: en MapLibre 6 los atributos del lienzo van dentro de
      // `canvasContextAttributes`. Sueltos —o bajo cualquier otro nombre— se
      // ignoran **sin decir nada**, y `preserveDrawingBuffer` es justo el que
      // hace posible leer el lienzo para exportar la imagen. Sin él, la foto
      // salía con el mapa de abajo pero sin la geología encima.
      canvasContextAttributes: { preserveDrawingBuffer: true },
    })

    overlayMapRef.current = overlayMap

    // Solo en desarrollo, y por el mismo motivo que `window.__mapa`: poder
    // preguntarle cosas desde la consola. Aquí hace más falta todavía, porque
    // este mapa no responde a los clics y no hay otra forma de mirarlo por
    // dentro. `next build` elimina esta rama entera.
    if (process.env.NODE_ENV === "development") {
      window.__overlay = overlayMap
    }

    // No se anuncia hasta que el estilo esté parseado, por el mismo motivo que
    // el mapa de abajo: los hooks que le cuelgan capas comprueban `getLayer()`
    // y, si todavía no existe, se rinden en silencio. Y **tiene que cambiar el
    // valor del estado**: antes se volvía a llamar con el mismo objeto, React no
    // repintaba, y el aviso no llegaba nunca. La señal es `styledata` y no
    // `load`, que con una fuente lenta puede no llegar jamás.
    const alEstarListo = () => {
      if (canceled || !overlayMap.getLayer(PLANCHA_LAYER_ID)) return
      overlayMap.off("styledata", alEstarListo)
      setOverlayMapInstance(overlayMap)
    }
    overlayMap.on("styledata", alEstarListo)
    alEstarListo()

    return () => {
      canceled = true
      overlayMap.off("styledata", alEstarListo)
      // Sin condiciones: la guarda anterior preguntaba por `getStyle()`, que
      // lanza mientras el estilo no esté listo, y el `catch` se tragaba el fallo
      // dejando el mapa vivo. El resultado era un contexto WebGL y un lienzo
      // abandonados por cada montaje —dos mapas superpuestos en desarrollo, que
      // es donde se vio—.
      try {
        overlayMap.remove()
      } catch {
        // Ya estaba quitado.
      }
      overlayMapRef.current = null
      setOverlayMapInstance(null)
    }
  }, [baseMapInstance, overlayContainerRef])

  // 2. Sincronizacin de cmara (baseMap -> overlayMap)
  useEffect(() => {
    if (!baseMapInstance) return

    let isSyncing = false
    const syncCamera = () => {
      if (isSyncing || !overlayMapRef.current || !baseMapRef.current) return
      isSyncing = true
      const base = baseMapRef.current
      overlayMapRef.current.jumpTo({
        center: base.getCenter(),
        zoom: base.getZoom(),
        bearing: base.getBearing(),
        pitch: base.getPitch(),
      })
      isSyncing = false
    }

    const onResize = () => {
      overlayMapRef.current?.resize()
    }

    syncCamera()

    baseMapInstance.on("move", syncCamera)
    baseMapInstance.on("resize", onResize)

    return () => {
      baseMapInstance.off("move", syncCamera)
      baseMapInstance.off("resize", onResize)
    }
  }, [baseMapInstance, baseMapRef])

  // 3. El relieve, que también hay que ponérselo al de arriba: si no, en 3D las
  // capas temáticas se quedarían pegadas al plano mientras el suelo se levanta.
  //
  // `overlayMapInstance` está en las dependencias a propósito, aunque dentro se
  // use la referencia: el mapa de arriba se construye después que el de abajo,
  // así que cuando se enciende el 3D antes de que exista, esto tiene que volver
  // a correr al aparecer o el relieve no se le aplica nunca.
  useEffect(() => {
    const overlayMap = overlayMapRef.current
    if (!overlayMap) return

    try {
      if (is3D) {
        overlayMap.setTerrain({
          source: TERRAIN_SOURCE_ID,
          exaggeration,
        })
      } else {
        if (overlayMap.getTerrain()) {
          overlayMap.setTerrain(null)
        }
      }
    } catch (err) {
      console.warn("No se pudo sincronizar el terreno 3D en el overlay:", err)
    }
  }, [is3D, exaggeration, overlayMapInstance])

  // 4. Al volver a encenderse, remedirse.
  //
  // Quién lo esconde y quién lo funde lo dice el propio JSX —React pone
  // `display` y `mix-blend-mode` al pintar—, y aquí solo queda lo que hay que
  // hacer *después*: mientras estuvo escondido su lienzo midió cero, y un mapa
  // de cero píxeles no dibuja nada aunque se le devuelva el tamaño. Hay que
  // pedirle que se remida y volver a colocarle la cámara, porque los avisos de
  // movimiento que se perdió no vuelven.
  useEffect(() => {
    if (!hasActiveOverlayLayers) return
    const overlayMap = overlayMapRef.current
    const base = baseMapRef.current
    if (!overlayMap) return

    overlayMap.resize?.()
    if (base) {
      overlayMap.jumpTo?.({
        center: base.getCenter(),
        zoom: base.getZoom(),
        bearing: base.getBearing(),
        pitch: base.getPitch(),
      })
    }
  }, [baseMapRef, hasActiveOverlayLayers, overlayMapInstance])

  return {
    overlayMapRef,
    overlayMapInstance,
  }
}
