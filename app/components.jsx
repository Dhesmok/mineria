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
  RefreshCw,
  Download,
  Globe2,
  ChevronDown,
  Spline,
  Square,
  Trash2,
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

          {/* Botón inferior para fijar / liberar */}
          <div className="flex flex-col items-center gap-2">
            <button
              type="button"
              onClick={() => setIsPinned((p) => !p)}
              title={isPinned ? "Desfijar panel lateral" : "Fijar panel lateral"}
              className={`flex h-9 w-9 items-center justify-center rounded-lg transition-colors ${
                isPinned
                  ? "bg-zinc-800 text-white border border-zinc-700"
                  : "text-zinc-500 hover:bg-zinc-900 hover:text-zinc-300"
              }`}
            >
              {isPinned ? <Pin className="h-4 w-4 fill-white" /> : <PinOff className="h-4 w-4" />}
            </button>
          </div>
        </div>

        {/* Drawer desplegable en negro obsidiana glass (~340px) */}
        <div
          ref={panelRef}
          className={`flex flex-col border-r border-zinc-800/80 bg-[#09090b]/95 text-zinc-100 backdrop-blur-2xl transition-all duration-300 ease-out overflow-hidden ${
            isDrawerOpen
              ? "w-[340px] opacity-100 shadow-[20px_0_40px_rgba(0,0,0,0.6)]"
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
                {drawerTab === "capas" ? "Capas del Proyecto" : "Herramientas"}
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

                {showToggle && (
                  <div className="mt-4 pt-3 border-t border-zinc-800/80 space-y-2">
                    {coordinatesAvailable && (
                      <button
                        type="button"
                        onClick={handleShowCoordinates}
                        className="w-full rounded-xl border border-zinc-700/80 bg-zinc-850/80 hover:bg-zinc-800 py-2 text-center text-xs font-semibold text-zinc-200 hover:text-white transition-colors shadow-sm"
                      >
                        Mostrar coordenadas
                      </button>
                    )}
                    <div className="flex justify-between gap-2">
                      <button
                        type="button"
                        onClick={handleReset}
                        className="flex-1 flex items-center justify-center gap-1.5 rounded-xl border border-zinc-800 bg-zinc-900 hover:bg-zinc-800 py-2 text-xs font-semibold text-zinc-300 hover:text-white transition-colors"
                      >
                        <RefreshCw className="h-3.5 w-3.5" />
                        Borrar
                      </button>
                      <button
                        type="button"
                        onClick={handleExportSHP}
                        className="flex-1 flex items-center justify-center gap-1.5 rounded-xl border border-zinc-700 bg-zinc-800 hover:bg-zinc-700 py-2 text-xs font-semibold text-white transition-colors shadow-sm"
                      >
                        <Download className="h-3.5 w-3.5" />
                        Exportar
                      </button>
                    </div>
                  </div>
                )}
              </>
            ) : (
              <div className="space-y-4">
                {/* 1. Sistema de Coordenadas (PRIMERO) */}
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between">
                    <Label className="text-[11px] font-semibold uppercase tracking-[0.06em] text-slate-400">
                      Sistema de Coordenadas
                    </Label>
                    <span className="font-mono text-[10px] text-sky-400 bg-sky-950/60 px-1.5 py-0.5 rounded border border-sky-800/40">
                      EPSG:{selectedCoordinateSystem}
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={(event) => {
                      const el = event.currentTarget
                      setCrsPopover((actual) => (actual ? null : el))
                    }}
                    className="flex h-9 w-full items-center justify-between rounded-lg border border-slate-750 bg-slate-900/80 px-3 text-left transition-colors hover:border-slate-600 hover:bg-slate-800/80"
                  >
                    <div className="flex items-center gap-2 min-w-0">
                      <Globe2 className="h-4 w-4 shrink-0 text-sky-400" />
                      <span className="min-w-0 truncate text-[13px] font-medium text-slate-200">
                        {crsById(selectedCoordinateSystem).label}
                      </span>
                    </div>
                    <ChevronDown className="h-4 w-4 shrink-0 text-slate-400" />
                  </button>
                </div>

                {/* 2. Fusión de capas */}
                <div className="flex items-center justify-between border-t border-slate-800/80 pt-3">
                  <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider">
                    Fusión de capas
                  </span>
                  <div className="inline-flex rounded-lg border border-slate-750 p-0.5 bg-slate-900 text-[11px]">
                    <button
                      type="button"
                      onClick={() => setBlendMode("multiply")}
                      className={`px-2.5 py-1 rounded-md font-medium transition-colors ${
                        blendMode === "multiply"
                          ? "bg-sky-500/20 text-sky-300 border border-sky-500/40 shadow-sm"
                          : "text-slate-400 hover:text-slate-200"
                      }`}
                      title="Multiplicar: funde con relieve y mapa base"
                    >
                      Multiplicar
                    </button>
                    <button
                      type="button"
                      onClick={() => setBlendMode("normal")}
                      className={`px-2.5 py-1 rounded-md font-medium transition-colors ${
                        blendMode === "normal"
                          ? "bg-sky-500/20 text-sky-300 border border-sky-500/40 shadow-sm"
                          : "text-slate-400 hover:text-slate-200"
                      }`}
                      title="Normal: transparencia simple"
                    >
                      Normal
                    </button>
                  </div>
                </div>

                {/* 3. Medición y Captura */}
                <div className="space-y-2 border-t border-slate-800/80 pt-3">
                  <Label className="text-[11px] font-semibold uppercase tracking-[0.06em] text-slate-400">
                    Medición y Captura
                  </Label>
                  <div className="grid grid-cols-3 gap-2">
                    <button
                      type="button"
                      onClick={() => mapRef.current?.startMode?.("measure-distance")}
                      className="flex flex-col items-center justify-center gap-1 rounded-lg border border-slate-750 bg-slate-900/60 p-2 text-slate-300 hover:border-slate-600 hover:bg-slate-800 hover:text-slate-100 transition-colors"
                      title="Medir distancia lineal entre puntos"
                    >
                      <Spline className="h-4 w-4 text-sky-400" />
                      <span className="text-[10px] font-medium">Distancia</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => mapRef.current?.startMode?.("measure-area")}
                      className="flex flex-col items-center justify-center gap-1 rounded-lg border border-slate-750 bg-slate-900/60 p-2 text-slate-300 hover:border-slate-600 hover:bg-slate-800 hover:text-slate-100 transition-colors"
                      title="Medir área y perímetro de un polígono"
                    >
                      <Square className="h-4 w-4 text-emerald-400" />
                      <span className="text-[10px] font-medium">Área</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => mapRef.current?.clearDrawings?.()}
                      className="flex flex-col items-center justify-center gap-1 rounded-lg border border-slate-750 bg-slate-900/60 p-2 text-slate-300 hover:border-rose-700/60 hover:bg-rose-950/30 hover:text-rose-300 transition-colors"
                      title="Limpiar dibujos y mediciones"
                    >
                      <Trash2 className="h-4 w-4 text-rose-400" />
                      <span className="text-[10px] font-medium">Limpiar</span>
                    </button>
                  </div>
                </div>

                {/* 4. Mapas Base (cards 2x2) */}
                <div className="space-y-2 border-t border-slate-800/80 pt-3">
                  <Label className="text-[11px] font-semibold uppercase tracking-[0.06em] text-slate-400">
                    Mapa Base
                  </Label>
                  <div className="grid grid-cols-2 gap-2">
                    {[
                      { id: "positron", label: "Claro", desc: "Cartográfico", bgClass: "from-slate-300 to-slate-400 text-slate-900" },
                      { id: "topo", label: "Relieve", desc: "Topográfico", bgClass: "from-emerald-900 to-slate-900 text-emerald-200" },
                      { id: "satellite", label: "Satélite", desc: "Google Satelital", bgClass: "from-sky-950 to-slate-900 text-sky-200" },
                      { id: "osm", label: "Calles", desc: "OpenStreetMap", bgClass: "from-slate-800 to-slate-900 text-slate-200" },
                    ].map((item) => (
                      <button
                        key={item.id}
                        type="button"
                        onClick={() => mapRef.current?.chooseBasemap?.(item.id)}
                        className="group relative flex flex-col overflow-hidden rounded-lg border border-slate-750 bg-slate-900/80 p-2 text-left transition-all hover:border-sky-500/50 hover:shadow-lg"
                      >
                        <div className={`h-10 w-full rounded bg-gradient-to-br ${item.bgClass} mb-1.5 flex items-center justify-center font-mono text-[10px] font-semibold opacity-90 group-hover:opacity-100 transition-opacity`}>
                          {item.label}
                        </div>
                        <span className="text-[11px] font-medium text-slate-200">{item.label}</span>
                        <span className="text-[9px] text-slate-500 truncate">{item.desc}</span>
                      </button>
                    ))}
                  </div>
                </div>

                {/* 5. Datos y Exportación */}
                <div className="space-y-2 border-t border-slate-800/80 pt-3">
                  <Label className="text-[11px] font-semibold uppercase tracking-[0.06em] text-slate-400">
                    Datos y Exportación
                  </Label>
                  <div className="space-y-1.5">
                    <button
                      type="button"
                      onClick={() => setShowAttributeTable(true)}
                      className="flex h-8 w-full items-center justify-between rounded-lg border border-slate-750 bg-slate-900/60 px-3 text-[12px] font-medium text-slate-300 hover:border-slate-600 hover:bg-slate-800 hover:text-slate-100 transition-colors"
                    >
                      <span>Tabla de atributos</span>
                      <span className="font-mono text-[10px] text-slate-500">{registrosVisibles.length} en pantalla</span>
                    </button>
                    <button
                      type="button"
                      onClick={handleExportSHP}
                      className="flex h-8 w-full items-center justify-between rounded-lg border border-emerald-800/50 bg-emerald-950/30 px-3 text-[12px] font-medium text-emerald-300 hover:bg-emerald-900/40 transition-colors"
                    >
                      <span>Exportar Shapefile / GeoJSON</span>
                      <Download className="h-3.5 w-3.5" />
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

      {/* Buscador modo isla centrado en la parte inferior */}
      <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-20 flex flex-col items-center pointer-events-auto">
        {/* Acciones de expediente activo si existe */}
        {showToggle && (
          <div className="mb-2 flex items-center gap-2 rounded-full border border-zinc-800 bg-[#09090b]/95 px-3.5 py-1 shadow-2xl backdrop-blur-xl animate-in fade-in slide-in-from-bottom-2">
            <span className="flex items-center gap-1.5 text-xs font-semibold text-emerald-400">
              <span className="h-2 w-2 rounded-full bg-emerald-400 animate-pulse" />
              {expedientCode || "Expediente activo"}
            </span>
            {coordinatesAvailable && (
              <button
                type="button"
                onClick={handleShowCoordinates}
                className="rounded-full bg-zinc-800/90 px-2.5 py-0.5 text-[11px] font-medium text-zinc-200 hover:bg-zinc-700 transition-colors"
              >
                Coordenadas
              </button>
            )}
            <button
              type="button"
              onClick={handleExportSHP}
              className="rounded-full bg-zinc-800 hover:bg-zinc-700 text-zinc-200 border border-zinc-700 px-2.5 py-0.5 text-[11px] font-medium transition-colors"
            >
              Exportar
            </button>
            <button
              type="button"
              onClick={() => {
                handleReset()
                setIslandSearchText("")
                setIslandResultsOpen(false)
              }}
              className="rounded-full p-1 text-zinc-400 hover:bg-zinc-800 hover:text-zinc-200 transition-colors"
              title="Cerrar ficha"
              aria-label="Cerrar ficha"
            >
              <X className="h-3 w-3" />
            </button>
          </div>
        )}

        {/* Desplegable de sugerencias que emerge hacia arriba */}
        {islandResultsOpen && islandSuggestions.length > 0 && (
          <div
            role="listbox"
            aria-label="Sugerencias de expediente"
            className="absolute bottom-full mb-2.5 w-[92vw] sm:w-[420px] max-h-60 overflow-y-auto rounded-2xl border border-zinc-800 bg-[#09090b]/95 p-1.5 shadow-2xl backdrop-blur-2xl"
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

        {/* Barra de búsqueda estilo cápsula flotante */}
        <div className="relative flex items-center w-[92vw] sm:w-[420px] h-11 rounded-full border border-zinc-800 bg-[#09090b]/95 px-3.5 shadow-[0_16px_36px_-6px_rgba(0,0,0,0.8)] backdrop-blur-2xl transition-all focus-within:border-zinc-700 focus-within:ring-1 focus-within:ring-zinc-600">
          <Search className="h-4 w-4 shrink-0 text-zinc-400 mr-2.5" />
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
            className="h-full w-full bg-transparent text-[13px] text-zinc-100 placeholder:text-zinc-500 focus:outline-none"
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
            className="ml-2 shrink-0 rounded-full bg-zinc-800 hover:bg-zinc-700 px-3 py-1 text-[11px] font-semibold text-zinc-100 transition-colors shadow-sm"
          >
            Buscar
          </button>
        </div>
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
          <div className="bg-[#09090b] border border-zinc-800 p-6 rounded-2xl shadow-2xl w-full max-w-md m-4 text-zinc-100">
            <h2 className="text-xl font-bold mb-4 text-zinc-100">Tipo de archivo</h2>
            <ExportComponent
              geoJsonData={geoJsonData}
              selectedCoordinateSystem={selectedCoordinateSystem}
              expedientCode={expedientCode}
            />
            <Button
              onClick={handleCloseExportModal}
              className="mt-4 w-full bg-zinc-800 hover:bg-zinc-700 text-zinc-100 border border-zinc-700 rounded-xl"
            >
              Cerrar
            </Button>
          </div>
        </div>
      )}
    </div>
  )
}
