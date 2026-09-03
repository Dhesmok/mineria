import { useEffect, useRef, useState } from "react"
import { Map as MapLibreMap } from "maplibre-gl"
import {
  createOverlayStyle,
  INITIAL_CENTER,
  INITIAL_ZOOM,
  MAX_ZOOM,
  TERRAIN_SOURCE_ID,
} from "../../utils/mapStyles"
import { PITCH_MAX } from "./useTerrainGL"

export const useDualMapSyncGL = (
  baseMapRef,
  baseMapInstance,
  overlayContainerRef,
  options = {},
) => {
  const {
    blendMode = "multiply",
    is3D = false,
    exaggeration = 1.5,
    hasActiveOverlayLayers = false,
  } = options

  const overlayMapRef = useRef(null)
  const [overlayMapInstance, setOverlayMapInstance] = useState(null)

  // 1. Inicializacin del overlayMap
  useEffect(() => {
    const container = overlayContainerRef?.current
    if (!container || overlayMapRef.current) return

    let canceled = false
    const overlayMap = new MapLibreMap({
      container,
      style: createOverlayStyle(),
      center: baseMapRef.current ? baseMapRef.current.getCenter() : INITIAL_CENTER,
      zoom: baseMapRef.current ? baseMapRef.current.getZoom() : INITIAL_ZOOM,
      bearing: baseMapRef.current ? baseMapRef.current.getBearing() : 0,
      pitch: baseMapRef.current ? baseMapRef.current.getPitch() : 0,
      maxZoom: MAX_ZOOM,
      maxPitch: PITCH_MAX,
      preserveDrawingBuffer: true,
      interactive: false,
      attributionControl: false,
      mapLibreGLContextAttributes: {
        alpha: true,
        preserveDrawingBuffer: true,
      },
    })

    overlayMapRef.current = overlayMap
    setOverlayMapInstance(overlayMap)

    const onStyleData = () => {
      if (canceled) return
      setOverlayMapInstance(overlayMap)
    }

    overlayMap.on("styledata", onStyleData)

    return () => {
      canceled = true
      overlayMap.off("styledata", onStyleData)
      try {
        if (overlayMap.getStyle()) overlayMap.remove()
      } catch {
        // Mapa ya destruido
      }
      overlayMapRef.current = null
      setOverlayMapInstance(null)
    }
  }, [overlayContainerRef, baseMapRef])

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

  // 3. Sincronizacin de terreno 3D
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
  }, [is3D, exaggeration])

  // 4. Gestión de CSS mix-blend-mode y visibilidad del contenedor
  useEffect(() => {
    const container = overlayContainerRef?.current
    if (!container) return

    container.style.mixBlendMode = blendMode === "multiply" ? "multiply" : "normal"
    const wasHidden = container.style.display === "none"
    container.style.display = hasActiveOverlayLayers ? "block" : "none"
    if (wasHidden && hasActiveOverlayLayers && overlayMapRef.current) {
      overlayMapRef.current.resize?.()
      if (baseMapRef.current) {
        overlayMapRef.current.jumpTo?.({
          center: baseMapRef.current.getCenter(),
          zoom: baseMapRef.current.getZoom(),
          bearing: baseMapRef.current.getBearing(),
          pitch: baseMapRef.current.getPitch(),
        })
      }
    }
  }, [baseMapRef, blendMode, hasActiveOverlayLayers, overlayContainerRef])

  return {
    overlayMapRef,
    overlayMapInstance,
  }
}
