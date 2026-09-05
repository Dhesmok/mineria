"use client"

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { Map as MapLibreMap, ScaleControl, setWorkerUrl } from "maplibre-gl"
import "maplibre-gl/dist/maplibre-gl.css"

import { useMapInitializationGL } from "./hooks/map/useMapInitializationGL"
import { useTerrainGL, PITCH_MAX } from "./hooks/map/useTerrainGL"
import { useTerrainRasterGL } from "./hooks/map/useTerrainRasterGL"
import { useSgcLayersGL } from "./hooks/map/useSgcLayersGL"
import { useAnhLayersGL } from "./hooks/map/useAnhLayersGL"
import { usePlanchaGL } from "./hooks/map/usePlanchaGL"
import { useDualMapSyncGL } from "./hooks/map/useDualMapSyncGL"
import { useTerrainProfileGL } from "./hooks/map/useTerrainProfileGL"
import { useMapLayersGL } from "./hooks/map/useMapLayersGL"
import { useDrawControlGL } from "./hooks/map/useDrawControlGL"
import { useAreaDownloadGL } from "./hooks/map/useAreaDownloadGL"
import { useGeolocationGL } from "./hooks/map/useGeolocationGL"
import { useExpedientSearchGL } from "./hooks/map/useExpedientSearchGL"
import { BASE_LAYERS, createBaseStyle, INITIAL_CENTER, INITIAL_ZOOM, MAX_ZOOM } from "./utils/mapStyles"
import { COMPASS_SIZE_MAX, COMPASS_SIZE_MIN } from "./hooks/map/useGeolocationGL"
import { basemapById } from "./utils/basemaps"
import { readPreferences } from "./utils/preferences"
import { onMapTap } from "./utils/tapGesture"
import { crsById } from "./utils/crs"
import { whenSized } from "./utils/whenSized"
import { ANM_LAYERS } from "./utils/anmLayers"
import { SGC_LAYERS } from "./utils/sgcLayers"
import { ANH_LAYERS, anhLayerByKey } from "./utils/anhLayers"
import { FloatingPanel } from "./components/FloatingPanel"
import { DrawToolbar } from "./components/DrawToolbar"
import { ImageExport } from "./components/ImageExport"
import { TerrainQuery } from "./components/TerrainQuery"
import { TerrainRasterLegend } from "./components/TerrainRasterLegend"
import { SgcPanel, activeRasterKeys } from "./components/SgcPanel"
import { PlanchaPanel } from "./components/PlanchaPanel"
import { TerrainProfile } from "./components/TerrainProfile"
import { CoordinateEntry, CursorCoordinates } from "./components/CoordinateReadout"
import { Hud3DPopover, MapButton, MapHUD, MapNotice, RotateHint, SliderRow } from "./components/MapControls"
import { BasemapPicker } from "./components/BasemapPicker"
import { TerrainMenu } from "./components/TerrainMenu"
import BlockModel3D from "./components/BlockModel3D"
import {
  Boxes,
  ChevronLeft,
  Crosshair,
  Download,
  GripVertical,
  Loader2,
  Mountain,
  Layers,
  Map as MapIcon,
  PencilRuler,
  Square,
  X,
} from "lucide-react"

/**
 * El visor del proyecto, sobre MapLibre. Es el único: el de Leaflet se borró en
 * la Fase 7 del plan, una vez que este hacía todo lo que hacía aquel.
 *
 * Se sirve en la raíz (`/`). Durante la migración vivió en `/gl` para poder
 * compararlos lado a lado; esa ruta ya no existe.
 *
 * Pendiente (ver docs/PLAN-MAPLIBRE.md): el DEM recortado en la descarga por
 * área —falta decidir la fuente— y las capas de otras entidades.
 *
 * Nota sobre la importación: maplibre-gl 6 dejó de tener exportación por
 * defecto. `import maplibregl from "maplibre-gl"` compila sin quejarse y
 * devuelve undefined, y el error solo aparece al construir el mapa. Hay que
 * importar por nombre. `Map` se renombra porque choca con el Map nativo de
 * JavaScript.
 */

// MapLibre delega en un web worker el trabajo de convertir el GeoJSON en teselas.
// Por defecto busca ese worker a partir de `import.meta.url`, suponiendo que el
// paquete se sirve tal cual está en disco; webpack reescribe ese valor y la
// búsqueda falla. El worker entonces no arranca, y lo hace en absoluto silencio:
// no hay error en consola, las capas simplemente se quedan cargando para
// siempre. Costó encontrarlo porque el mapa base sí se veía —las teselas raster
// no pasan por el worker— y todo parecía funcionar.
//
// La copia la deja en public/ el script scripts/copy-workers.mjs, que
// corre solo antes de cada `npm run dev` y de cada `npm run build`.
setWorkerUrl("/maplibre/maplibre-gl-worker.mjs")




export default function MapComponentGL({
  onMapInitialized,
  expedientCode,
  searchTrigger,
  onCoordinatesUpdate,
  layerState,
  layerOrder,
  coordinateSystem,
  filters,
  onLayerData,
  onSgcState,
  panelOpen = false,
  blendMode = "multiply",
  onBlendModeChange: _onBlendModeChange,
}) {
  // El contenedor se pasa por referencia y no por id. Durante la migración
  // convivían los dos visores y el de Leaflet ya ocupaba el id "map": MapLibre
  // podía apoderarse del div equivocado. Se deja por referencia porque además
  // es lo correcto en React: el id es un nombre global y la referencia no.
  const containerRef = useRef(null)
  const overlayContainerRef = useRef(null)
  const mapRef = useRef(null)
  const [mapInstance, setMapInstance] = useState(null)
  const [error, setError] = useState(null)
  const [showErrorBanner, setShowErrorBanner] = useState(false)

  // División de pantalla y Modelo de Bloque 3D del Terreno
  const [blockModelOpen, setBlockModelOpen] = useState(false)
  const [splitRatio, setSplitRatio] = useState(0.5)
  const [isDraggingSplit, setIsDraggingSplit] = useState(false)
  const splitContainerRef = useRef(null)

  const [selectedRectangle, setSelectedRectangle] = useState(null)
  const [isDrawingBox, setIsDrawingBox] = useState(false)
  const [boxDragStart, setBoxDragStart] = useState(null)
  const [boxDragCurrent, setBoxDragCurrent] = useState(null)

  const handleStartDrawBox = useCallback(() => {
    setBlockModelOpen(false)
    setIsDrawingBox(true)
    setBoxDragStart(null)
    setBoxDragCurrent(null)
    requestAnimationFrame(() => {
      mapRef.current?.resize()
    })
  }, [])

  const handleBoxPointerDown = useCallback((e) => {
    if (e.button !== 0) return // solo clic izquierdo
    e.preventDefault()
    e.currentTarget.setPointerCapture(e.pointerId)
    const rect = e.currentTarget.getBoundingClientRect()
    const x = e.clientX - rect.left
    const y = e.clientY - rect.top
    const lngLat = mapRef.current?.unproject([x, y])
    if (!lngLat) return
    setBoxDragStart({ x, y, lng: lngLat.lng, lat: lngLat.lat })
    setBoxDragCurrent({ x, y, lng: lngLat.lng, lat: lngLat.lat })
  }, [])

  const handleBoxPointerMove = useCallback((e) => {
    const rect = e.currentTarget.getBoundingClientRect()
    const x = e.clientX - rect.left
    const y = e.clientY - rect.top
    const lngLat = mapRef.current?.unproject([x, y])
    if (!lngLat) return
    setBoxDragCurrent((prev) => (prev ? { x, y, lng: lngLat.lng, lat: lngLat.lat } : null))
  }, [])

  const handleBoxPointerUp = useCallback((e) => {
    try {
      e.currentTarget.releasePointerCapture(e.pointerId)
    } catch {
      // ignore
    }

    setBoxDragStart((start) => {
      setBoxDragCurrent((current) => {
        if (start && current) {
          const dx = Math.abs(current.x - start.x)
          const dy = Math.abs(current.y - start.y)
          if (dx > 20 && dy > 20) {
            const minLng = Math.min(start.lng, current.lng)
            const maxLng = Math.max(start.lng, current.lng)
            const minLat = Math.min(start.lat, current.lat)
            const maxLat = Math.max(start.lat, current.lat)

            // Vista previa inicial inmediata desde el lienzo
            let textureDataUrl = null
            try {
              const mapCanvas = mapRef.current?.getCanvas()
              if (mapCanvas) {
                const cropX = Math.min(start.x, current.x)
                const cropY = Math.min(start.y, current.y)
                const offCanvas = document.createElement("canvas")
                offCanvas.width = 1024
                offCanvas.height = 1024
                const ctx = offCanvas.getContext("2d")
                if (ctx) {
                  ctx.drawImage(mapCanvas, cropX, cropY, dx, dy, 0, 0, 1024, 1024)
                  textureDataUrl = offCanvas.toDataURL("image/jpeg", 0.88)
                }
              }
            } catch {
              // fallback
            }

            setSelectedRectangle({
              bbox: [minLng, minLat, maxLng, maxLat],
              center: [(minLng + maxLng) / 2, (minLat + maxLat) / 2],
              textureDataUrl,
            })
            setIsDrawingBox(false)
            setBlockModelOpen(true)
            requestAnimationFrame(() => mapRef.current?.resize())
          }
        }
        return null
      })
      return null
    })
  }, [])

  const handleSplitPointerDown = useCallback((e) => {
    e.preventDefault()
    e.currentTarget.setPointerCapture(e.pointerId)
    setIsDraggingSplit(true)
  }, [])

  const handleSplitPointerMove = useCallback(
    (e) => {
      if (!isDraggingSplit || !splitContainerRef.current) return
      const rect = splitContainerRef.current.getBoundingClientRect()
      if (rect.width <= 0) return
      const rawRatio = (e.clientX - rect.left) / rect.width
      const clamped = Math.max(0.15, Math.min(0.85, rawRatio))
      setSplitRatio(clamped)
      mapRef.current?.resize()
    },
    [isDraggingSplit],
  )

  const handleSplitPointerUp = useCallback(
    (e) => {
      if (isDraggingSplit) {
        setIsDraggingSplit(false)
        try {
          e.currentTarget.releasePointerCapture(e.pointerId)
        } catch {
          // ignore
        }
        mapRef.current?.resize()
      }
    },
    [isDraggingSplit],
  )

  const { basemap, showLabels, chooseBasemap } = useMapInitializationGL(mapRef, mapInstance)
  const [basemapOpen, setBasemapOpen] = useState(false)
  const basemapBtnRef = useRef(null)
  const basemapContainerRef = useRef(null)
  const basemapLeaveTimerRef = useRef(null)

  const handleBasemapMouseEnter = useCallback(() => {
    if (basemapLeaveTimerRef.current) {
      clearTimeout(basemapLeaveTimerRef.current)
      basemapLeaveTimerRef.current = null
    }
  }, [])

  const handleBasemapMouseLeave = useCallback(() => {
    if (!basemapOpen) return
    if (basemapLeaveTimerRef.current) {
      clearTimeout(basemapLeaveTimerRef.current)
    }
    basemapLeaveTimerRef.current = setTimeout(() => {
      setBasemapOpen(false)
    }, 800)
  }, [basemapOpen])

  useEffect(() => {
    if (!basemapOpen) return
    const handleClickOutside = (e) => {
      if (basemapContainerRef.current && !basemapContainerRef.current.contains(e.target)) {
        setBasemapOpen(false)
      }
    }
    window.addEventListener("pointerdown", handleClickOutside)
    return () => {
      window.removeEventListener("pointerdown", handleClickOutside)
      if (basemapLeaveTimerRef.current) {
        clearTimeout(basemapLeaveTimerRef.current)
      }
    }
  }, [basemapOpen])

  // Recapturar automáticamente la textura del área seleccionada al cambiar mapa base
  useEffect(() => {
    if (!blockModelOpen || !selectedRectangle?.bbox || !mapRef.current) return
    const map = mapRef.current

    const updateTexture = () => {
      try {
        const [minLng, minLat, maxLng, maxLat] = selectedRectangle.bbox
        const p1 = map.project([minLng, maxLat])
        const p2 = map.project([maxLng, minLat])
        const mapCanvas = map.getCanvas?.()
        if (mapCanvas && p1 && p2) {
          const x = Math.min(p1.x, p2.x)
          const y = Math.min(p1.y, p2.y)
          const w = Math.abs(p2.x - p1.x)
          const h = Math.abs(p2.y - p1.y)
          if (w > 10 && h > 10 && x >= 0 && y >= 0 && x + w <= mapCanvas.width && y + h <= mapCanvas.height) {
            const offCanvas = document.createElement("canvas")
            offCanvas.width = 1024
            offCanvas.height = 1024
            const ctx = offCanvas.getContext("2d")
            if (ctx) {
              ctx.drawImage(mapCanvas, x, y, w, h, 0, 0, 1024, 1024)
              const newTex = offCanvas.toDataURL("image/jpeg", 0.9)
              setSelectedRectangle((prev) => (prev ? { ...prev, textureDataUrl: newTex } : null))
            }
          }
        }
      } catch {
        // ignore
      }
    }

    map.once("idle", updateTexture)
  }, [basemap, blockModelOpen, selectedRectangle?.bbox])

  const [terrainOpen, setTerrainOpen] = useState(false)
  const terrainBtnRef = useRef(null)
  const terrainContainerRef = useRef(null)
  const terrainLeaveTimerRef = useRef(null)

  const handleTerrainMouseEnter = useCallback(() => {
    if (terrainLeaveTimerRef.current) {
      clearTimeout(terrainLeaveTimerRef.current)
      terrainLeaveTimerRef.current = null
    }
  }, [])

  const handleTerrainMouseLeave = useCallback(() => {
    if (!terrainOpen) return
    if (terrainLeaveTimerRef.current) {
      clearTimeout(terrainLeaveTimerRef.current)
    }
    terrainLeaveTimerRef.current = setTimeout(() => {
      setTerrainOpen(false)
    }, 800)
  }, [terrainOpen])

  useEffect(() => {
    if (!terrainOpen) return
    const handleClickOutside = (e) => {
      if (terrainContainerRef.current && !terrainContainerRef.current.contains(e.target)) {
        setTerrainOpen(false)
      }
    }
    window.addEventListener("pointerdown", handleClickOutside)
    return () => {
      window.removeEventListener("pointerdown", handleClickOutside)
      if (terrainLeaveTimerRef.current) {
        clearTimeout(terrainLeaveTimerRef.current)
      }
    }
  }, [terrainOpen])

  const [dibujoAbierto, setDibujoAbierto] = useState(false)
  const [dibujoCompacto, setDibujoCompacto] = useState(false)
  const [exportandoImagen, setExportandoImagen] = useState(false)
  // La consulta de terreno se declara aquí arriba y no junto a su hook: quien
  // primero la necesita es `useMapLayersGL`, para callar la ficha del polígono
  // mientras está encendida. Declarada más abajo, leerla desde ahí daba
  // «Cannot access before initialization» y el visor no se pintaba.
  const [queryingTerrain, setQueryingTerrain] = useState(false)
  const [terrainResult, setTerrainResult] = useState(null)

  // El panel entrega el estado de las capas ya agrupado por clave: encendida,
  // opacidad y colores. Antes llegaban ocho props sueltas que había que volver a
  // juntar aquí con dos useMemo.
  const { showZoomInHint, truncatedLayers, loadedFeatures } = useMapLayersGL(
    mapRef,
    mapInstance,
    layerState,
    layerOrder,
    filters,
    setError,
    setShowErrorBanner,
    !queryingTerrain,
  )

  const {
    is3D,
    toggle3D,
    exaggeration,
    changeExaggeration,
    bearing,
    changeBearing,
    resetNorth,
    pitch,
    changePitch,
    isSpinning,
    spin,
    elevationAt,
    terrainError,
    dismissTerrainError,
    setTerrainForQuery,
    queryTerrain,
  } = useTerrainGL(mapRef, mapInstance)

  const [hud3DOpen, setHud3DOpen] = useState(false)
  const [is3DPinned, setIs3DPinned] = useState(false)
  const hud3DContainerRef = useRef(null)
  const hud3DLeaveTimerRef = useRef(null)

  const handleHud3DMouseEnter = useCallback(() => {
    if (hud3DLeaveTimerRef.current) {
      clearTimeout(hud3DLeaveTimerRef.current)
      hud3DLeaveTimerRef.current = null
    }
    if (is3D) {
      setHud3DOpen(true)
    }
  }, [is3D])

  const handleHud3DMouseLeave = useCallback(() => {
    if (!is3D || is3DPinned) return
    if (hud3DLeaveTimerRef.current) {
      clearTimeout(hud3DLeaveTimerRef.current)
    }
    hud3DLeaveTimerRef.current = setTimeout(() => {
      setHud3DOpen(false)
    }, 700)
  }, [is3D, is3DPinned])

  useEffect(() => {
    return () => {
      if (hud3DLeaveTimerRef.current) {
        clearTimeout(hud3DLeaveTimerRef.current)
      }
    }
  }, [])

  // Si hay algo que enseñar en el lienzo de arriba. Mientras no lo haya, ese
  // lienzo se apaga: son un contexto WebGL y un juego de teselas de más, y en un
  // teléfono eso se nota.
  const [planchaActive, setPlanchaActive] = useState(false)

  const hasActiveOverlayLayers = useMemo(() => {
    const sgcActiva = SGC_LAYERS.some(({ key }) => layerState?.[key]?.on)
    const anhActiva = ANH_LAYERS.some(({ key }) => layerState?.[key]?.on)
    return sgcActiva || anhActiva || planchaActive
  }, [layerState, planchaActive])

  // El lienzo de arriba, sincronizado con el de abajo, donde van las capas que
  // se funden con el relieve.
  const { overlayMapRef, overlayMapInstance } = useDualMapSyncGL(
    mapRef,
    mapInstance,
    overlayContainerRef,
    { is3D, exaggeration, hasActiveOverlayLayers },
  )

  // Las capas temáticas viven **solo** en el mapa de arriba, y no hay respaldo
  // al de abajo. Lo hubo, y era peor que no tenerlo: mientras el de arriba
  // terminaba de construirse, los hooks le colgaban las capas al de abajo —que
  // llevaba una copia con los mismos identificadores—, la dibujaba sin fundir y
  // ahí se quedaba, congelada en el primer encuadre y por debajo de la buena.
  // Con un solo destino, lo peor que pasa mientras tanto es que no se dibuje
  // nada, que es un segundo y se arregla solo.
  //
  // `overlayMapRef` se pasa siempre; quien decide si hay mapa es la instancia,
  // que es la que React sabe vigilar. Una referencia no dispara un repintado, y
  // leerla al pintar dejaba a los hooks mirando el mapa de la vuelta anterior.
  const thematicMapRef = overlayMapRef
  const thematicMapInstance = overlayMapInstance

  // Las de geología del SGC sobre el mapa temático superpuesto con fusión
  const {
    sgcSubLayers,
    sgcChosenSub,
    toggleSgcSubLayer,
    sgcLegends,
    sgcFeatureInfo,
    sgcFieldInfo,
    clearSgcFeatureInfo,
  } = useSgcLayersGL(thematicMapRef, thematicMapInstance, layerState, {
    enabled: !queryingTerrain,
    clickMap: mapInstance,
  })

  // Las de hidrocarburos de la ANH sobre el mapa temático superpuesto con fusión
  const {
    subLayers: anhSubLayers,
    chosenSub: anhChosenSub,
    toggleSubLayer: toggleAnhSubLayer,
    legends: anhLegends,
    featureInfo: anhFeatureInfo,
    clearFeatureInfo: clearAnhFeatureInfo,
  } = useAnhLayersGL(thematicMapRef, thematicMapInstance, layerState, {
    enabled: !queryingTerrain,
    clickMap: mapInstance,
  })

  // Y la plancha en PDF que cuelga de la ficha de «Estado cartográfico»
  const {
    plancha,
    planchaOpacity,
    setPlanchaOpacity,
    cargarPlancha,
    quitarPlancha,
    encuadrarPlancha,
  } = usePlanchaGL(thematicMapRef, thematicMapInstance, mapRef)

  useEffect(() => {
    setPlanchaActive(Boolean(plancha?.canvas))
  }, [plancha?.canvas])

  // La lista de subcapas sube al panel, que es quien dibuja las casillas. El
  // hook tiene que vivir aquí —necesita el mapa— pero las casillas van junto a
  // su capa, en la columna de la izquierda, así que el estado viaja hacia
  // arriba igual que ya lo hace lo cargado de la ANM.
  useEffect(() => {
    onSgcState?.({
      subLayers: { ...sgcSubLayers, ...anhSubLayers },
      chosenSub: { ...sgcChosenSub, ...anhChosenSub },
      onToggleSubLayer: (key, cual) => {
        if (anhLayerByKey(key)) {
          toggleAnhSubLayer(key, cual)
        } else {
          toggleSgcSubLayer(key, cual)
        }
      },
    })
  }, [
    sgcSubLayers,
    anhSubLayers,
    sgcChosenSub,
    anhChosenSub,
    toggleSgcSubLayer,
    toggleAnhSubLayer,
    onSgcState,
  ])

  // Lo cargado sube al panel, que es donde viven el filtro y la tabla: las
  // opciones del filtro se arman con lo que hay, y la tabla necesita además el
  // recuadro de cada figura para poder llevar el mapa hasta ella. Va en una sola
  // llamada porque las tres cosas cambian a la vez.
  useEffect(() => {
    onLayerData?.({
      features: loadedFeatures,
      truncated: truncatedLayers,
    })
  }, [loadedFeatures, truncatedLayers, onLayerData])

  const {
    drawingColor,
    handleColorChange,
    mode,
    startMode,
    addPointAt,
    selectedIds,
    deleteSelected,
    clearDrawings,
    getDrawnFeatures,
    hasArea,
    summary: drawSummary,
  } = useDrawControlGL(mapRef, mapInstance, coordinateSystem)

  // La descarga por área solo necesita saber qué está encendido, no con qué
  // color ni en qué orden. Se le entrega esa vista reducida para no obligar a
  // `bboxDownload` —que es lógica pura y con pruebas propias— a aprenderse la
  // forma del estado del panel.
  const layerVisibility = useMemo(
    () =>
      Object.fromEntries(
        Object.entries(layerState).map(([key, estado]) => [key, Boolean(estado?.on)]),
      ),
    [layerState],
  )

  const { isDownloading, downloadArea } = useAreaDownloadGL(
    getDrawnFeatures,
    layerVisibility,
    setError,
    setShowErrorBanner,
  )

  const {
    isLocating,
    hasLocated,
    isCompassActive,
    compassSize,
    changeCompassSize,
    handleLocateUser,
  } = useGeolocationGL(mapRef, setError, setShowErrorBanner)

  const { profileActive, toggleProfile, profile, profileHover, onProfileHover } =
    useTerrainProfileGL(mapRef, mapInstance, { elevationAt, setTerrainForQuery, startMode })

  // Sin `setTerrainForQuery`: estas capas ya no le preguntan las alturas a
  // MapLibre, bajan las teselas del modelo por su cuenta. Poner el terreno solo
  // para consultarlo era trabajo pagado dos veces.
  const {
    terrainMode,
    chooseTerrainMode,
    terrainRasterUnavailable,
    terrainRasterProgress,
    terrainRasterCellSize,
  } = useTerrainRasterGL(mapRef, mapInstance)

  useEffect(() => {
    if (mode && mode !== "simple_select") {
      setDibujoAbierto(true)
    }
  }, [mode])

  /**
   * La consulta puntual al terreno: un modo, no un botón de una sola vez.
   *
   * Con la consulta encendida, cada clic en el mapa responde por ese punto y la
   * ficha del polígono se calla, para que la respuesta no quede tapada.
   * `terrainResult` es `null` mientras no se ha pulsado nada, y un objeto vacío
   * cuando se pulsó pero el modelo todavía no tenía dato ahí: son dos cosas
   * distintas y la tarjeta las dice distinto.
   */
  /**
   * **Los efectos van fuera del actualizador de estado.** Estuvieron dentro de
   * `setQueryingTerrain(actual => …)`, que es el mismo patrón que ya costó una
   * tanda con el perfil longitudinal y que `useTerrainGL.toggle3D` y
   * `useTerrainRasterGL.chooseMode` documentan: React puede ejecutar ese
   * actualizador más de una vez para el mismo cambio, y ahí dentro no puede
   * haber nada que no se pueda repetir —ni tocar el terreno del mapa, ni llamar
   * a otro `setState`—. El estado actual se lee de una referencia para que esta
   * función no cambie de identidad en cada render.
   */
  const queryingTerrainRef = useRef(queryingTerrain)
  queryingTerrainRef.current = queryingTerrain

  const toggleTerrainQuery = useCallback(() => {
    const siguiente = !queryingTerrainRef.current
    queryingTerrainRef.current = siguiente
    setQueryingTerrain(siguiente)
    setTerrainResult(null)
  }, [])

  useEffect(() => {
    if (!mapInstance || !queryingTerrain) return

    const alPulsar = async (event) => {
      const res = await queryTerrain(event.lngLat)
      setTerrainResult(res ?? {})
    }
    mapInstance.on("click", alPulsar)
    // Y el toque aparte: en táctil el clic no llega, porque el control de
    // dibujo cancela `touchend`. Ver `utils/tapGesture.js`.
    const quitarToque = onMapTap(mapInstance, alPulsar)
    // El cursor lo dice: en este modo el mapa se pregunta, no se navega.
    mapInstance.getCanvas().style.cursor = "crosshair"

    return () => {
      mapInstance.off("click", alPulsar)
      quitarToque()
      mapInstance.getCanvas().style.cursor = ""
    }
  }, [mapInstance, queryingTerrain, queryTerrain])

  // El aviso de "arrastra con Ctrl" solo tiene sentido con ratón: en una
  // pantalla táctil se gira con dos dedos y ese gesto ya lo conoce todo el
  // mundo. `pointer: fine` es la pregunta correcta —¿hay un puntero preciso?—;
  // mirar el ancho de la pantalla habría dejado sin aviso a un portátil pequeño.
  const [rotateHintShown, setRotateHintShown] = useState(false)
  const [showRotateHint, setShowRotateHint] = useState(false)
  const hideRotateHint = useCallback(() => setShowRotateHint(false), [])

  useEffect(() => {
    if (!is3D || rotateHintShown) return
    if (typeof window === "undefined" || !window.matchMedia("(pointer: fine)").matches) return
    setRotateHintShown(true)
    setShowRotateHint(true)
  }, [is3D, rotateHintShown])

  // Solo en desarrollo, junto a `window.__mapa`: permite preguntar la altura
  // real de un punto desde la consola (`__mapa.__alturaReal(__mapa.getCenter())`)
  // sin caer en la trampa de queryTerrainElevation, que devuelve la altura
  // multiplicada por la exageración.
  useEffect(() => {
    if (!mapInstance || process.env.NODE_ENV !== "development") return
    mapInstance.__alturaReal = elevationAt
  }, [mapInstance, elevationAt])

  const { addVertices, removeVertices, clearSearchResult } = useExpedientSearchGL(
    mapRef,
    mapInstance,
    expedientCode,
    searchTrigger,
    onCoordinatesUpdate,
    setError,
    setShowErrorBanner,
  )

  // El panel lateral no habla con estos hooks: llama a métodos sobre el objeto
  // del mapa (`mapRef.current.clearDrawings()`, etc.), que es el contrato que ya
  // existía con el visor Leaflet. Se colocan aquí, en un efecto, y no dentro de
  // la creación del mapa, porque las funciones vienen de hooks que se ejecutan
  // después y hay que reemplazarlas cuando cambian.
  useEffect(() => {
    if (!mapInstance) return
    mapInstance.addVertices = addVertices
    mapInstance.removeVertices = removeVertices
    mapInstance.clearDrawings = clearDrawings
    mapInstance.clearSearchResult = clearSearchResult
    // Lo usa el campo de "ir a una coordenada" del panel: marca el punto por la
    // misma vía que el ratón, así que sale con el mismo símbolo y se borra con
    // la misma papelera.
    mapInstance.addPointAt = addPointAt
    mapInstance.chooseBasemap = chooseBasemap
    mapInstance.startMode = startMode
  }, [mapInstance, addVertices, removeVertices, clearDrawings, clearSearchResult, addPointAt, chooseBasemap, startMode])

  /**
   * El aviso de "mapa listo", por referencia.
   *
   * El efecto que crea el mapa lo tenía en sus dependencias, y eso lo dejaba a
   * un `useCallback` de distancia del desastre: si esa prop cambiara de
   * identidad, React ejecutaría la limpieza —que destruye el mapa y pone
   * `mapRef` a null—, y al volver a entrar la guarda `if (mapRef.current)`… ya no
   * frenaría nada, pero el mapa recién destruido se habría llevado consigo las
   * capas, lo dibujado y el resultado de la búsqueda, sin ningún error. Hoy no
   * pasa porque llega memoizado con dependencias vacías; el día que alguien le
   * añada una, tiene que seguir sin pasar. El mapa se crea una vez y punto.
   */
  const onMapInitializedRef = useRef(onMapInitialized)
  onMapInitializedRef.current = onMapInitialized

  useEffect(() => {
    if (mapRef.current) return

    /**
     * **El mapa no se construye hasta que el contenedor mida algo**, y eso no es
     * una precaución teórica: el visor no abría en el teléfono.
     *
     * `_calcMatrices()` de MapLibre empieza con `if (this._width &&
     * this._height)`, así que con el contenedor a cero deja la matriz de
     * proyección sin definir. La barra de escala se engancha en `addControl` y
     * lo primero que hace es preguntar por unas coordenadas de pantalla: le pasa
     * `undefined` a la multiplicación de matrices y se lleva por delante el
     * arranque entero, con un «Cannot read properties of undefined» que no
     * señala a ningún sitio.
     *
     * Ver `utils/whenSized`, que es quien espera.
     */
    // Lo que hay que deshacer al desmontar, se haya llegado a construir el mapa
    // o no. Un objeto y no dos variables sueltas: la limpieza corre siempre, y
    // con banderas sueltas es donde se cuela el «off de un mapa que no existe».
    const montado = { mapa: null, desengancharEstilo: null }

    const construir = () => {
      const map = new MapLibreMap({
        container: containerRef.current,
        // El fondo de partida tiene que ser el mismo que dice el botón. Estaba
        // fijo en "osm" desde cuando solo había dos fondos: el visor arrancaba con
        // el callejero mientras el botón anunciaba «Satélite», y no se notaba
        // hasta comparar la atribución de la esquina con lo que decía el botón.
        //
        // Y se lee de las preferencias, no del valor de fábrica: si no, quien
        // dejó puesto el fondo claro vería un parpadeo del satélite en cada
        // recarga antes de que el fondo guardado se aplicara encima.
        style: createBaseStyle(readPreferences().basemap),
        center: INITIAL_CENTER,
        zoom: INITIAL_ZOOM,
        maxZoom: MAX_ZOOM,
        // Por defecto MapLibre no deja pasar de 60° de inclinación. Con terreno
        // real conviene poder acercarse más al horizonte para leer un valle a
        // contraluz, que es justo lo que uno quiere mirar en 3D.
        //
        // El número sale de `PITCH_MAX` y no está escrito aquí: estuvo fijo en 85
        // mientras el deslizador ya usaba la constante, así que bajarla no bajaba
        // nada —arrastrando con Ctrl se seguía llegando a 85—.
        maxPitch: PITCH_MAX,
        // Sin esto, leer el lienzo devuelve una imagen en negro: WebGL descarta
        // el búfer en cuanto termina de pintar, salvo que se le pida guardarlo.
        // Es lo que hace posible exportar el mapa como imagen.
        //
        // Y va **dentro de `canvasContextAttributes`**, que es donde MapLibre 6
        // lo busca. Suelto se ignora sin decir nada, y la exportación seguía
        // saliendo bien aquí solo por casualidad —se lee el lienzo en el mismo
        // fotograma en que se pinta, antes de que el navegador lo descarte—.
        canvasContextAttributes: { preserveDrawingBuffer: true },
        // La atribución propia de MapLibre se queda, en versión compacta: las
        // condiciones de uso de OSM la exigen. `false` la quitaría del todo.
        attributionControl: { compact: true },
      })

      map.addControl(new ScaleControl({ unit: "metric" }), "bottom-left")

      mapRef.current = map
      montado.mapa = map

      // El mapa no se anuncia hasta que el estilo esté parseado. Es asíncrono:
      // justo después de `new Map()` el estilo todavía está vacío y getLayer()
      // devuelve undefined. El hook de capas usa eso como señal de "todavía no",
      // así que entregarle el mapa antes de tiempo lo deja rendido en silencio y
      // las capas no aparecen nunca.
      //
      // La señal NO puede ser el evento `load`, que es lo que sugiere toda la
      // documentación: MapLibre solo lo dispara cuando el estilo *y todas sus
      // fuentes* terminaron de cargar. Con una fuente lenta o caída —el servidor
      // de teselas sin responder, por ejemplo— ese evento no llega nunca y el
      // visor se quedaría inicializándose para siempre. Se comprobó en pruebas:
      // con las teselas bloqueadas, `load` no llegó y `isStyleLoaded()` se quedó
      // en false indefinidamente. `styledata` solo depende del estilo, que es
      // justo la condición que hace falta aquí.
      let announced = false
      const announceWhenStyleReady = () => {
        if (announced || !map.getLayer(BASE_LAYERS.osm)) return
        announced = true
        setMapInstance(map)
        onMapInitializedRef.current?.(map)
      }
      montado.desengancharEstilo = () => map.off("styledata", announceWhenStyleReady)

      map.on("styledata", announceWhenStyleReady)
      // Por si el estilo ya estaba listo antes de suscribirse.
      announceWhenStyleReady()

      // Solo en desarrollo: deja el mapa a mano en la consola del navegador para
      // poder preguntarle cosas (`__mapa.getZoom()`, `__mapa.getStyle()`) sin
      // tener que instrumentar el código cada vez. En la versión publicada no
      // existe, porque `next build` elimina esta rama entera.
      if (process.env.NODE_ENV === "development") {
        window.__mapa = map
      }
    }

    const dejarDeEsperar = whenSized(containerRef.current, construir)

    return () => {
      dejarDeEsperar()
      montado.desengancharEstilo?.()
      montado.mapa?.remove()
      mapRef.current = null
      // Sin esto los hooks siguen viendo un mapa ya destruido y revientan en la
      // siguiente llamada. Es la misma trampa que documenta el visor Leaflet.
      setMapInstance(null)
    }
  }, [])

  return (
    <div ref={splitContainerRef} className="relative h-full w-full overflow-hidden flex select-none">
      {/* Vista Mapa Izquierda (MapLibre 2D/3D) */}
      <div
        className="relative h-full overflow-hidden"
        style={{ width: blockModelOpen ? `${splitRatio * 100}%` : "100%" }}
      >
        <div
          ref={containerRef}
          className={`absolute inset-0 h-full w-full z-0 ${is3D ? "mode-3d" : "mode-2d"}`}
        />
        <div
          className="pointer-events-none absolute inset-0 z-[1] h-full w-full"
          style={{
            mixBlendMode: blendMode === "multiply" ? "multiply" : "normal",
            display: hasActiveOverlayLayers ? "block" : "none",
          }}
        >
          <div ref={overlayContainerRef} className="h-full w-full" />
        </div>

        {/* Capa interactiva para dibujar el rectángulo del bloque 3D */}
        {isDrawingBox && (
          <div
            onWheel={(e) => {
              // Permitir al usuario hacer zoom libre con la rueda del ratón antes o durante la selección
              const canvas = mapRef.current?.getCanvas()
              if (canvas) {
                canvas.dispatchEvent(new WheelEvent("wheel", e.nativeEvent))
              }
            }}
            onPointerDown={handleBoxPointerDown}
            onPointerMove={handleBoxPointerMove}
            onPointerUp={handleBoxPointerUp}
            className="absolute inset-0 z-30 cursor-crosshair select-none touch-none bg-black/15"
          >
            {boxDragStart && boxDragCurrent && (
              <div
                className="absolute border-2 border-emerald-400 bg-emerald-500/25 rounded shadow-[0_0_20px_rgba(16,185,129,0.4)] pointer-events-none"
                style={{
                  left: Math.min(boxDragStart.x, boxDragCurrent.x),
                  top: Math.min(boxDragStart.y, boxDragCurrent.y),
                  width: Math.abs(boxDragCurrent.x - boxDragStart.x),
                  height: Math.abs(boxDragCurrent.y - boxDragStart.y),
                }}
              />
            )}
          </div>
        )}

        {/* CONTROLES DEL MAPA (FIJOS AL VISOR IZQUIERDO) */}
        <div className="pointer-events-none absolute inset-0 z-40 overflow-hidden">



      {/* Los controles del mapa van todos a la derecha y el panel de consulta se
          queda con la izquierda entera. Estaban los dos a la izquierda y se
          estorbaban: al crecer el panel, su fila de botones acababa por debajo
          de esta columna, que al estar encima se comía los clics. Separarlos por
          lados quita el problema de raíz en vez de ir ajustando alturas. */}
      {/* bottom-10 y no bottom-4: en esa esquina va la atribución de
          OpenStreetMap, que las condiciones de uso obligan a mostrar, y el
          último botón se le montaba encima. */}
      <div
        // En el teléfono, con la hoja de capas abierta esta columna quedaba
        // encima de ella: los botones del mapa flotando sobre las filas del
        // panel, tapando justo la lupa y el filtro. Mientras la hoja está
        // abierta, la columna se aparta; en escritorio no hay conflicto porque
        // el panel vive al otro lado.
        // Dos columnas, no una: a la izquierda los paneles que se arrastran, a
        // la derecha los botones. Antes los paneles iban dentro de la columna,
        // encima de los botones, y con el de 3D abierto la columna crecía hacia
        // arriba y empujaba todo. Al costado quedan al lado de lo que los
        // gobierna y sin desplazar nada.
        //
        // Alineado abajo (`items-end`) para que el panel salga a la altura del
        // último botón y no flotando a media pantalla.
        className={`pointer-events-auto absolute bottom-16 right-2 z-10 items-end gap-2 md:bottom-10 md:right-4 ${
          panelOpen ? "hidden md:flex" : "flex"
        }`}
      >
        <div className="flex flex-col items-end gap-2">
          {/* Las herramientas de dibujo. Panel flotante y no ventana anclada:
              se usan mientras se mira el mapa, y una ventana que se cierra al
              primer clic fuera obligaba a reabrirla para cambiar de herramienta
              o de color. Su equis lo cierra del todo —no lo guarda en un botón
              como el de 3D— porque para volver ya está el botón «Dibujo». */}
          {dibujoAbierto && (
            <FloatingPanel
              title="Dibujo y medidas"
              icon={PencilRuler}
              collapsible={false}
              compact={dibujoCompacto}
              onRequestClose={() => setDibujoAbierto(false)}
              // Recoger deja solo los iconos. Cuando ya se sabe cuál es cuál,
              // los nombres y las medidas ocupan sitio sobre el mapa sin
              // aportar nada; y quien todavía no lo sabe, los despliega.
              headerAction={
                <button
                  type="button"
                  onClick={() => setDibujoCompacto((compacto) => !compacto)}
                  aria-expanded={!dibujoCompacto}
                  aria-label={dibujoCompacto ? "Desplegar las herramientas" : "Recoger las herramientas"}
                  title={dibujoCompacto ? "Desplegar" : "Recoger a solo iconos"}
                  className="rounded p-0.5 text-slate-400 transition-colors hover:bg-slate-200 hover:text-slate-700"
                >
                  <ChevronLeft
                    className={`h-3.5 w-3.5 transition-transform ${dibujoCompacto ? "rotate-180" : ""}`}
                  />
                </button>
              }
            >
              <DrawToolbar
                compact={dibujoCompacto}
                mode={mode}
                startMode={startMode}
                deleteSelected={deleteSelected}
                drawingColor={drawingColor}
                onColorChange={handleColorChange}
                hasSelection={selectedIds.length > 0}
                summary={drawSummary}
              />
            </FloatingPanel>
          )}

          {/* 250 px es mucho en un celular y poco en un monitor grande. */}
          {isCompassActive && (
            <div className="rounded-xl border border-zinc-800 bg-[#09090b]/95 px-3 py-2 text-zinc-100 shadow-2xl backdrop-blur-2xl">
              <SliderRow
                id="tamano-brujula"
                label="Brújula"
                min={COMPASS_SIZE_MIN}
                max={COMPASS_SIZE_MAX}
                step="10"
                value={compassSize}
                display={`${compassSize} px`}
                onChange={(value) => changeCompassSize(Math.round(value))}
              />
            </div>
          )}
        </div>

        <div className="flex flex-col items-end space-y-2">
        {/* Ajustes de cómo se ve el mapa. Van encima de los botones de acción,
            en la misma columna, y cada uno solo aparece cuando hay algo que
            ajustar: un control que no hace nada visible confunde más que ayuda. */}
        {terrainMode && (
          <TerrainRasterLegend
            mode={terrainMode}
            unavailable={terrainRasterUnavailable}
            progress={terrainRasterProgress}
            cellSize={terrainRasterCellSize}
          />
        )}

        {queryingTerrain && (
          <TerrainQuery result={terrainResult} onClose={toggleTerrainQuery} />
        )}

        {/* La leyenda y la ficha de capas ráster (Geología SGC e Hidrocarburos ANH).
            Aparece sola al encender una capa y desaparece al apagarla. */}
        <SgcPanel
          activeKeys={activeRasterKeys(layerState)}
          subLayers={{ ...sgcSubLayers, ...anhSubLayers }}
          chosenSub={{ ...sgcChosenSub, ...anhChosenSub }}
          legends={{ ...sgcLegends, ...anhLegends }}
          featureInfo={
            (sgcFeatureInfo?.loading || sgcFeatureInfo?.consultando || anhFeatureInfo?.loading || anhFeatureInfo?.consultando)
              ? {
                  lngLat: sgcFeatureInfo?.lngLat || anhFeatureInfo?.lngLat,
                  loading: true,
                  consultando: true,
                  results: [],
                  resultados: [],
                }
              : (sgcFeatureInfo || anhFeatureInfo)
                ? {
                    lngLat: sgcFeatureInfo?.lngLat || anhFeatureInfo?.lngLat,
                    loading: false,
                    consultando: false,
                    results: [
                      ...(sgcFeatureInfo?.results || sgcFeatureInfo?.resultados || []),
                      ...(anhFeatureInfo?.results || anhFeatureInfo?.resultados || []),
                    ],
                    resultados: [
                      ...(sgcFeatureInfo?.results || sgcFeatureInfo?.resultados || []),
                      ...(anhFeatureInfo?.results || anhFeatureInfo?.resultados || []),
                    ],
                  }
                : null
          }
          fieldInfo={sgcFieldInfo}
          onDismiss={() => {
            clearSgcFeatureInfo()
            clearAnhFeatureInfo()
          }}
          onCargarPlancha={(datos) => {
            clearSgcFeatureInfo()
            clearAnhFeatureInfo()
            cargarPlancha(datos)
          }}
        />

        {/* La plancha geológica del SGC, ya colocada. Su panel sale al pedirla y
            se va al quitarla, como la ficha de arriba. */}
        <PlanchaPanel
          plancha={plancha}
          opacity={planchaOpacity}
          onOpacity={setPlanchaOpacity}
          onEncuadrar={encuadrarPlancha}
          onQuitar={quitarPlancha}
        />

        {/* La función diferenciadora: dibujar un polígono y salir con los
            archivos de las capas encendidas dentro de esa área. Va en la columna
            de acciones del mapa y no en el panel de dibujo, para que se vea sin
            abrirlo; solo aparece cuando hay un área dibujada. */}
        {hasArea && (
          <MapButton
            onClick={downloadArea}
            disabled={isDownloading}
            icon={isDownloading ? Loader2 : Download}
            title="Descargar en un ZIP las capas encendidas dentro del área dibujada"
            className={`!border-emerald-700 !bg-emerald-600 !text-white hover:!bg-emerald-700 disabled:opacity-60 ${
              isDownloading ? "[&_svg]:animate-spin" : ""
            }`}
          >
            {isDownloading ? "Preparando…" : "Descargar área"}
          </MapButton>
        )}

        {/* Controles de navegación y HUD unificados del mapa */}
        <div className="flex flex-col items-end gap-2">
          {/* Botón Bloque 3D del Terreno */}
          <button
            type="button"
            onClick={() => {
              if (blockModelOpen) {
                setBlockModelOpen(false)
                requestAnimationFrame(() => {
                  mapRef.current?.resize()
                  overlayMapRef.current?.resize()
                })
              } else {
                if (selectedRectangle) {
                  setBlockModelOpen(true)
                  requestAnimationFrame(() => {
                    mapRef.current?.resize()
                    overlayMapRef.current?.resize()
                  })
                } else {
                  handleStartDrawBox()
                }
              }
            }}
            title={
              blockModelOpen
                ? "Cerrar bloque 3D del terreno"
                : isDrawingBox
                ? "Dibujando rectángulo sobre el mapa..."
                : "Generar bloque 3D del terreno (dibuja un rectángulo)"
            }
            aria-label="Bloque 3D del terreno"
            aria-expanded={blockModelOpen}
            className={`flex h-10 w-10 items-center justify-center rounded-2xl border shadow-2xl backdrop-blur-2xl transition-all ${
              blockModelOpen || isDrawingBox
                ? "border-emerald-500/60 bg-emerald-950/40 text-emerald-300 shadow-md"
                : "border-zinc-800/90 bg-[#09090b]/90 text-zinc-300 hover:bg-zinc-800 hover:text-white"
            }`}
          >
            <Boxes className="h-4.5 w-4.5" />
          </button>

          {/* Botón Análisis de Terreno */}
          <div
            ref={terrainContainerRef}
            onMouseEnter={handleTerrainMouseEnter}
            onMouseLeave={handleTerrainMouseLeave}
            className="relative"
          >
            <button
              ref={terrainBtnRef}
              type="button"
              onClick={() => {
                if (terrainLeaveTimerRef.current) {
                  clearTimeout(terrainLeaveTimerRef.current)
                  terrainLeaveTimerRef.current = null
                }
                setTerrainOpen((v) => !v)
              }}
              title="Análisis de terreno (pendiente, orientación, corte topográfico, cota)"
              aria-label="Análisis de terreno"
              aria-expanded={terrainOpen}
              className={`flex h-10 w-10 items-center justify-center rounded-2xl border shadow-2xl backdrop-blur-2xl transition-all ${
                terrainOpen || Boolean(terrainMode) || profileActive || queryingTerrain
                  ? "border-emerald-500/60 bg-emerald-950/40 text-emerald-300 shadow-md"
                  : "border-zinc-800/90 bg-[#09090b]/90 text-zinc-300 hover:bg-zinc-800 hover:text-white"
              }`}
            >
              <Mountain className="h-4.5 w-4.5" />
            </button>
            <div
              className={`absolute right-full mr-3 bottom-0 z-30 origin-bottom-right transition-all duration-200 ease-out ${
                terrainOpen
                  ? "scale-100 opacity-100 translate-x-0 pointer-events-auto"
                  : "scale-75 opacity-0 translate-x-4 pointer-events-none"
              }`}
            >
              <TerrainMenu
                terrainMode={terrainMode}
                onChooseTerrainMode={chooseTerrainMode}
                profileActive={profileActive}
                onToggleProfile={toggleProfile}
                queryingTerrain={queryingTerrain}
                onToggleQuery={toggleTerrainQuery}
                onClose={() => setTerrainOpen(false)}
              />
            </div>
          </div>

          {/* Botón Mapa Base */}
          <div
            ref={basemapContainerRef}
            onMouseEnter={handleBasemapMouseEnter}
            onMouseLeave={handleBasemapMouseLeave}
            className="relative"
          >
            <button
              ref={basemapBtnRef}
              type="button"
              onClick={() => {
                if (basemapLeaveTimerRef.current) {
                  clearTimeout(basemapLeaveTimerRef.current)
                  basemapLeaveTimerRef.current = null
                }
                setBasemapOpen((v) => !v)
              }}
              title="Cambiar mapa base (6 estilos disponibles)"
              aria-label="Mapa base"
              aria-expanded={basemapOpen}
              className={`flex h-10 w-10 items-center justify-center rounded-2xl border shadow-2xl backdrop-blur-2xl transition-all ${
                basemapOpen
                  ? "border-white/40 bg-zinc-800 text-white"
                  : "border-zinc-800/90 bg-[#09090b]/90 text-zinc-300 hover:bg-zinc-800 hover:text-white"
              }`}
            >
              <MapIcon className="h-4.5 w-4.5" />
            </button>
            <div
              className={`absolute right-full mr-3 bottom-0 z-30 origin-bottom-right transition-all duration-200 ease-out ${
                basemapOpen
                  ? "scale-100 opacity-100 translate-x-0 pointer-events-auto"
                  : "scale-75 opacity-0 translate-x-4 pointer-events-none"
              }`}
            >
              <BasemapPicker
                current={basemap}
                showLabels={showLabels}
                onChoose={(id) => {
                  chooseBasemap(id)
                }}
                onClose={() => setBasemapOpen(false)}
              />
            </div>
          </div>

          {/* Botón GPS */}
          <button
            type="button"
            onClick={handleLocateUser}
            title={isLocating ? "Ubicando…" : hasLocated ? "Ubicación GPS activa" : "Activar GPS"}
            aria-label="Ubicación GPS"
            className={`flex h-10 w-10 items-center justify-center rounded-2xl border border-zinc-800/90 bg-[#09090b]/90 shadow-2xl backdrop-blur-2xl transition-all ${
              hasLocated
                ? "border-emerald-600/60 bg-emerald-950/40 text-emerald-300"
                : "text-zinc-300 hover:bg-zinc-800 hover:text-white"
            }`}
          >
            <Crosshair className={`h-4.5 w-4.5 ${isLocating ? "animate-spin" : ""}`} />
          </button>

          {/* MapHUD: Norte, Zoom +, Zoom -, 3D y Popover de opciones 3D */}
          <div
            ref={hud3DContainerRef}
            onMouseEnter={handleHud3DMouseEnter}
            onMouseLeave={handleHud3DMouseLeave}
            className="relative flex items-center"
          >
            {is3D && (
              <div
                className={`absolute right-full mr-3 bottom-0 z-30 max-h-[calc(100vh-5rem)] overflow-y-auto origin-bottom-right transition-all duration-200 ease-out ${
                  hud3DOpen
                    ? "scale-100 opacity-100 translate-x-0 pointer-events-auto"
                    : "scale-75 opacity-0 translate-x-4 pointer-events-none"
                }`}
              >
                <Hud3DPopover
                  pitch={pitch}
                  exaggeration={exaggeration}
                  bearing={bearing}
                  isSpinning={isSpinning}
                  isPinned={is3DPinned}
                  onTogglePin={() => setIs3DPinned((p) => !p)}
                  onToggleSpin={spin}
                  onChangePitch={changePitch}
                  onChangeExaggeration={changeExaggeration}
                  onChangeBearing={changeBearing}
                  onRotateBy={(delta) => {
                    if (!mapRef.current) return
                    const current = mapRef.current.getBearing()
                    mapRef.current.easeTo({
                      bearing: current + delta,
                      duration: 600,
                      easing: (t) => t * (2 - t),
                    })
                  }}
                  onResetNorth={resetNorth}
                  onClose={() => setHud3DOpen(false)}
                  onMouseEnter={handleHud3DMouseEnter}
                  onMouseLeave={handleHud3DMouseLeave}
                />
              </div>
            )}
            <MapHUD
              bearing={bearing}
              is3D={is3D}
              hud3DOpen={hud3DOpen}
              onResetNorth={resetNorth}
              onZoomIn={() => mapRef.current?.zoomIn?.({ duration: 300 })}
              onZoomOut={() => mapRef.current?.zoomOut?.({ duration: 300 })}
              onMouseEnter3D={handleHud3DMouseEnter}
              onToggle3D={() => {
                if (!is3D) {
                  toggle3D()
                  setHud3DOpen(true)
                } else {
                  if (!hud3DOpen) {
                    setHud3DOpen(true)
                  } else {
                    toggle3D()
                    setHud3DOpen(false)
                  }
                }
              }}
            />
          </div>
        </div>
        </div>
      </div>

      {/* La caja de escribir coordenadas acompaña a la herramienta de punto: es
          la otra forma de hacer lo mismo. */}
      {mode === "draw_point" && (
        <CoordinateEntry
          crsId={coordinateSystem}
          onGo={(lon, lat) => {
            addPointAt([lon, lat])
            mapRef.current?.flyTo({ center: [lon, lat], zoom: 16, duration: 1200 })
          }}
        />
      )}

      <CursorCoordinates map={mapInstance} crsId={coordinateSystem} />

      {/* Banner de instrucción para dibujar el rectángulo del bloque 3D */}
      {isDrawingBox && (
        <div className="pointer-events-auto fixed top-20 left-1/2 -translate-x-1/2 z-40 flex items-center gap-3 rounded-full border border-emerald-500/50 bg-[#09090b]/95 px-5 py-2.5 text-xs sm:text-sm font-medium text-emerald-300 shadow-2xl backdrop-blur-2xl animate-in fade-in slide-in-from-top-4">
          <Square className="h-4 w-4 text-emerald-400 shrink-0" />
          <span>Haz clic y arrastra sobre el mapa para definir el área del bloque 3D</span>
          <button
            type="button"
            onClick={() => {
              setIsDrawingBox(false)
              setBoxDragStart(null)
              setBoxDragCurrent(null)
            }}
            className="ml-2 rounded-full p-1 text-zinc-400 hover:bg-zinc-800 hover:text-white transition-colors"
            title="Cancelar selección"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      )}

      {showRotateHint && <RotateHint onClose={hideRotateHint} />}

      {exportandoImagen && (
        <ImageExport
          map={mapInstance}
          overlayMap={overlayMapInstance}
          blendMode={blendMode}
          hasActiveOverlayLayers={hasActiveOverlayLayers}
          crs={crsById(coordinateSystem)}
          layerNames={[
            ...ANM_LAYERS.filter(({ key }) => layerState[key]?.on).map((l) => l.label),
            ...SGC_LAYERS.filter(({ key }) => layerState[key]?.on).map((l) => l.label),
            ...ANH_LAYERS.filter(({ key }) => layerState[key]?.on).map((l) => l.label),
            ...(plancha?.canvas ? [plancha.titulo || "Plancha Geológica"] : []),
          ]}
          sources={[
            "Agencia Nacional de Minería",
            SGC_LAYERS.some(({ key }) => layerState[key]?.on) ? "Servicio Geológico Colombiano" : null,
            ANH_LAYERS.some(({ key }) => layerState[key]?.on) ? "Agencia Nacional de Hidrocarburos" : null,
            basemapById(basemap).source,
          ].filter(Boolean)}
          onClose={() => setExportandoImagen(false)}
        />
      )}



      {/* El perfil ocupa el ancho de la pantalla, no la columna de la derecha:
          es una gráfica de distancia, y en una columna de 256 px un recorrido de
          tres kilómetros no se lee. Va abajo, sobre la barra de escala, y deja
          libre el lado izquierdo por si el panel de capas está abierto. */}
      {profileActive && (
        <div className="pointer-events-none absolute bottom-16 left-2 right-2 z-20 md:bottom-10 md:left-auto md:right-4 md:w-[min(46rem,calc(100%-26rem))]">
          <TerrainProfile
            profile={profile}
            hovered={profileHover}
            onHover={onProfileHover}
            onClose={toggleProfile}
          />
        </div>
      )}

      {/* Los avisos van apilados en una sola columna centrada abajo. Estaban
          sueltos en dos alturas fijas, y cuando salían los dos a la vez, uno se
          montaba sobre la lectura del cursor. */}
      <div className="pointer-events-none absolute bottom-32 left-1/2 z-10 flex w-[min(30rem,calc(100%-2rem))] -translate-x-1/2 flex-col items-center gap-2 md:bottom-24">
        {terrainError && (
          <div className="pointer-events-auto">
            <MapNotice tone="warning" icon={Mountain} onClose={dismissTerrainError}>
              {terrainError}
            </MapNotice>
          </div>
        )}

        {showZoomInHint && (
          <MapNotice icon={Layers}>Acerca el mapa para ver las capas de títulos y solicitudes</MapNotice>
        )}

        {/* ArcGIS recorta la respuesta sin decirlo. Sin este aviso, el usuario
            creería estar viendo todos los títulos del área y podría sacar
            conclusiones sobre una zona a partir de datos incompletos. */}
        {truncatedLayers.length > 0 && (
          <MapNotice tone="warning">
            Hay más polígonos de los que caben en una consulta ({truncatedLayers.join(", ")}). Acerca
            el mapa para verlos todos.
          </MapNotice>
        )}
      </div>

      {error && showErrorBanner && (
        <div className="absolute top-0 left-0 right-0 bg-red-500 text-white p-2 z-10 flex items-center justify-between gap-2 pointer-events-auto">
          <span className="text-sm">{error}</span>
          <button
            type="button"
            onClick={() => setShowErrorBanner(false)}
            className="px-2 py-1 text-xs font-semibold bg-red-700 rounded hover:bg-red-800"
          >
            Cerrar
          </button>
        </div>
      )}
        </div>
      </div>

      {/* Divisor Arrastrable (Split Divider) */}
      {blockModelOpen && (
        <div
          onPointerDown={handleSplitPointerDown}
          onPointerMove={handleSplitPointerMove}
          onPointerUp={handleSplitPointerUp}
          className="relative w-2 bg-zinc-950 border-x border-zinc-800 hover:border-emerald-500 cursor-col-resize flex items-center justify-center transition-colors z-30 select-none touch-none group shrink-0"
          title="Arrastrar para ajustar la división de pantalla"
        >
          <div className="absolute w-5 h-10 rounded-full bg-zinc-800 border border-zinc-700 group-hover:border-emerald-500 flex items-center justify-center shadow-lg transition-colors">
            <GripVertical className="h-3.5 w-3.5 text-zinc-400 group-hover:text-emerald-300" />
          </div>
        </div>
      )}

      {/* Vista Bloque 3D del Terreno Derecha */}
      {blockModelOpen && (
        <div
          className="relative h-full overflow-hidden shrink-0"
          style={{ width: `${(1 - splitRatio) * 100}%` }}
        >
          <BlockModel3D
            isOpen={blockModelOpen}
            onClose={() => {
              setBlockModelOpen(false)
              requestAnimationFrame(() => {
                mapRef.current?.resize()
                overlayMapRef.current?.resize()
              })
            }}
            rectangle={selectedRectangle}
            elevationAt={elevationAt}
            map={mapRef.current}
            basemap={basemap}
            onRedrawRectangle={handleStartDrawBox}
            expedientCode={expedientCode}
            isMaximized={splitRatio <= 0.05}
            onToggleMaximize={() => {
              setSplitRatio((r) => (r <= 0.05 ? 0.5 : 0.02))
              requestAnimationFrame(() => {
                mapRef.current?.resize()
                overlayMapRef.current?.resize()
              })
            }}
          />
        </div>
      )}

      <style jsx global>{`
        /* Mismas etiquetas que el visor Leaflet: texto blanco con contorno negro,
           que es lo único legible tanto sobre el mapa claro como sobre satélite. */
        .map-label {
          background: none !important;
          border: none !important;
          box-shadow: none !important;
          pointer-events: none;
        }
        /* En 2D: Rótulos limpios con halo cartográfico nítido sin cuadrado negro */
        .mode-2d .map-label div {
          font-size: 11px;
          font-weight: 700;
          letter-spacing: 0.02em;
          color: #ffffff;
          background: transparent !important;
          border: none !important;
          border-radius: 0 !important;
          box-shadow: none !important;
          backdrop-filter: none !important;
          -webkit-backdrop-filter: none !important;
          padding: 0 !important;
          text-shadow:
            -1px -1px 0 #000000,
             1px -1px 0 #000000,
            -1px  1px 0 #000000,
             1px  1px 0 #000000,
             0    2px 4px rgba(0, 0, 0, 0.95);
          white-space: nowrap;
        }
        /* En 3D: Chip flotante con efecto cristal y borde sutil */
        .mode-3d .map-label div {
          font-size: 11px;
          font-weight: 600;
          letter-spacing: 0.02em;
          color: #f4f4f5;
          background: rgba(9, 9, 11, 0.88);
          border: 1px solid rgba(63, 63, 70, 0.8);
          border-radius: 6px;
          padding: 2px 7px;
          box-shadow: 0 4px 12px rgba(0, 0, 0, 0.6);
          backdrop-filter: blur(8px);
          -webkit-backdrop-filter: blur(8px);
          white-space: nowrap;
        }
        .maplibregl-popup-content {
          background: rgba(9, 9, 11, 0.95) !important;
          color: #f4f4f5 !important;
          font-size: 12px !important;
          line-height: 1.4 !important;
          border-radius: 16px !important;
          border: 1px solid rgba(39, 39, 42, 0.8) !important;
          box-shadow: 0 20px 45px -8px rgba(0, 0, 0, 0.85) !important;
          backdrop-filter: blur(16px) !important;
          -webkit-backdrop-filter: blur(16px) !important;
          max-height: 420px;
          overflow-y: auto;
          padding: 14px 16px !important;
        }
        .popup-header-bar {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 8px;
          margin-bottom: 6px;
          padding-bottom: 6px;
          border-bottom: 1px solid rgba(63, 63, 70, 0.5);
        }
        .popup-type-badge {
          display: inline-flex;
          align-items: center;
          padding: 2px 8px;
          border-radius: 9999px;
          font-size: 10px;
          font-weight: 600;
          background: rgba(16, 185, 129, 0.12);
          color: #6ee7b7;
          border: 1px solid rgba(16, 185, 129, 0.25);
          letter-spacing: 0.02em;
        }
        .popup-code-title {
          font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
          font-size: 11px;
          font-weight: 700;
          color: #e4e4e7;
        }
        .maplibregl-popup-content h3 {
          font-size: 12px !important;
          font-weight: 600 !important;
          letter-spacing: 0.04em;
          text-transform: uppercase;
          color: #a1a1aa !important;
          margin-bottom: 6px !important;
          margin-top: 2px !important;
        }
        /* Un filete tenue entre dato y dato con alto contraste y legibilidad */
        .maplibregl-popup-content p {
          display: flex;
          justify-content: space-between;
          align-items: baseline;
          gap: 10px;
          margin: 0;
          padding: 4px 0 !important;
          border-bottom: 1px solid rgba(39, 39, 42, 0.4) !important;
          color: #f4f4f5 !important;
          font-size: 11.5px !important;
        }
        .maplibregl-popup-content .popup-row-na {
          opacity: 0.4;
        }
        .maplibregl-popup-content p:last-child {
          border-bottom: none !important;
          padding-bottom: 0 !important;
        }
        .maplibregl-popup-tip {
          border-top-color: rgba(9, 9, 11, 0.95) !important;
          border-bottom-color: rgba(9, 9, 11, 0.95) !important;
        }
        .maplibregl-popup-close-button {
          color: #a1a1aa !important;
          padding: 4px 8px !important;
          font-size: 16px !important;
          border-radius: 8px !important;
          transition: color 0.15s, background 0.15s;
        }
        .maplibregl-popup-close-button:hover {
          color: #ffffff !important;
          background: rgba(255, 255, 255, 0.1) !important;
        }
        @media (pointer: coarse) {
          .maplibregl-popup-close-button {
            width: 40px;
            height: 40px;
            font-size: 20px;
            line-height: 40px;
          }
        }
        .maplibregl-popup-content p strong {
          font-weight: 600 !important;
          color: #a1a1aa !important;
        }
        /* Esta regla estaba puesta sobre todos los globos y era la causa de que
           la ficha de un expediente saliera con un renglón en blanco entre cada
           dato: el HTML de la ficha se arma con una plantilla de texto, que trae
           un salto de línea y su sangría entre etiqueta y etiqueta, y con
           pre-line esos saltos se dibujan como líneas de verdad. La ficha medía
           casi el doble de lo que decía.

           La necesita solo el globo de un vértice, cuyo texto sí lleva saltos
           deliberados, así que ahora va contra su clase y no contra todos. */
        .maplibregl-popup.popup-vertice .maplibregl-popup-content {
          white-space: pre-line;
        }
        /* La medida de una figura dibujada se distingue de las etiquetas de
           expediente: fondo oscuro en vez de texto con contorno, porque es un
           dato calculado y no un rótulo del mapa. */
        /* El punto del mapa que sigue al puntero de la gráfica del perfil.
           Con halo blanco por lo mismo que los vértices dibujados: sobre una
           imagen de satélite, un punto de color sin halo desaparece. */
        .profile-cursor {
          width: 14px;
          height: 14px;
          border-radius: 9999px;
          background: #3D5A80;
          border: 3px solid #ffffff;
          box-shadow: 0 1px 4px rgba(15, 23, 42, 0.45);
          pointer-events: none;
        }
        .map-label.draw-measure div {
          background: rgba(17, 24, 39, 0.85);
          color: #ffffff;
          border-radius: 4px;
          padding: 2px 6px;
          font-size: 12px;
          text-shadow: none;
        }
        /* Los botones de zoom y la brújula vienen de fábrica a 29 px, que con
           un trackpad es incómodo de acertar —sobre todo la brújula, que además
           hay que arrastrar—. A 36 px se pulsan sin apuntar. Los controles
           grandes de giro e inclinación viven aparte, en el panel del 3D. */
        .maplibregl-ctrl-group button {
          width: 36px;
          height: 36px;
        }
        .maplibregl-ctrl-group button .maplibregl-ctrl-icon {
          background-size: 22px 22px;
        }
        /* mapbox-gl-draw le pone estas clases al contenedor del mapa para
           cambiar el cursor, pero su CSS las escribe contra .mapboxgl-map, que
           en MapLibre se llama .maplibregl-map. Sin estas reglas el cursor no
           cambia nunca y no hay señal de que el mapa está en modo dibujo.
           (Ojo: nada de comillas invertidas dentro de este bloque; el CSS vive
           en una plantilla de texto delimitada por ese mismo carácter, así que
           una sola la cierra antes de tiempo. El compilador falla sin decir
           dónde.) */
        .maplibregl-map.mouse-add .maplibregl-canvas-container {
          cursor: crosshair;
        }
        .maplibregl-map.mouse-pointer .maplibregl-canvas-container {
          cursor: pointer;
        }
        .maplibregl-map.mouse-move .maplibregl-canvas-container {
          cursor: move;
        }
        /* Marcador de GPS y brújula. Mismo aspecto que en el visor Leaflet: el
           punto azul con su pulso, y la rosa de los vientos cuando la brújula
           está activa. La aguja la rota useGeolocationGL por estilo en línea. */
        .gps-compass-marker {
          background: transparent;
          border: none;
        }
        .gps-compass__ring {
          position: relative;
          border-radius: 9999px;
          background: transparent;
        }
        .gps-compass__dot {
          position: absolute;
          width: 16px;
          height: 16px;
          border-radius: 9999px;
          transform: translate(-50%, -50%);
          background: #007aff;
          border: 3px solid #ffffff;
          box-shadow: 0 0 6px rgba(0, 0, 0, 0.3);
          z-index: 3;
        }
        /* La lectura del rumbo, dentro de la rosa. Fondo oscuro y sólido en vez
           de texto con contorno: es un dato que se consulta, no un rótulo del
           mapa, y sobre una imagen de satélite el contorno no basta. */
        .gps-compass__lectura {
          position: absolute;
          left: 50%;
          transform: translateX(-50%);
          padding: 3px 10px;
          border-radius: 9999px;
          background: rgba(15, 23, 42, 0.82);
          color: #ffffff;
          font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
          font-weight: 600;
          letter-spacing: 0.04em;
          white-space: nowrap;
          pointer-events: none;
          z-index: 4;
        }
        .gps-compass__pulse {
          position: absolute;
          width: 60px;
          height: 60px;
          border-radius: 9999px;
          transform: translate(-50%, -50%);
          background: rgba(0, 122, 255, 0.2);
          animation: gps-pulse 2.5s ease-out infinite;
          z-index: 1;
        }
        @keyframes gps-pulse {
          0% {
            transform: translate(-50%, -50%) scale(0.3);
            opacity: 1;
          }
          100% {
            transform: translate(-50%, -50%) scale(1.5);
            opacity: 0;
          }
        }
      `}</style>
    </div>
  )
}
