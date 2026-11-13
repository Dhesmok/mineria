"use client"

import { Fragment, useState, useEffect, useCallback, useMemo, useRef } from "react"
import dynamic from "next/dynamic"
import { Button } from "@/components/ui/button"
import { Table, TableHeader, TableRow, TableHead, TableBody, TableCell } from "@/components/ui/table"
import {
  ChevronRight,
  PanelLeftClose,
  PanelLeftOpen,
  Search,
  X,
  Loader2,
  Download,
  Table as TableIcon,
  Globe2,
  ChevronDown,
  Spline,
  Square,
  Trash2,
  Linkedin,
  Crosshair,
  MapPin,
  Image as ImageIcon,
} from "lucide-react"
import ExportComponent from "./ExportComponent"
import { axisLabels, crsById, formatCoordinate, fromGeographic, SOURCE_CRS } from "./utils/crs"
import { areaById, DEFAULT_ORDER, initialLayerState, layerByKey } from "./utils/themeAreas"
import { LayerPanel } from "./components/LayerPanel"
import { AreaFilters } from "./components/AreaFilters"
import { AttributeTable } from "./components/AttributeTable"
import { CrsPicker } from "./components/CrsPicker"
import { ExpedientSearch, queryExpedientSuggestions } from "./components/ExpedientSearch"
import { OfflineIndicator } from "./components/OfflineIndicator"
import { MobileBottomBar } from "./components/MobileBottomBar"
import { MobileBottomSheet } from "./components/MobileBottomSheet"
import { MobileStorageManager } from "./components/MobileStorageManager"
import { matchesFilters } from "./utils/layerFilters"
import { useUserLayers } from "./hooks/useUserLayers"
import { readPreferences, writePreferences } from "./utils/preferences"
import { debounce } from "@/lib/utils"
import {
  PANEL_HEIGHT_DEFAULT,
  PANEL_WIDTH_DEFAULT,
  fitPanelToViewport,
} from "./utils/panelSize"

// `ssr: false` es obligatorio: MapLibre necesita el objeto `window` y una
// tarjeta gráfica, y ninguno de los dos existe cuando Next genera la página en
// el servidor.
const MapComponent = dynamic(() => import("./MapComponentGL"), {
  ssr: false,
  loading: () => <p className="text-label-3 p-4 text-sm">Cargando mapa...</p>,
})

export default function Component() {
  // La barra lateral arranca abierta y se recoge con su botón. Antes se abría
  // al pasar el ratón por un riel negro de dos iconos: se desplegaba sola al
  // cruzar hacia el mapa, se cerraba al ir a usar un menú que salía fuera de
  // ella, y no había forma de saber que estaba ahí sin tropezar con ella.
  const [sidebarOpen, setSidebarOpen] = useState(true)
  const [drawerTab, setDrawerTab] = useState("capas")
  const [showTable, setShowTable] = useState(false)
  const [coordinates, setCoordinates] = useState([])
  const [coordinateRings, setCoordinateRings] = useState([])
  const [transformedCoordinates, setTransformedCoordinates] = useState([])
  const [showToggle, setShowToggle] = useState(false)
  const [showExportModal, setShowExportModal] = useState(false)
  const [selectedCoordinateSystem, setSelectedCoordinateSystem] = useState(SOURCE_CRS)
  const [expedientCode, setExpedientCode] = useState("")
  const [searchTrigger, setSearchTrigger] = useState(0)
  const [coordinatesAvailable, setCoordinatesAvailable] = useState(false)
  const [geoJsonData, setGeoJsonData] = useState(null)
  const mapRef = useRef(null)
  const [, setMapInitialized] = useState(false)
  const [layers, setLayers] = useState(initialLayerState)
  const [layerOrder, setLayerOrder] = useState(DEFAULT_ORDER)
  const [areaFilters, setAreaFilters] = useState({})
  const [filterScope, setFilterScope] = useState("viewport")
  const [layerData, setLayerData] = useState({ features: [], truncated: [] })
  const [sgcState, setSgcState] = useState({})
  const [panelWidth, setPanelWidth] = useState(PANEL_WIDTH_DEFAULT)
  const [panelHeight, setPanelHeight] = useState(PANEL_HEIGHT_DEFAULT)
  const panelRef = useRef(null)

  // Buscador modo isla (inferior)
  const [islandSearchText, setIslandSearchText] = useState("")
  const [islandSuggestions, setIslandSuggestions] = useState([])
  const [islandLoading, setIslandLoading] = useState(false)
  const [islandResultsOpen, setIslandResultsOpen] = useState(false)
  const [islandSelectedIndex, setIslandSelectedIndex] = useState(-1)
  const islandAbortRef = useRef(null)
  const islandInputRef = useRef(null)

  // Ventanas flotantes
  const [filterPopover, setFilterPopover] = useState(null)
  const [searchPopover, setSearchPopover] = useState(null)
  const [crsPopover, setCrsPopover] = useState(null)
  const [showAttributeTable, setShowAttributeTable] = useState(false)
  const [mobilePanel, setMobilePanel] = useState(null)
  const [isBlockModelActive, setIsBlockModelActive] = useState(false)

  const [blendMode, setBlendMode] = useState("multiply")
  const [prefsCargadas, setPrefsCargadas] = useState(false)

  useEffect(() => {
    const prefs = readPreferences()
    setSelectedCoordinateSystem(prefs.crs)
    setLayers(prefs.layers)
    setLayerOrder(prefs.layerOrder)
    setBlendMode(prefs.blendMode || "multiply")
    const cabe = fitPanelToViewport(
      { width: prefs.panelWidth, height: prefs.panelHeight },
      window.innerWidth,
    )
    setPanelWidth(cabe.width)
    setPanelHeight(cabe.height)
    setPrefsCargadas(true)
  }, [])

  useEffect(() => {
    const alRedimensionar = () => {
      setPanelWidth((actual) => fitPanelToViewport({ width: actual }, window.innerWidth).width)
      if (typeof window !== "undefined" && window.innerWidth >= 768) {
        setMobilePanel(null)
      }
    }
    window.addEventListener("resize", alRedimensionar)
    return () => window.removeEventListener("resize", alRedimensionar)
  }, [])

  useEffect(() => {
    const handleGlobalKeyDown = (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key?.toLowerCase() === "k") {
        e.preventDefault()
        // Si la barra está recogida el buscador sigue a la vista —va en la
        // cápsula—, así que basta con enfocarlo.
        islandInputRef.current?.focus()
      }
    }
    window.addEventListener("keydown", handleGlobalKeyDown)
    return () => window.removeEventListener("keydown", handleGlobalKeyDown)
  }, [])

  useEffect(() => {
    if (prefsCargadas) writePreferences({ layers })
  }, [layers, prefsCargadas])

  useEffect(() => {
    if (prefsCargadas) writePreferences({ layerOrder })
  }, [layerOrder, prefsCargadas])

  useEffect(() => {
    if (prefsCargadas) writePreferences({ crs: selectedCoordinateSystem })
  }, [selectedCoordinateSystem, prefsCargadas])

  useEffect(() => {
    if (prefsCargadas) writePreferences({ blendMode })
  }, [blendMode, prefsCargadas])

  useEffect(() => {
    if (prefsCargadas) writePreferences({ panelWidth, panelHeight })
  }, [panelWidth, panelHeight, prefsCargadas])

  const filtroDe = useCallback(
    (areaId) => areaFilters[areaId] ?? { selections: {}, areaRange: null },
    [areaFilters],
  )

  const filters = useMemo(
    () => ({ scope: filterScope, byArea: areaFilters }),
    [areaFilters, filterScope],
  )

  const areaHasFilter = useCallback(
    (areaId) => {
      const { selections, areaRange } = filtroDe(areaId)
      return Object.values(selections).some((v) => v?.length > 0) || Boolean(areaRange)
    },
    [filtroDe],
  )

  const setAreaFilter = useCallback((areaId, cambios) => {
    setAreaFilters((current) => ({
      ...current,
      [areaId]: { ...(current[areaId] ?? { selections: {}, areaRange: null }), ...cambios },
    }))
  }, [])

  const registrosVisibles = useMemo(
    () =>
      layerData.features.filter((f) => {
        const { selections, areaRange } = filtroDe(layerByKey(f.layerKey)?.areaId)
        return matchesFilters(f.properties, selections, areaRange)
      }),
    [layerData.features, filtroDe],
  )

  const propiedadesDelArea = useCallback(
    (areaId) =>
      layerData.features
        .filter((f) => layerByKey(f.layerKey)?.areaId === areaId)
        .map((f) => f.properties),
    [layerData.features],
  )

  const enfocarRegistro = useCallback((registro) => {
    setShowAttributeTable(false)
    const map = mapRef.current
    if (!map || !registro?.bbox) return
    const { west, south, east, north } = registro.bbox
    map.fitBounds(
      [
        [west, south],
        [east, north],
      ],
      { padding: 120, duration: 1200, maxZoom: 16 },
    )
  }, [])

  const actualizarCapa = useCallback((key, cambios) => {
    setLayers((current) => ({ ...current, [key]: { ...current[key], ...cambios } }))
  }, [])

  const alternarCapa = useCallback(
    (key) => setLayers((current) => ({ ...current, [key]: { ...current[key], on: !current[key].on } })),
    [],
  )

  const cambiarOpacidad = useCallback(
    (key, opacity) => actualizarCapa(key, { opacity }),
    [actualizarCapa],
  )

  const cambiarColor = useCallback(
    (key, fillColor, lineColor) => actualizarCapa(key, { fillColor, lineColor }),
    [actualizarCapa],
  )

  // ─────────────────── Las capas que carga el usuario ───────────────────
  //
  // El archivo lo lee `useUserLayers` (ver ese hook) y lo dibuja
  // `useUserLayersGL` dentro del mapa. Lo que se hace aquí es lo que solo puede
  // hacer el panel: darle a la capa nueva su estado —encendida, al 60 %, con su
  // color— y ponerla **de primera** en el orden de pintado.
  //
  // De primera y no de última: quien acaba de abrir un plano quiere verlo, y si
  // entrara debajo de los títulos mineros quedaría tapado justo por lo que
  // venía a comparar. Encenderla sola es lo mismo: nadie carga un archivo para
  // dejarlo apagado.
  const registrarCapaCargada = useCallback((capa) => {
    setLayers((current) => ({
      ...current,
      [capa.key]: { on: true, opacity: 0.6, fillColor: capa.fillColor, lineColor: capa.lineColor },
    }))
    setLayerOrder((current) => [capa.key, ...current.filter((key) => key !== capa.key)])
  }, [])

  const olvidarCapaCargada = useCallback((key) => {
    setLayers((current) => {
      const resto = { ...current }
      delete resto[key]
      return resto
    })
    setLayerOrder((current) => current.filter((clave) => clave !== key))
  }, [])

  const {
    userLayers,
    loading: userLayersLoading,
    problems: userLayerProblems,
    importFiles,
    removeLayer: removeUserLayer,
    setLayerCrs: setUserLayerCrs,
    clearProblems: clearUserLayerProblems,
  } = useUserLayers({ onLayerAdded: registrarCapaCargada, onLayerRemoved: olvidarCapaCargada })

  /**
   * Llevar el mapa hasta una capa cargada.
   *
   * Se hace al cargarla y también desde su botón, porque un archivo puede estar
   * en cualquier parte del país y el visor abre en el centro a zoom 5: una capa
   * bien cargada puede quedar a dos pantallas, y desde aquí lo que se ve es que
   * no apareció nada.
   *
   * El `maxZoom` está por los archivos de un solo punto —un mojón, una muestra—,
   * cuyo recuadro no tiene tamaño: sin tope, `fitBounds` se iría al zoom máximo y
   * dejaría la pantalla en cuatro píxeles de mapa base.
   */
  const encuadrarCapaCargada = useCallback((capa) => {
    const map = mapRef.current
    if (!map || !capa?.bbox) return
    const [oeste, sur, este, norte] = capa.bbox
    map.fitBounds(
      [
        [oeste, sur],
        [este, norte],
      ],
      { padding: 80, duration: 1000, maxZoom: 16 },
    )
  }, [])

  const cargarArchivos = useCallback(
    async (files) => {
      const nuevas = await importFiles(files)
      // Se encuadra la primera, no todas: con dos archivos de sitios distintos,
      // encuadrar las dos seguidas deja un viaje de cámara que no se entiende.
      if (nuevas.length > 0) encuadrarCapaCargada(nuevas[0])
    },
    [importFiles, encuadrarCapaCargada],
  )

  /** Lanza la búsqueda del expediente que entregue cualquier buscador. */
  const buscarExpediente = useCallback((codigo) => {
    setExpedientCode(codigo)
    setIslandSearchText(codigo)
    setSearchTrigger((prev) => prev + 1)
    setShowToggle(true)
  }, [])

  const handleShowCoordinates = () => setShowTable(true)

  const handleCloseTable = () => {
    setShowTable(false)
  }

  const handleReset = () => {
    setExpedientCode("")
    setIslandSearchText("")
    setIslandSuggestions([])
    setIslandResultsOpen(false)
    setCoordinates([])
    setCoordinateRings([])
    setTransformedCoordinates([])
    setShowTable(false)
    setShowToggle(false)
    setSearchTrigger(0)
    setCoordinatesAvailable(false)
    setGeoJsonData(null)
    if (mapRef.current) {
      mapRef.current.clearSearchResult()
      mapRef.current.removeVertices()
      mapRef.current.clearDrawings()
    }
  }

  const handleExportSHP = () => {
    setShowExportModal(true)
  }

  const handleCloseExportModal = () => {
    setShowExportModal(false)
  }

  const handleCoordinatesUpdate = useCallback((newCoordinates, newGeoJsonData, newRings = []) => {
    setCoordinates(newCoordinates)
    setCoordinateRings(newRings)
    setCoordinatesAvailable(newCoordinates.length > 0)
    setGeoJsonData(newGeoJsonData)
  }, [])

  const ringStartLabels = useMemo(() => {
    const labels = new Map()
    let offset = 0
    coordinateRings.forEach((ring) => {
      labels.set(offset, ring.label)
      offset += ring.coordinates.length
    })
    return labels
  }, [coordinateRings])

  useEffect(() => {
    if (coordinates.length === 0) {
      setTransformedCoordinates([])
      return
    }
    setTransformedCoordinates(
      coordinates.map((coord) => fromGeographic(coord, selectedCoordinateSystem)),
    )
  }, [coordinates, selectedCoordinateSystem])

  const handleMapInitialized = useCallback((map) => {
    mapRef.current = map
    setMapInitialized(true)
  }, [])

  const centerOnActiveExpedient = useCallback(() => {
    if (!mapRef.current || !coordinates || coordinates.length === 0) return
    let minLng = Infinity, maxLng = -Infinity, minLat = Infinity, maxLat = -Infinity
    for (const coord of coordinates) {
      if (!Array.isArray(coord) || coord.length < 2) continue
      const [lng, lat] = coord
      if (typeof lng === "number" && typeof lat === "number" && isFinite(lng) && isFinite(lat)) {
        if (lng < minLng) minLng = lng
        if (lng > maxLng) maxLng = lng
        if (lat < minLat) minLat = lat
        if (lat > maxLat) maxLat = lat
      }
    }
    if (minLng !== Infinity && maxLng !== -Infinity && minLat !== Infinity && maxLat !== -Infinity) {
      const isMobile = typeof window !== "undefined" && window.innerWidth < 768
      mapRef.current.fitBounds(
        [[minLng, minLat], [maxLng, maxLat]],
        {
          padding: isMobile
            ? { top: 90, bottom: 90, left: 30, right: 30 }
            : { top: 100, bottom: 100, left: 100, right: 100 },
          duration: 800,
        }
      )
    }
  }, [coordinates])

  const activeCount = useMemo(
    () => Object.values(layers).filter((l) => l.on).length,
    [layers],
  )

  // Búsqueda asistida en la isla inferior
  const runIslandQuery = useCallback(async (query) => {
    if (!query || query.trim().length < 3) {
      setIslandSuggestions([])
      setIslandResultsOpen(false)
      setIslandLoading(false)
      return
    }
    if (islandAbortRef.current) islandAbortRef.current.abort()
    islandAbortRef.current = new AbortController()
    setIslandLoading(true)
    try {
      const results = await queryExpedientSuggestions(query.trim(), islandAbortRef.current.signal)
      setIslandSuggestions(results)
      setIslandResultsOpen(results.length > 0)
      setIslandSelectedIndex(-1)
    } catch (err) {
      if (err.name !== "AbortError") {
        setIslandSuggestions([])
        setIslandResultsOpen(false)
      }
    } finally {
      setIslandLoading(false)
    }
  }, [])

  const debouncedIslandQuery = useMemo(
    () => debounce(runIslandQuery, 300),
    [runIslandQuery],
  )

  const handleIslandSearchChange = (e) => {
    const val = e.target.value
    setIslandSearchText(val)
    if (val.trim().length >= 3) {
      debouncedIslandQuery(val)
    } else {
      debouncedIslandQuery.cancel()
      setIslandSuggestions([])
      setIslandResultsOpen(false)
    }
  }

  const handleSelectIslandExpedient = (code) => {
    setIslandSearchText(code)
    setIslandResultsOpen(false)
    debouncedIslandQuery.cancel()
    buscarExpediente(code)
  }

  /** Elegir la sugerencia marcada con el teclado o, si no hay, lo escrito. */
  const confirmarBusqueda = () => {
    if (islandSelectedIndex >= 0 && islandSuggestions[islandSelectedIndex]) {
      const sel = islandSuggestions[islandSelectedIndex]
      const code = typeof sel === "string" ? sel : sel?.code
      if (code) handleSelectIslandExpedient(code)
    } else if (islandSearchText.trim()) {
      handleSelectIslandExpedient(islandSearchText.trim())
    }
  }

  const cerrarExpediente = () => {
    handleReset()
    setIslandSearchText("")
    setIslandResultsOpen(false)
  }

  const abrirCrs = (event) => {
    const el = event.currentTarget
    setCrsPopover((actual) => (actual ? null : el))
  }

  const layerPanel = (
    <LayerPanel
      layers={layers}
      order={layerOrder}
      onToggle={alternarCapa}
      onOpacity={cambiarOpacidad}
      onColor={cambiarColor}
      onReorder={setLayerOrder}
      subLayers={sgcState.subLayers}
      chosenSub={sgcState.chosenSub}
      onToggleSubLayer={sgcState.onToggleSubLayer}
      areaHasFilter={areaHasFilter}
      onOpenFilters={(areaId, el) =>
        setFilterPopover((a) => (a?.areaId === areaId ? null : { areaId, el }))
      }
      userLayers={userLayers}
      userLayersLoading={userLayersLoading}
      userLayerProblems={userLayerProblems}
      onImportFiles={cargarArchivos}
      onDismissImportProblems={clearUserLayerProblems}
      onRemoveUserLayer={removeUserLayer}
      onFocusUserLayer={encuadrarCapaCargada}
      onChooseUserLayerCrs={setUserLayerCrs}
    />
  )

  return (
    <div
      className="relative flex w-full h-screen bg-background overflow-hidden"
      // Cuánto tapa la barra lateral por la izquierda. Lo lee el CSS del mapa
      // para correr la barra de escala, que si no quedaba debajo del panel.
      style={{ "--sidebar-offset": sidebarOpen ? "384px" : "12px" }}
    >
      <OfflineIndicator />

      {/* ─────────────────────── Barra lateral (escritorio) ───────────────────────
          Flota sobre el mapa con un margen, en vez de ir pegada al borde: así se
          lee como una hoja encima del mapa y no como un marco que lo recorta. */}
      <aside
        ref={panelRef}
        aria-label="Panel lateral"
        className={`glass-strong fixed left-3 top-3 z-30 hidden md:flex flex-col rounded-[20px] text-foreground select-none pointer-events-auto transition-[width,bottom] duration-300 ease-out ${
          sidebarOpen ? "bottom-3 w-[360px]" : "w-[320px]"
        }`}
      >
        {/* Cabecera: el nombre en la serif, que es el toque editorial */}
        {sidebarOpen && (
          <div className="flex items-start justify-between px-5 pt-5">
            <div>
              <h1 className="font-display text-[26px] font-medium leading-none tracking-[-0.015em] text-foreground">
                Visor Minero
              </h1>
              <p className="eyebrow mt-1.5">Colombia · Datos abiertos del Estado</p>
            </div>
            <SidebarToggle open onClick={() => setSidebarOpen(false)} />
          </div>
        )}

        {/* Buscador: siempre a la vista, abierta o recogida la barra */}
        <div className={`relative flex items-center gap-2 ${sidebarOpen ? "px-4 pt-4" : "p-2"}`}>
          {!sidebarOpen && (
            <SidebarToggle open={false} badge={activeCount} onClick={() => setSidebarOpen(true)} />
          )}
          <div className="relative min-w-0 flex-1">
            <div className="flex h-9 items-center gap-2 rounded-[10px] bg-fill-strong/70 px-2.5 transition-colors focus-within:bg-card focus-within:ring-2 focus-within:ring-primary/40">
              {islandLoading ? (
                <Loader2 className="h-4 w-4 shrink-0 animate-spin text-label-4" />
              ) : (
                <Search className="h-4 w-4 shrink-0 text-label-4" />
              )}
              <input
                ref={islandInputRef}
                type="text"
                value={islandSearchText}
                onChange={handleIslandSearchChange}
                onKeyDown={(e) => {
                  if (e.key === "ArrowDown") {
                    e.preventDefault()
                    setIslandSelectedIndex((i) => Math.min(i + 1, islandSuggestions.length - 1))
                  } else if (e.key === "ArrowUp") {
                    e.preventDefault()
                    setIslandSelectedIndex((i) => Math.max(i - 1, 0))
                  } else if (e.key === "Enter") {
                    e.preventDefault()
                    confirmarBusqueda()
                  } else if (e.key === "Escape") {
                    setIslandResultsOpen(false)
                    islandInputRef.current?.blur()
                  }
                }}
                placeholder="Buscar expediente..."
                aria-label="Buscar expediente"
                className="h-full min-w-0 flex-1 bg-transparent text-[13.5px] text-foreground placeholder:text-label-4 focus:outline-none"
              />
              {islandSearchText ? (
                <button
                  type="button"
                  onClick={() => {
                    setIslandSearchText("")
                    setIslandSuggestions([])
                    setIslandResultsOpen(false)
                  }}
                  className="flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-label-5 text-white transition-colors hover:bg-label-4"
                  title="Limpiar búsqueda"
                  aria-label="Limpiar búsqueda"
                >
                  <X className="h-2.5 w-2.5" strokeWidth={3} />
                </button>
              ) : (
                <kbd className="hidden shrink-0 rounded-[5px] border border-border bg-card px-1.5 py-px font-sans text-[10.5px] text-label-4 lg:inline">
                  ⌘K
                </kbd>
              )}
            </div>

            {islandResultsOpen && islandSuggestions.length > 0 && (
              <div
                role="listbox"
                aria-label="Sugerencias de expediente"
                className="glass-strong absolute left-0 right-0 top-full z-40 mt-1.5 max-h-64 overflow-y-auto rounded-xl p-1"
              >
                {islandSuggestions.map((item, index) => {
                  const code = typeof item === "string" ? item : item?.code || ""
                  const layerName = typeof item === "object" ? item?.layerName : null
                  const isSelected = index === islandSelectedIndex
                  return (
                    <div
                      key={code || index}
                      role="option"
                      aria-selected={isSelected}
                      onMouseDown={(e) => e.preventDefault()}
                      onClick={() => handleSelectIslandExpedient(code)}
                      className={`flex cursor-pointer items-center justify-between gap-2 rounded-lg px-2.5 py-2 transition-colors ${
                        isSelected ? "bg-primary text-white" : "hover:bg-fill"
                      }`}
                    >
                      <span className="font-mono text-[12.5px] font-medium">{code}</span>
                      <ExpedientTag layerName={layerName} inverted={isSelected} />
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        </div>

        {/* El expediente encontrado, como tarjeta: código, de qué capa es y
            sus tres acciones. Antes era una cápsula aparte bajo el buscador
            flotante, con un punto verde parpadeando. */}
        {showToggle && (
          <div className={sidebarOpen ? "px-4 pt-3" : "px-2 pb-2"}>
            <div className="flex items-center gap-2 rounded-xl border border-border bg-card px-2 py-1.5 shadow-[0_1px_2px_rgba(0,0,0,0.04)] animate-in fade-in slide-in-from-top-1">
              <button
                type="button"
                onClick={centerOnActiveExpedient}
                title="Centrar mapa en este expediente"
                aria-label={`Centrar mapa en expediente ${expedientCode}`}
                className="flex min-w-0 flex-1 items-center gap-2 rounded-lg px-1.5 py-1 text-left transition-colors hover:bg-fill"
              >
                <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                  <Crosshair className="h-3.5 w-3.5" />
                </span>
                <span className="flex min-w-0 flex-col leading-tight">
                  <span className="truncate font-mono text-[13px] font-semibold text-foreground">
                    {expedientCode || "Expediente activo"}
                  </span>
                  <span className="text-[11px] text-label-4">Centrar en el mapa</span>
                </span>
              </button>
              {coordinatesAvailable && (
                <IconAction icon={TableIcon} label="Ver coordenadas" title="Ver tabla de coordenadas" onClick={handleShowCoordinates} />
              )}
              <IconAction icon={Download} label="Exportar expediente" title="Exportar expediente" onClick={handleExportSHP} />
              <IconAction icon={X} label="Borrar expediente activo" title="Borrar expediente activo" onClick={cerrarExpediente} />
            </div>
          </div>
        )}

        {sidebarOpen && (
          <>
            <div className="px-4 pb-1 pt-4">
              <Segmented
                value={drawerTab}
                onChange={setDrawerTab}
                options={[
                  { id: "capas", label: "Capas", badge: activeCount || null },
                  { id: "herramientas", label: "Herramientas" },
                ]}
              />
            </div>

            <div className="flex-1 overflow-y-auto overflow-x-hidden px-4 py-3">
              {drawerTab === "capas" ? (
                layerPanel
              ) : (
                <ToolsPanel
                  crsLabel={crsById(selectedCoordinateSystem).label}
                  epsg={selectedCoordinateSystem}
                  onOpenCrs={abrirCrs}
                  onMode={(modo) => mapRef.current?.startMode?.(modo)}
                  onClear={() => mapRef.current?.clearDrawings?.()}
                  onExportImage={() => mapRef.current?.openImageExport?.()}
                />
              )}
            </div>

            <div className="flex items-center justify-between border-t border-border px-5 py-2.5 text-[11px] text-label-4">
              <span>ANM · SGC · ANH · IGAC</span>
              <a
                href="https://www.linkedin.com/in/fabio-espinosa/"
                target="_blank"
                rel="noopener noreferrer"
                title="Fabio A. Espinosa en LinkedIn"
                aria-label="Perfil de LinkedIn de Fabio A. Espinosa"
                className="inline-flex items-center gap-1 transition-colors hover:text-foreground"
              >
                Fabio A. Espinosa
                <Linkedin className="h-3 w-3" />
              </a>
            </div>
          </>
        )}
      </aside>

      {/* Mapa en el centro / fondo */}
      <div className="flex-grow relative h-full w-full">
        <MapComponent
          expedientCode={expedientCode}
          onCoordinatesUpdate={handleCoordinatesUpdate}
          searchTrigger={searchTrigger}
          onMapInitialized={handleMapInitialized}
          layerState={layers}
          layerOrder={layerOrder}
          userLayers={userLayers}
          coordinateSystem={selectedCoordinateSystem}
          filters={filters}
          onLayerData={setLayerData}
          onSgcState={setSgcState}
          // Solo la hoja del móvil tapa los controles del mapa; la barra de
          // escritorio va al otro lado y no estorba.
          panelOpen={mobilePanel !== null}
          blendMode={blendMode}
          onBlendModeChange={setBlendMode}
          onBlockModelChange={setIsBlockModelActive}
        />
      </div>

      {/* Expediente activo en móvil: una cápsula arriba, sobre el mapa */}
      {showToggle && !isBlockModelActive && (
        <div className="glass fixed top-3 left-1/2 -translate-x-1/2 z-30 flex md:hidden items-center gap-0.5 max-w-[92vw] rounded-full py-1 pl-3 pr-1">
          <button
            type="button"
            onClick={centerOnActiveExpedient}
            className="flex items-center gap-1.5 truncate max-w-[150px] font-mono text-[12.5px] font-semibold text-foreground active:opacity-60"
            title="Centrar mapa en este expediente"
            aria-label={`Centrar mapa en expediente ${expedientCode}`}
          >
            <Crosshair className="h-3.5 w-3.5 shrink-0 text-primary" />
            <span className="truncate">{expedientCode}</span>
          </button>
          <div className="mx-1 h-4 w-px bg-border" />
          {coordinatesAvailable && (
            <IconAction icon={TableIcon} label="Ver coordenadas móvil" title="Ver coordenadas" onClick={() => setShowTable(true)} />
          )}
          <IconAction icon={Download} label="Descargar expediente móvil" title="Descargar expediente" onClick={handleExportSHP} />
          <IconAction icon={X} label="Cerrar expediente móvil" title="Cerrar expediente" onClick={cerrarExpediente} />
        </div>
      )}

      {!isBlockModelActive && (
        <MobileBottomBar
          activePanel={mobilePanel}
          onSelectPanel={(panel) => setMobilePanel((curr) => (curr === panel ? null : panel))}
          activeLayersCount={activeCount}
        />
      )}

      <MobileBottomSheet
        isOpen={mobilePanel !== null}
        onClose={() => setMobilePanel(null)}
        title={
          mobilePanel === "layers"
            ? "Capas"
            : mobilePanel === "tools"
            ? "Herramientas"
            : mobilePanel === "expediente"
            ? "Buscar"
            : ""
        }
      >
        {mobilePanel === "layers" && layerPanel}

        {mobilePanel === "tools" && (
          <div className="space-y-5">
            <ToolsPanel
              crsLabel={crsById(selectedCoordinateSystem).label}
              epsg={selectedCoordinateSystem}
              onOpenCrs={abrirCrs}
              onMode={(modo) => {
                mapRef.current?.startMode?.(modo)
                setMobilePanel(null)
              }}
              onClear={() => {
                mapRef.current?.clearDrawings?.()
                setMobilePanel(null)
              }}
              onExportImage={() => {
                mapRef.current?.openImageExport?.()
                setMobilePanel(null)
              }}
            />
            <MobileStorageManager />
          </div>
        )}

        {mobilePanel === "expediente" && (
          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <div className="flex h-11 min-w-0 flex-1 items-center gap-2 rounded-xl bg-fill-strong/70 px-3 focus-within:bg-card focus-within:ring-2 focus-within:ring-primary/40">
                <Search className="h-4 w-4 shrink-0 text-label-4" />
                <input
                  type="text"
                  value={islandSearchText}
                  onChange={handleIslandSearchChange}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && islandSearchText.trim()) {
                      e.preventDefault()
                      handleSelectIslandExpedient(islandSearchText.trim())
                      setMobilePanel(null)
                    }
                  }}
                  placeholder="Código, p. ej. ICQ-08005"
                  className="h-full min-w-0 flex-1 bg-transparent text-[15px] text-foreground placeholder:text-label-4 focus:outline-none"
                />
                {islandSearchText && (
                  <button
                    type="button"
                    onClick={() => {
                      setIslandSearchText("")
                      setIslandSuggestions([])
                    }}
                    aria-label="Limpiar búsqueda"
                    className="flex h-[18px] w-[18px] shrink-0 items-center justify-center rounded-full bg-label-5 text-white"
                  >
                    <X className="h-3 w-3" strokeWidth={3} />
                  </button>
                )}
              </div>
              <button
                type="button"
                onClick={() => {
                  if (islandSearchText.trim()) {
                    handleSelectIslandExpedient(islandSearchText.trim())
                    setMobilePanel(null)
                  }
                }}
                className="h-11 rounded-xl bg-primary px-4 text-[15px] font-semibold text-white active:opacity-80 transition-opacity"
              >
                Buscar
              </button>
            </div>

            {islandLoading && (
              <div className="flex items-center justify-center gap-2 py-4 text-[13px] text-label-3">
                <Loader2 className="h-4 w-4 animate-spin" />
                Buscando expedientes…
              </div>
            )}

            {islandSuggestions.length > 0 && (
              <div className="divide-y divide-border overflow-hidden rounded-xl bg-card max-h-72 overflow-y-auto">
                {islandSuggestions.map((sug, index) => {
                  const code = typeof sug === "string" ? sug : sug?.code || ""
                  const layerName = typeof sug === "object" ? sug?.layerName : null
                  return (
                    <button
                      key={code || index}
                      type="button"
                      onClick={() => {
                        handleSelectIslandExpedient(code)
                        setMobilePanel(null)
                      }}
                      className="flex w-full items-center justify-between px-4 py-3 text-left active:bg-fill"
                    >
                      <span className="font-mono text-[14px] font-medium text-foreground">{code}</span>
                      <ExpedientTag layerName={layerName} />
                    </button>
                  )
                })}
              </div>
            )}
          </div>
        )}
      </MobileBottomSheet>

      {showTable && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/25 backdrop-blur-sm animate-in fade-in duration-150">
          <div className="glass-strong m-4 w-full max-w-md rounded-[20px] p-6 text-foreground animate-in zoom-in-95 duration-150">
            <div className="mb-4">
              <p className="eyebrow">Expediente {expedientCode}</p>
              <h2 className="panel-title mt-1 text-[26px]">Coordenadas</h2>
              <p className="mt-1.5 text-[12.5px] text-label-3">
                {crsById(selectedCoordinateSystem).label} · EPSG:{selectedCoordinateSystem}
              </p>
            </div>
            <div className="overflow-auto max-h-[60vh] rounded-xl border border-border bg-card">
              <Table>
                <TableHeader>
                  <TableRow className="border-border bg-fill hover:bg-fill">
                    <TableHead className="text-label-2">Punto</TableHead>
                    <TableHead className="text-label-2">
                      {axisLabels(selectedCoordinateSystem).first}
                    </TableHead>
                    <TableHead className="text-label-2">
                      {axisLabels(selectedCoordinateSystem).second}
                    </TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {transformedCoordinates.map((coord, index) => (
                    <Fragment key={index}>
                      {coordinateRings.length > 1 && ringStartLabels.has(index) && (
                        <TableRow className="border-border bg-fill/70">
                          <TableCell
                            colSpan={3}
                            className="text-xs font-semibold text-label-2 text-center"
                          >
                            {ringStartLabels.get(index)}
                          </TableCell>
                        </TableRow>
                      )}
                      <TableRow className="border-border hover:bg-fill-strong/70">
                        <TableCell className="text-center font-mono text-xs text-label-3">{index + 1}</TableCell>
                        <TableCell className="text-center font-mono text-xs text-foreground">
                          {formatCoordinate(coord[1], selectedCoordinateSystem)}
                        </TableCell>
                        <TableCell className="text-center font-mono text-xs text-foreground">
                          {formatCoordinate(coord[0], selectedCoordinateSystem)}
                        </TableCell>
                      </TableRow>
                    </Fragment>
                  ))}
                </TableBody>
              </Table>
            </div>
            <Button
              onClick={handleCloseTable}
              className="mt-4 w-full rounded-xl bg-primary text-white hover:bg-primary/90"
            >
              Cerrar
            </Button>
          </div>
        </div>
      )}

      {filterPopover && (
        <AreaFilters
          area={areaById(filterPopover.areaId)}
          anchorRect={filterPopover.el.getBoundingClientRect()}
          anchorEl={filterPopover.el}
          properties={propiedadesDelArea(filterPopover.areaId)}
          selections={filtroDe(filterPopover.areaId).selections}
          areaRange={filtroDe(filterPopover.areaId).areaRange}
          scope={filterScope}
          truncated={layerData.truncated.length > 0}
          onChange={(selections) => setAreaFilter(filterPopover.areaId, { selections })}
          onArea={(areaRange) => setAreaFilter(filterPopover.areaId, { areaRange })}
          onScope={setFilterScope}
          onOpenTable={() => {
            setFilterPopover(null)
            setShowAttributeTable(true)
          }}
          onClose={() => setFilterPopover(null)}
        />
      )}

      {searchPopover && (
        <ExpedientSearch
          anchorRect={searchPopover.el.getBoundingClientRect()}
          anchorEl={searchPopover.el}
          areaColor={areaById(searchPopover.areaId).color}
          initialCode={expedientCode}
          onSearch={buscarExpediente}
          onClose={() => setSearchPopover(null)}
        />
      )}

      {crsPopover && (
        <CrsPicker
          current={selectedCoordinateSystem}
          anchorRect={crsPopover.getBoundingClientRect()}
          anchorEl={crsPopover}
          onChoose={setSelectedCoordinateSystem}
          onClose={() => setCrsPopover(null)}
        />
      )}

      {showAttributeTable && (
        <AttributeTable
          features={registrosVisibles}
          onPick={enfocarRegistro}
          onClose={() => setShowAttributeTable(false)}
        />
      )}

      {showExportModal && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/25 backdrop-blur-sm animate-in fade-in duration-150">
          <div className="glass-strong relative m-4 w-full max-w-md rounded-[20px] p-6 text-foreground animate-in zoom-in-95 duration-150">
            <div className="mb-5 flex items-start justify-between">
              <div>
                <p className="eyebrow">Expediente {expedientCode}</p>
                <h2 className="panel-title mt-1 text-[26px]">Exportar</h2>
              </div>
              <button
                type="button"
                onClick={handleCloseExportModal}
                className="flex h-[30px] w-[30px] items-center justify-center rounded-full bg-fill-strong text-label-3 transition-colors hover:text-foreground"
                aria-label="Cerrar modal de descarga"
              >
                <X className="h-4 w-4" strokeWidth={2.5} />
              </button>
            </div>
            <ExportComponent
              geoJsonData={geoJsonData}
              selectedCoordinateSystem={selectedCoordinateSystem}
              expedientCode={expedientCode}
            />
          </div>
        </div>
      )}
    </div>
  )
}

// ───────────────────────────── Piezas del armazón ─────────────────────────────
//
// Viven aquí y no en archivos propios porque solo las usa este componente. Las
// herramientas en particular estaban escritas dos veces —una para el panel de
// escritorio y otra para la hoja del móvil— con diferencias de detalle que nadie
// había decidido: ahora son una sola.

/** El botón que abre y recoge la barra lateral, con el icono de macOS. */
function SidebarToggle({ open, badge = 0, onClick }) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={open ? "Recoger el panel" : "Abrir el panel de capas"}
      aria-label={open ? "Recoger el panel lateral" : "Abrir el panel lateral"}
      aria-expanded={open}
      className="relative flex h-9 w-9 shrink-0 items-center justify-center rounded-[10px] text-label-3 transition-colors hover:bg-fill-strong hover:text-foreground"
    >
      {open ? <PanelLeftClose className="h-[18px] w-[18px]" /> : <PanelLeftOpen className="h-[18px] w-[18px]" />}
      {!open && badge > 0 && (
        <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-[16px] items-center justify-center rounded-full bg-primary px-1 text-[9.5px] font-semibold text-white ring-2 ring-white">
          {badge}
        </span>
      )}
    </button>
  )
}

/** Control segmentado de iOS: carril gris y la opción elegida en blanco. */
function Segmented({ value, onChange, options }) {
  return (
    <div role="tablist" className="flex rounded-[10px] bg-fill-strong/80 p-[2px]">
      {options.map((opcion) => {
        const elegida = value === opcion.id
        return (
          <button
            key={opcion.id}
            type="button"
            role="tab"
            aria-selected={elegida}
            aria-label={`Pestaña ${opcion.label}`}
            onClick={() => onChange(opcion.id)}
            className={`flex flex-1 items-center justify-center gap-1.5 rounded-[8px] py-1.5 text-[13px] font-medium transition-all ${
              elegida
                ? "bg-card text-foreground shadow-[0_1px_3px_rgba(0,0,0,0.12),0_0_0_0.5px_rgba(0,0,0,0.04)]"
                : "text-label-3 hover:text-foreground"
            }`}
          >
            {opcion.label}
            {opcion.badge ? (
              <span className="rounded-full bg-primary px-1.5 text-[10.5px] font-semibold leading-[16px] text-white">
                {opcion.badge}
              </span>
            ) : null}
          </button>
        )
      })}
    </div>
  )
}

/** Un botón de solo icono, redondo y discreto. */
function IconAction({ icon: Icon, label, title, onClick }) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={title}
      aria-label={label}
      className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-label-3 transition-colors hover:bg-fill-strong hover:text-foreground active:opacity-60"
    >
      <Icon className="h-4 w-4" />
    </button>
  )
}

/**
 * De qué capa es un expediente: título o solicitud.
 *
 * Verde para el título y ámbar para la solicitud porque es lo que se pregunta
 * con prisa —«¿está otorgado?»—, y el color lo contesta antes de leer.
 */
function ExpedientTag({ layerName, inverted = false }) {
  const nombre = layerName?.toLowerCase() ?? ""
  const esSolicitud = nombre.includes("solicitud") || nombre.includes("trámite") || nombre.includes("tramite")
  const tono = inverted
    ? "bg-white/20 text-white"
    : esSolicitud
    ? "bg-warning/10 text-warning"
    : "bg-success/10 text-success"
  return (
    <span className={`shrink-0 rounded-full px-2 py-0.5 text-[10.5px] font-medium ${tono}`}>
      {layerName || "Expediente"}
    </span>
  )
}

/**
 * Un grupo de filas, como en Ajustes del iPhone: rótulo pequeño encima y las
 * filas dentro de una tarjeta blanca, separadas por una línea fina.
 */
function ToolGroup({ title, children }) {
  return (
    <section>
      <h3 className="eyebrow mb-1.5 px-1">{title}</h3>
      <div className="divide-y divide-border overflow-hidden rounded-xl border border-border bg-card">
        {children}
      </div>
    </section>
  )
}

/**
 * Una fila de herramienta: el icono en su cuadrito de color, nombre, una línea
 * de explicación y, a la derecha, un valor o la flecha.
 *
 * El color del cuadrito no es adorno: agrupa. Las de medir van en azul, la de
 * borrar en rojo y la de exportar en verde, y con eso se encuentra cada una sin
 * leer los nombres.
 */
function ToolRow({ icon: Icon, tint, label, detail, trailing, onClick, title, danger = false }) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={title}
      className="group flex w-full items-center gap-3 px-3 py-2.5 text-left transition-colors hover:bg-fill active:bg-fill-strong"
    >
      <span
        className="flex h-[30px] w-[30px] shrink-0 items-center justify-center rounded-[8px] text-white"
        style={{ backgroundColor: tint }}
      >
        <Icon className="h-4 w-4" />
      </span>
      <span className="flex min-w-0 flex-1 flex-col leading-tight">
        <span className={`truncate text-[13.5px] font-medium ${danger ? "text-danger" : "text-foreground"}`}>
          {label}
        </span>
        {detail && <span className="truncate text-[11.5px] text-label-4">{detail}</span>}
      </span>
      {trailing ?? <ChevronRight className="h-4 w-4 shrink-0 text-label-5" />}
    </button>
  )
}

/** Los colores de los cuadritos: los de sistema de iOS, un punto más apagados. */
const TINT = {
  azul: "#3478f6",
  indigo: "#5e5ce6",
  verde: "#30a46c",
  gris: "#8e8e93",
  rojo: "#e5484d",
  naranja: "#f08c2e",
}

function ToolsPanel({ crsLabel, epsg, onOpenCrs, onMode, onClear, onExportImage }) {
  return (
    <div className="space-y-5">
      <ToolGroup title="Coordenadas">
        <ToolRow
          icon={Globe2}
          tint={TINT.indigo}
          label="Sistema de referencia"
          detail={crsLabel}
          onClick={onOpenCrs}
          title="Cambiar el sistema en que se leen y exportan las coordenadas"
          trailing={
            <span className="flex shrink-0 items-center gap-1 text-[11.5px] tabular-nums text-label-4">
              EPSG:{epsg}
              <ChevronDown className="h-3.5 w-3.5 text-label-5" />
            </span>
          }
        />
      </ToolGroup>

      <ToolGroup title="Medir y dibujar">
        <ToolRow
          icon={Spline}
          tint={TINT.azul}
          label="Distancia"
          detail="Traza una línea sobre el mapa"
          onClick={() => onMode("draw_line_string")}
          title="Medir distancia lineal entre puntos"
        />
        <ToolRow
          icon={Square}
          tint={TINT.azul}
          label="Área y perímetro"
          detail="Dibuja un polígono"
          onClick={() => onMode("draw_polygon")}
          title="Medir área y perímetro de un polígono"
        />
        <ToolRow
          icon={MapPin}
          tint={TINT.azul}
          label="Punto o coordenada"
          detail="Marca un sitio o escribe sus coordenadas"
          onClick={() => onMode("draw_point")}
          title="Marcar un punto o ir a una coordenada"
        />
        <ToolRow
          icon={Trash2}
          tint={TINT.rojo}
          label="Borrar dibujos"
          detail="Quita las figuras y sus medidas"
          onClick={onClear}
          title="Limpiar dibujos y mediciones"
          danger
          trailing={<span />}
        />
      </ToolGroup>

      <ToolGroup title="Exportar">
        <ToolRow
          icon={ImageIcon}
          tint={TINT.verde}
          label="Mapa en PNG"
          detail="Con leyenda, norte y escala"
          onClick={onExportImage}
          title="Exportar el mapa actual como imagen PNG con leyenda, norte y escala"
        />
      </ToolGroup>

      <p className="px-1 text-[11.5px] leading-relaxed text-label-4">
        Para descargar las capas de una zona, dibuja un área y pulsa{" "}
        <span className="font-medium text-label-2">Descargar área</span> junto a los controles del mapa.
      </p>
    </div>
  )
}
