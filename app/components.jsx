"use client"

import { Fragment, useState, useEffect, useCallback, useMemo, useRef } from "react"
import dynamic from "next/dynamic"
import { Label } from "@/components/ui/label"
import { Button } from "@/components/ui/button"
import { Table, TableHeader, TableRow, TableHead, TableBody, TableCell } from "@/components/ui/table"
import {
  Layers,
  Wrench,
  Pin,
  PinOff,
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
} from "lucide-react"
import ExportComponent from "./ExportComponent"
import { axisLabels, crsById, formatCoordinate, fromGeographic, SOURCE_CRS } from "./utils/crs"
import { areaById, DEFAULT_ORDER, initialLayerState, layerByKey } from "./utils/themeAreas"
import { LayerPanel } from "./components/LayerPanel"
import { AreaFilters } from "./components/AreaFilters"
import { AttributeTable } from "./components/AttributeTable"
import { CrsPicker } from "./components/CrsPicker"
import { ExpedientSearch, queryExpedientSuggestions } from "./components/ExpedientSearch"
import { matchesFilters } from "./utils/layerFilters"
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
  loading: () => <p className="text-slate-400 p-4 text-sm">Cargando mapa...</p>,
})

export default function Component() {
  const [isPinned, setIsPinned] = useState(false)
  const [isHovered, setIsHovered] = useState(false)
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

  // Ventanas flotantes
  const [filterPopover, setFilterPopover] = useState(null)
  const [searchPopover, setSearchPopover] = useState(null)
  const [crsPopover, setCrsPopover] = useState(null)
  const [showAttributeTable, setShowAttributeTable] = useState(false)

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
    }
    window.addEventListener("resize", alRedimensionar)
    return () => window.removeEventListener("resize", alRedimensionar)
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

  const isDrawerOpen = isPinned || isHovered

  return (
    <div className="relative flex w-full h-screen bg-[#000000] overflow-hidden">
      {/* Dock lateral pegado al borde izquierdo con rail colapsable y drawer fluido */}
      <aside
        aria-label="Panel lateral"
        onMouseEnter={() => setIsHovered(true)}
        onMouseLeave={() => setIsHovered(false)}
        className="fixed left-0 top-0 bottom-0 z-30 flex select-none pointer-events-auto"
      >
        {/* Rail de iconos (barra de tareas tipo dock, 56px) */}
        <div className="flex w-14 flex-col items-center justify-between border-r border-zinc-800/80 bg-[#000000]/95 py-3.5 backdrop-blur-2xl text-zinc-200 z-10 shadow-[4px_0_24px_rgba(0,0,0,0.6)]">
          {/* Iconos de navegación del rail */}
          <div className="flex flex-col items-center gap-2 pt-1">
            <button
              type="button"
              onClick={() => setDrawerTab("capas")}
              title="Capas del proyecto"
              aria-label="Pestaña Capas"
              className={`relative flex h-10 w-10 items-center justify-center rounded-xl transition-all ${
                drawerTab === "capas" && isDrawerOpen
                  ? "bg-zinc-800 text-white border border-zinc-700 shadow-sm"
                  : "text-zinc-400 hover:bg-zinc-900 hover:text-zinc-200"
              }`}
            >
              <Layers className="h-5 w-5" />
              {activeCount > 0 && (
                <span className="absolute -top-1 -right-1 flex h-4 min-w-[16px] items-center justify-center rounded-full bg-white px-1 text-[9px] font-bold text-black shadow">
                  {activeCount}
                </span>
              )}
            </button>

            <button
              type="button"
              onClick={() => setDrawerTab("herramientas")}
              title="Herramientas y configuración"
              aria-label="Pestaña Herramientas"
              className={`relative flex h-10 w-10 items-center justify-center rounded-xl transition-all ${
                drawerTab === "herramientas" && isDrawerOpen
                  ? "bg-zinc-800 text-white border border-zinc-700 shadow-sm"
                  : "text-zinc-400 hover:bg-zinc-900 hover:text-zinc-200"
              }`}
            >
              <Wrench className="h-5 w-5" />
            </button>
          </div>

          {/* Enlace al perfil de LinkedIn en la base de la barra */}
          <div className="flex flex-col items-center gap-2">
            <a
              href="https://www.linkedin.com/in/fabio-espinosa/"
              target="_blank"
              rel="noopener noreferrer"
              title="Fabio A. Espinosa en LinkedIn"
              aria-label="Perfil de LinkedIn de Fabio A. Espinosa"
              className="flex h-9 w-9 items-center justify-center rounded-lg text-zinc-500 hover:bg-zinc-900 hover:text-zinc-200 transition-colors"
            >
              <Linkedin className="h-4.5 w-4.5" />
            </a>
          </div>
        </div>

        {/* Drawer desplegable en negro obsidiana glass (~360px) */}
        <div
          ref={panelRef}
          className={`flex flex-col border-r border-zinc-800/80 bg-[#09090b]/95 text-zinc-100 backdrop-blur-2xl transition-all duration-300 ease-out overflow-hidden ${
            isDrawerOpen
              ? "w-[360px] opacity-100 shadow-[20px_0_40px_rgba(0,0,0,0.6)]"
              : "w-0 opacity-0 pointer-events-none"
          }`}
        >
          {/* Cabecera del drawer con título de sección y controles */}
          <div className="flex h-14 shrink-0 items-center justify-between border-b border-zinc-800/80 px-4 bg-[#000000]/70">
            <div className="flex items-center gap-2">
              {drawerTab === "capas" ? (
                <Layers className="h-4 w-4 text-zinc-300" />
              ) : (
                <Wrench className="h-4 w-4 text-zinc-300" />
              )}
              <span className="text-sm font-semibold tracking-tight text-white">
                {drawerTab === "capas" ? "Capas" : "Herramientas"}
              </span>
              {drawerTab === "capas" && activeCount > 0 && (
                <span className="rounded-full bg-zinc-800 px-1.5 py-0.5 text-[10px] font-bold text-zinc-300 border border-zinc-700">
                  {activeCount}
                </span>
              )}
            </div>

            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={() => setIsPinned((p) => !p)}
                title={isPinned ? "Desfijar panel lateral" : "Fijar panel lateral"}
                className={`flex h-7 w-7 items-center justify-center rounded-lg transition-colors ${
                  isPinned
                    ? "bg-zinc-800 text-white border border-zinc-700"
                    : "text-zinc-400 hover:bg-zinc-900 hover:text-zinc-200"
                }`}
              >
                {isPinned ? <Pin className="h-3.5 w-3.5 fill-white" /> : <PinOff className="h-3.5 w-3.5" />}
              </button>
              <button
                type="button"
                onClick={() => {
                  setIsPinned(false)
                  setIsHovered(false)
                }}
                title="Cerrar panel"
                aria-label="Cerrar panel"
                className="flex h-7 w-7 items-center justify-center rounded-lg text-zinc-400 hover:bg-zinc-900 hover:text-zinc-100 transition-colors"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
          </div>

          {/* Cuerpo con scroll interno del drawer */}
          <div className="flex-1 overflow-y-auto overflow-x-hidden p-3.5 space-y-4">
            {drawerTab === "capas" ? (
              <>
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
                />
              </>
            ) : (
              <div className="space-y-3.5">
                {/* 1. Sistema de Coordenadas (PRIMERO) */}
                <div className="rounded-2xl border border-zinc-800/80 bg-zinc-950/60 p-3 backdrop-blur-xl">
                  <div className="flex items-center justify-between mb-2">
                    <Label className="text-[11px] font-semibold uppercase tracking-[0.08em] text-zinc-400">
                      Sistema de Coordenadas
                    </Label>
                    <span className="font-mono text-[10px] text-zinc-300 bg-zinc-800/90 px-2 py-0.5 rounded-md border border-zinc-700/60">
                      EPSG:{selectedCoordinateSystem}
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={(event) => {
                      const el = event.currentTarget
                      setCrsPopover((actual) => (actual ? null : el))
                    }}
                    className="flex h-10 w-full items-center justify-between rounded-xl border border-zinc-800 bg-zinc-900/60 px-3 text-left transition-all hover:border-zinc-700 hover:bg-zinc-850"
                  >
                    <div className="flex items-center gap-2.5 min-w-0">
                      <Globe2 className="h-4 w-4 shrink-0 text-zinc-300" />
                      <span className="min-w-0 truncate text-[12.5px] font-medium text-white">
                        {crsById(selectedCoordinateSystem).label}
                      </span>
                    </div>
                    <ChevronDown className="h-3.5 w-3.5 shrink-0 text-zinc-400" />
                  </button>
                </div>

                {/* 2. Fusión de capas */}
                <div className="rounded-2xl border border-zinc-800/80 bg-zinc-950/60 p-3 backdrop-blur-xl">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-[11px] font-semibold text-zinc-400 uppercase tracking-[0.08em]">
                      Fusión de capas
                    </span>
                  </div>
                  <div className="flex rounded-xl border border-zinc-800/90 p-1 bg-zinc-900/80 text-[11px] gap-1">
                    <button
                      type="button"
                      onClick={() => setBlendMode("multiply")}
                      className={`flex-1 py-1.5 rounded-lg text-xs font-medium transition-all ${
                        blendMode === "multiply"
                          ? "bg-zinc-800 text-white font-semibold shadow-sm border border-zinc-700/70"
                          : "text-zinc-400 hover:text-zinc-200"
                      }`}
                      title="Multiplicar: funde con relieve y mapa base"
                    >
                      Multiplicar
                    </button>
                    <button
                      type="button"
                      onClick={() => setBlendMode("normal")}
                      className={`flex-1 py-1.5 rounded-lg text-xs font-medium transition-all ${
                        blendMode === "normal"
                          ? "bg-zinc-800 text-white font-semibold shadow-sm border border-zinc-700/70"
                          : "text-zinc-400 hover:text-zinc-200"
                      }`}
                      title="Normal: transparencia simple"
                    >
                      Normal
                    </button>
                  </div>
                </div>

                {/* 3. Medición y Captura */}
                <div className="rounded-2xl border border-zinc-800/80 bg-zinc-950/60 p-3 backdrop-blur-xl">
                  <Label className="text-[11px] font-semibold uppercase tracking-[0.08em] text-zinc-400 block mb-2">
                    Medición y Captura
                  </Label>
                  <div className="grid grid-cols-3 gap-2">
                    <button
                      type="button"
                      onClick={() => mapRef.current?.startMode?.("measure-distance")}
                      className="flex flex-col items-center justify-center gap-1.5 rounded-xl border border-zinc-800 bg-zinc-900/50 p-2.5 text-zinc-300 hover:border-zinc-700 hover:bg-zinc-800 hover:text-white transition-all active:scale-[0.98]"
                      title="Medir distancia lineal entre puntos"
                    >
                      <Spline className="h-4 w-4 text-zinc-200" />
                      <span className="text-[11px] font-medium">Distancia</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => mapRef.current?.startMode?.("measure-area")}
                      className="flex flex-col items-center justify-center gap-1.5 rounded-xl border border-zinc-800 bg-zinc-900/50 p-2.5 text-zinc-300 hover:border-zinc-700 hover:bg-zinc-800 hover:text-white transition-all active:scale-[0.98]"
                      title="Medir área y perímetro de un polígono"
                    >
                      <Square className="h-4 w-4 text-zinc-200" />
                      <span className="text-[11px] font-medium">Área</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => mapRef.current?.clearDrawings?.()}
                      className="flex flex-col items-center justify-center gap-1.5 rounded-xl border border-zinc-800 bg-zinc-900/50 p-2.5 text-zinc-400 hover:border-rose-900/60 hover:bg-rose-950/30 hover:text-rose-300 transition-all active:scale-[0.98]"
                      title="Limpiar dibujos y mediciones"
                    >
                      <Trash2 className="h-4 w-4 text-zinc-400" />
                      <span className="text-[11px] font-medium">Limpiar</span>
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
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
          coordinateSystem={selectedCoordinateSystem}
          filters={filters}
          onLayerData={setLayerData}
          onSgcState={setSgcState}
          panelOpen={isDrawerOpen}
          blendMode={blendMode}
          onBlendModeChange={setBlendMode}
        />
      </div>

      {/* Buscador modo isla centrado en la parte superior */}
      <div className="fixed top-4 left-1/2 -translate-x-1/2 z-30 flex flex-col items-center pointer-events-auto">
        {/* Barra de búsqueda estilo cápsula flotante */}
        <div className="relative flex items-center w-[92vw] sm:w-[460px] h-12 rounded-full border border-zinc-800 bg-[#09090b]/95 px-4 shadow-[0_16px_36px_-6px_rgba(0,0,0,0.8)] backdrop-blur-2xl transition-all focus-within:border-zinc-700 focus-within:ring-1 focus-within:ring-zinc-600">
          <Search className="h-4.5 w-4.5 shrink-0 text-zinc-400 mr-3" />
          <input
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
                if (islandSelectedIndex >= 0 && islandSuggestions[islandSelectedIndex]) {
                  const sel = islandSuggestions[islandSelectedIndex]
                  const code = typeof sel === "string" ? sel : sel?.code
                  if (code) handleSelectIslandExpedient(code)
                } else if (islandSearchText.trim()) {
                  handleSelectIslandExpedient(islandSearchText.trim())
                }
              } else if (e.key === "Escape") {
                setIslandResultsOpen(false)
              }
            }}
            placeholder="Buscar expediente..."
            className="h-full w-full bg-transparent text-[13.5px] text-zinc-100 placeholder:text-zinc-500 focus:outline-none"
          />
          {islandLoading && <Loader2 className="h-4 w-4 shrink-0 text-zinc-400 animate-spin ml-2" />}
          {islandSearchText && !islandLoading && (
            <button
              type="button"
              onClick={() => {
                setIslandSearchText("")
                setIslandSuggestions([])
                setIslandResultsOpen(false)
              }}
              className="rounded-full p-1 text-zinc-400 hover:bg-zinc-800 hover:text-zinc-200 transition-colors ml-1"
              title="Limpiar búsqueda"
              aria-label="Limpiar búsqueda"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          )}
          <button
            type="button"
            onClick={() => {
              if (islandSelectedIndex >= 0 && islandSuggestions[islandSelectedIndex]) {
                const sel = islandSuggestions[islandSelectedIndex]
                const code = typeof sel === "string" ? sel : sel?.code
                if (code) handleSelectIslandExpedient(code)
              } else if (islandSearchText.trim()) {
                handleSelectIslandExpedient(islandSearchText.trim())
              }
            }}
            className="ml-2 shrink-0 rounded-full bg-zinc-800 hover:bg-zinc-700 px-3.5 py-1.5 text-xs font-semibold text-zinc-100 transition-colors shadow-sm"
          >
            Buscar
          </button>

          {/* Desplegable de sugerencias que emerge hacia abajo */}
          {islandResultsOpen && islandSuggestions.length > 0 && (
            <div
              role="listbox"
              aria-label="Sugerencias de expediente"
              className="absolute top-full left-0 right-0 mt-2 max-h-60 overflow-y-auto rounded-2xl border border-zinc-800 bg-[#09090b]/95 p-1.5 shadow-2xl backdrop-blur-2xl z-30"
            >
              {islandSuggestions.map((item, index) => {
                const code = typeof item === "string" ? item : (item?.code || "")
                const layerName = typeof item === "object" ? item?.layerName : null
                const isSelected = index === islandSelectedIndex
                return (
                  <div
                    key={code || index}
                    role="option"
                    aria-selected={isSelected}
                    onClick={() => handleSelectIslandExpedient(code)}
                    className={`flex cursor-pointer items-center justify-between rounded-xl px-3 py-2 text-xs transition-colors ${
                      isSelected ? "bg-zinc-800 text-white font-medium" : "text-zinc-300 hover:bg-zinc-800/60"
                    }`}
                  >
                    <div className="flex items-center gap-2">
                      <Search className="h-3.5 w-3.5 text-zinc-400" />
                      <span className="font-mono font-medium text-zinc-100">{code}</span>
                    </div>
                    <span
                      className={`rounded-full px-2 py-0.5 text-[10px] font-semibold border ${
                        layerName?.toLowerCase().includes("solicitud") ||
                        layerName?.toLowerCase().includes("trámite") ||
                        layerName?.toLowerCase().includes("tramite")
                          ? "bg-amber-500/10 text-amber-300 border-amber-500/20"
                          : "bg-emerald-500/10 text-emerald-300 border-emerald-500/20"
                      }`}
                    >
                      {layerName || "Expediente"}
                    </span>
                  </div>
                )
              })}
            </div>
          )}
        </div>

        {/* Acciones de expediente activo si existe */}
        {showToggle && (
          <div className="mt-2.5 flex items-center gap-2.5 rounded-full border border-zinc-800/90 bg-[#09090b]/95 px-4 py-1.5 shadow-2xl backdrop-blur-xl animate-in fade-in slide-in-from-top-2">
            <span className="flex items-center gap-2 font-mono text-[12.5px] font-semibold text-emerald-400">
              <span className="h-2 w-2 rounded-full bg-emerald-400 animate-pulse" />
              {expedientCode || "Expediente activo"}
            </span>

            <div className="h-3.5 w-px bg-zinc-800" />

            <div className="flex items-center gap-1.5">
              {coordinatesAvailable && (
                <button
                  type="button"
                  onClick={handleShowCoordinates}
                  title="Ver tabla de coordenadas"
                  aria-label="Ver coordenadas"
                  className="flex h-7 w-7 items-center justify-center rounded-lg border border-zinc-800 bg-zinc-900/80 text-zinc-300 hover:border-zinc-700 hover:bg-zinc-800 hover:text-white transition-all shadow-sm active:scale-95"
                >
                  <TableIcon className="h-3.5 w-3.5" />
                </button>
              )}
              <button
                type="button"
                onClick={handleExportSHP}
                title="Exportar expediente"
                aria-label="Exportar expediente"
                className="flex h-7 w-7 items-center justify-center rounded-lg border border-zinc-800 bg-zinc-900/80 text-zinc-300 hover:border-zinc-700 hover:bg-zinc-800 hover:text-white transition-all shadow-sm active:scale-95"
              >
                <Download className="h-3.5 w-3.5" />
              </button>
              <button
                type="button"
                onClick={() => {
                  handleReset()
                  setIslandSearchText("")
                  setIslandResultsOpen(false)
                }}
                className="flex h-7 w-7 items-center justify-center rounded-lg border border-transparent text-zinc-400 hover:border-zinc-800 hover:bg-zinc-900 hover:text-zinc-200 transition-all active:scale-95"
                title="Borrar expediente activo"
                aria-label="Borrar expediente activo"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
          </div>
        )}
      </div>

      {showTable && (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/70 backdrop-blur-md">
          <div className="bg-[#09090b] border border-zinc-800 p-6 rounded-2xl shadow-2xl w-full max-w-md m-4 text-zinc-100">
            <div className="mb-4 flex items-baseline gap-2">
              <h2 className="text-xl font-semibold text-zinc-100">Coordenadas</h2>
              <span className="text-[13px] text-zinc-400">
                {crsById(selectedCoordinateSystem).label}
              </span>
              <span className="font-mono text-[10px] text-zinc-300 bg-zinc-800/80 px-1.5 py-0.5 rounded border border-zinc-700">
                EPSG:{selectedCoordinateSystem}
              </span>
            </div>
            <div className="overflow-auto max-h-[60vh] rounded-xl border border-zinc-800">
              <Table>
                <TableHeader>
                  <TableRow className="border-zinc-800 bg-zinc-900/80 hover:bg-zinc-900/80">
                    <TableHead className="text-zinc-300">Punto</TableHead>
                    <TableHead className="text-zinc-300">
                      {axisLabels(selectedCoordinateSystem).first}
                    </TableHead>
                    <TableHead className="text-zinc-300">
                      {axisLabels(selectedCoordinateSystem).second}
                    </TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {transformedCoordinates.map((coord, index) => (
                    <Fragment key={index}>
                      {coordinateRings.length > 1 && ringStartLabels.has(index) && (
                        <TableRow className="border-zinc-800 bg-zinc-900/50">
                          <TableCell
                            colSpan={3}
                            className="text-xs font-semibold text-zinc-300 text-center"
                          >
                            {ringStartLabels.get(index)}
                          </TableCell>
                        </TableRow>
                      )}
                      <TableRow className="border-zinc-800/50 hover:bg-zinc-800/40">
                        <TableCell className="text-center font-mono text-xs text-zinc-400">{index + 1}</TableCell>
                        <TableCell className="text-center font-mono text-xs text-zinc-200">
                          {formatCoordinate(coord[1], selectedCoordinateSystem)}
                        </TableCell>
                        <TableCell className="text-center font-mono text-xs text-zinc-200">
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
              className="mt-4 w-full bg-zinc-800 hover:bg-zinc-700 text-zinc-100 border border-zinc-700 rounded-xl"
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
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/70 backdrop-blur-md">
          <div className="relative bg-[#09090b] border border-zinc-800 p-6 rounded-2xl shadow-2xl w-full max-w-md m-4 text-zinc-100">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-base font-bold tracking-tight text-zinc-100">Tipo de archivo para exportar</h2>
              <button
                type="button"
                onClick={handleCloseExportModal}
                className="rounded-lg p-1.5 text-zinc-400 hover:bg-zinc-800 hover:text-zinc-100 transition-colors"
                aria-label="Cerrar modal de descarga"
              >
                <X className="h-4 w-4" />
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
