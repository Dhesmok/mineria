"use client"

import { Fragment, useState, useEffect, useCallback, useMemo, useRef } from "react"
import dynamic from "next/dynamic"
import { Label } from "@/components/ui/label"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { Switch } from "@/components/ui/switch"
import { Table, TableHeader, TableRow, TableHead, TableBody, TableCell } from "@/components/ui/table"
import { Loader2, ChevronLeft, Search, Download, RefreshCw, ChevronRight } from "lucide-react"
import proj4 from "proj4"
import ExportComponent from "./ExportComponent"
import { formatDegrees } from "./utils/mapUtils"
import { fetchArcgisJson } from "./utils/arcgis"
import {
  findTenureLayerNumbers,
  REQUEST_LAYER_NAME,
  TITLE_LAYER_NAME,
  tenureLayerUrl,
} from "./utils/tenureLayers"
import { debounce } from "@/lib/utils"

const MapComponent = dynamic(() => import("./MapComponent"), {
  ssr: false,
  loading: () => <p>Cargando mapa...</p>,
})

// Definición de los sistemas de coordenadas
const epsg4686 = "+proj=longlat +ellps=GRS80 +towgs84=0,0,0,0,0,0,0 +no_defs"
const epsg9377 =
  "+proj=tmerc +lat_0=4.0 +lon_0=-73.0 +k=0.9992 +x_0=5000000 +y_0=2000000 +ellps=GRS80 +towgs84=0,0,0,0,0,0,0 +units=m +no_defs"

const MIN_SUGGESTION_LENGTH = 3
const MAX_SUGGESTIONS = 10

/** Etiqueta, slider de opacidad e interruptor de una capa. */
const LayerControl = ({ id, label, checked, onCheckedChange, opacity, onOpacityChange }) => (
  <>
    {/* Ancho fijo para que las cuatro filas queden alineadas: sin él la etiqueta más
        larga partía en dos líneas y desnivelaba su fila. */}
    <Label htmlFor={id} className="w-36 shrink-0 whitespace-nowrap text-sm">
      {label}
    </Label>
    <input
      type="range"
      min="0"
      max="1"
      step="0.1"
      value={opacity}
      onChange={(e) => onOpacityChange(parseFloat(e.target.value))}
      className="flex-1 disabled:opacity-40"
      // El slider no hace nada con la capa apagada; deshabilitarlo lo deja claro.
      disabled={!checked}
      aria-label={`Opacidad de ${label}`}
    />
    <Switch id={id} checked={checked} onCheckedChange={onCheckedChange} />
  </>
)

export default function Component() {
  const [showSidebar, setShowSidebar] = useState(true)
  const [showTable, setShowTable] = useState(false)
  const [coordinates, setCoordinates] = useState([])
  const [coordinateRings, setCoordinateRings] = useState([])
  const [transformedCoordinates, setTransformedCoordinates] = useState([])
  const [showToggle, setShowToggle] = useState(false)
  const [showExportModal, setShowExportModal] = useState(false)
  const [selectedCoordinateSystem, setSelectedCoordinateSystem] = useState("4686")
  const [expedientCode, setExpedientCode] = useState("")
  const [searchTrigger, setSearchTrigger] = useState(0)
  const [coordinatesAvailable, setCoordinatesAvailable] = useState(false)
  const [geoJsonData, setGeoJsonData] = useState(null)
  const mapRef = useRef(null)
  const [mapInitialized, setMapInitialized] = useState(false)
  const [expedientSuggestions, setExpedientSuggestions] = useState([])
  const [activeSuggestion, setActiveSuggestion] = useState(-1)
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState(null)
  const inputRef = useRef(null)
  const searchBoxRef = useRef(null)
  const suggestionAbortRef = useRef(null)
  const skipNextSuggestionFetchRef = useRef(false)
  const [showTitleLayer, setShowTitleLayer] = useState(false)
  const [showRequestLayer, setShowRequestLayer] = useState(false)
  const [showAnmServiceLayer, setShowAnmServiceLayer] = useState(false)
  const [showHistoricalTitleLayer, setShowHistoricalTitleLayer] = useState(false)
  const [titleOpacity, setTitleOpacity] = useState(0.6)
  const [requestOpacity, setRequestOpacity] = useState(0.7)
  const [anmServiceOpacity, setAnmServiceOpacity] = useState(0.7)
  const [historicalTitleOpacity, setHistoricalTitleOpacity] = useState(0.5)

  const handleApply = useCallback(() => {
    if (!expedientCode) {
      alert("Por favor, introduce un código de expediente.")
      return
    }
    setExpedientSuggestions([])
    setSearchTrigger((prev) => prev + 1)
    setShowToggle(true)
  }, [expedientCode])

  const closeSuggestions = useCallback(() => {
    setExpedientSuggestions([])
    setActiveSuggestion(-1)
  }, [])

  const selectSuggestion = useCallback(
    (suggestion) => {
      skipNextSuggestionFetchRef.current = true
      setExpedientCode(suggestion)
      closeSuggestions()
      inputRef.current?.focus()
    },
    [closeSuggestions],
  )

  const handleSearchKeyDown = useCallback(
    (event) => {
      if (event.key === "Escape") {
        closeSuggestions()
        return
      }

      if (expedientSuggestions.length === 0) {
        if (event.key === "Enter") handleApply()
        return
      }

      if (event.key === "ArrowDown" || event.key === "ArrowUp") {
        event.preventDefault()
        const step = event.key === "ArrowDown" ? 1 : -1
        setActiveSuggestion((current) => {
          const next = current + step
          if (next < 0) return expedientSuggestions.length - 1
          if (next >= expedientSuggestions.length) return 0
          return next
        })
        return
      }

      if (event.key === "Enter") {
        event.preventDefault()
        if (activeSuggestion >= 0) {
          selectSuggestion(expedientSuggestions[activeSuggestion])
        } else {
          closeSuggestions()
          handleApply()
        }
      }
    },
    [activeSuggestion, closeSuggestions, expedientSuggestions, handleApply, selectSuggestion],
  )

  // Reiniciar el resaltado cada vez que cambia la lista.
  useEffect(() => {
    setActiveSuggestion(-1)
  }, [expedientSuggestions])

  const handleShowCoordinates = () => {
    if (coordinatesAvailable) {
      setShowTable(true)
    } else {
      alert("No hay coordenadas disponibles para mostrar.")
    }
  }

  const handleCloseTable = () => {
    setShowTable(false)
  }

  const handleReset = () => {
    setExpedientCode("")
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

  // Índice del primer vértice de cada anillo, para intercalar un encabezado en la
  // tabla. Sin esto los huecos y las partes de un multipolígono se numeraban
  // seguidos, como si fueran un único contorno.
  const ringStartLabels = useMemo(() => {
    const labels = new Map()
    let offset = 0
    coordinateRings.forEach((ring) => {
      labels.set(offset, ring.label)
      offset += ring.coordinates.length
    })
    return labels
  }, [coordinateRings])

  const transformCoordinates = useCallback((coords, fromEPSG, toEPSG) => {
    return coords.map((coord) => {
      const [x, y] = proj4(fromEPSG, toEPSG, coord)
      return [x, y]
    })
  }, [])

  useEffect(() => {
    // Recalcular también cuando no hay coordenadas: antes se conservaban las del
    // expediente anterior tras una búsqueda sin resultados.
    if (coordinates.length === 0) {
      setTransformedCoordinates([])
      return
    }
    if (selectedCoordinateSystem === "4686") {
      setTransformedCoordinates(coordinates)
    } else {
      setTransformedCoordinates(transformCoordinates(coordinates, epsg4686, epsg9377))
    }
  }, [coordinates, selectedCoordinateSystem, transformCoordinates])

  const handleMapInitialized = useCallback((map) => {
    mapRef.current = map
    setMapInitialized(true)
  }, [])

  const fetchExpedients = useCallback(async (query) => {
    // Cancelar la consulta anterior: sin esto una respuesta lenta podía llegar después
    // de una más reciente y pisar sus sugerencias.
    suggestionAbortRef.current?.abort()
    const controller = new AbortController()
    suggestionAbortRef.current = controller

    setIsLoading(true)
    setError(null)
    try {
      const sanitizedQuery = query.trim().toUpperCase().replace(/'/g, "''")
      const whereClause = `(UPPER(TENURE_ID) LIKE '${sanitizedQuery}%' OR UPPER(CODIGO_EXPEDIENTE) LIKE '${sanitizedQuery}%')`
      const queryString = `query?where=${encodeURIComponent(whereClause)}&outFields=CODIGO_EXPEDIENTE,TENURE_ID&returnGeometry=false&f=json`

      // Los números de las capas de tenencia se descubren, igual que en el mapa y en
      // la búsqueda. Aquí estaban fijos en 3 y 4, y podían discrepar del resto.
      const layerNumbers = await findTenureLayerNumbers()
      if (controller.signal.aborted) return

      const urls = [
        ...[TITLE_LAYER_NAME, REQUEST_LAYER_NAME]
          .map((name) => layerNumbers[name])
          .filter((layerNumber) => layerNumber !== undefined)
          .map((layerNumber) => `${tenureLayerUrl(layerNumber)}/${queryString}`),
        `https://geo.anm.gov.co/webgis/rest/services/ANM/ServiciosANM/MapServer/3/${queryString}`,
        `https://annamineria.anm.gov.co/annageo/rest/services/SIGM/VisorInterno/MapServer/87/${queryString}`,
      ]

      // fetchArcgisJson reconoce los errores que ArcGIS devuelve con HTTP 200; antes
      // una capa que respondía {"error": ...} se contaba como consulta exitosa sin
      // resultados, y las sugerencias salían incompletas en silencio.
      const settled = await Promise.allSettled(
        urls.map((url) => fetchArcgisJson(url, { signal: controller.signal })),
      )
      if (controller.signal.aborted) return

      const data = settled.filter((result) => result.status === "fulfilled").map((result) => result.value)

      const expedients = data.flatMap((d) =>
        (d.features || [])
          .map((f) => f.attributes?.CODIGO_EXPEDIENTE || f.attributes?.TENURE_ID)
          .filter(Boolean),
      )
      const uniqueExpedients = [...new Set(expedients)]
      setExpedientSuggestions(uniqueExpedients.slice(0, MAX_SUGGESTIONS))

      if (data.length === 0) {
        throw new Error("No fue posible consultar las capas de sugerencias.")
      }
    } catch (error) {
      if (error?.name === "AbortError" || controller.signal.aborted) return
      console.error("Error fetching expedients:", error)
      setError("Error al cargar los expedientes. Por favor, intente de nuevo.")
    } finally {
      if (!controller.signal.aborted) {
        setIsLoading(false)
      }
    }
  }, [])

  const debouncedFetchExpedients = useCallback(
    debounce((query) => fetchExpedients(query), 300),
    [fetchExpedients],
  )

  useEffect(() => {
    // Elegir una sugerencia cambia expedientCode, lo que volvía a disparar la consulta
    // y reabría el desplegable 300 ms después de haberlo cerrado.
    if (skipNextSuggestionFetchRef.current) {
      skipNextSuggestionFetchRef.current = false
      return
    }

    // Con una sola letra, `LIKE 'A%'` barre el dataset nacional entero sin dar nada útil.
    if (expedientCode.trim().length < MIN_SUGGESTION_LENGTH) {
      suggestionAbortRef.current?.abort()
      setExpedientSuggestions([])
      setIsLoading(false)
      return
    }

    debouncedFetchExpedients(expedientCode)
  }, [expedientCode, debouncedFetchExpedients])

  useEffect(() => {
    // Contra el contenedor, no contra el input: el desplegable vive dentro y un clic
    // en una sugerencia se contaba como clic fuera.
    const handleClickOutside = (event) => {
      if (searchBoxRef.current && !searchBoxRef.current.contains(event.target)) {
        closeSuggestions()
      }
    }

    document.addEventListener("click", handleClickOutside)
    return () => {
      document.removeEventListener("click", handleClickOutside)
    }
  }, [closeSuggestions])

  useEffect(() => {
    return () => {
      suggestionAbortRef.current?.abort()
    }
  }, [])

  return (
    <div className="relative flex w-full h-screen bg-gray-100">
      <div
        // -translate-x-full solo desplaza el ancho del panel, y al estar en left-4
        // quedaba una franja de 16px asomando bajo el botón de mostrar.
        className={`absolute top-4 left-4 z-10 w-[350px] bg-white shadow-lg rounded-xl transition-transform duration-300 ease-in-out ${showSidebar ? "translate-x-0" : "-translate-x-[calc(100%+1rem)]"}`}
      >
        <div className="p-4 space-y-4">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-xl font-semibold">Títulos y Solicitudes</h2>
            <Button
              variant="ghost"
              onClick={() => setShowSidebar(false)}
              className="p-1 rounded-full"
              aria-label="Ocultar panel"
              title="Ocultar panel"
            >
              <ChevronLeft className="h-6 w-6" />
            </Button>
          </div>
          <div className="space-y-4">
            <div>
              <Label htmlFor="search" className="text-sm font-medium mb-1 block">
                Buscar Expediente
              </Label>
              {/* El desplegable vive dentro de este contenedor posicionado. Antes era
                  hermano suyo, así que su ancho se medía contra la barra lateral
                  completa y se desbordaba por el padding. */}
              <div className="relative" ref={searchBoxRef}>
                <Input
                  ref={inputRef}
                  id="search"
                  placeholder="Ingrese el expediente"
                  value={expedientCode}
                  onChange={(e) => setExpedientCode(e.target.value.toUpperCase())}
                  onKeyDown={handleSearchKeyDown}
                  className="pl-10 pr-4 py-2 w-full border rounded-md"
                  role="combobox"
                  autoComplete="off"
                  aria-autocomplete="list"
                  aria-controls="expedient-suggestions"
                  aria-expanded={expedientSuggestions.length > 0}
                  aria-activedescendant={
                    activeSuggestion >= 0 ? `expedient-suggestion-${activeSuggestion}` : undefined
                  }
                />
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400" size={18} />
                {isLoading && (
                  <div className="absolute right-3 top-1/2 transform -translate-y-1/2">
                    <Loader2 className="h-5 w-5 animate-spin text-blue-500" />
                  </div>
                )}
                {expedientSuggestions.length > 0 && (
                  <ul
                    id="expedient-suggestions"
                    role="listbox"
                    aria-label="Expedientes sugeridos"
                    className="absolute left-0 right-0 top-full z-20 mt-1 bg-white border rounded-md shadow-lg max-h-60 overflow-auto"
                  >
                    {expedientSuggestions.map((suggestion, index) => (
                      <li
                        key={suggestion}
                        id={`expedient-suggestion-${index}`}
                        role="option"
                        aria-selected={index === activeSuggestion}
                        className={`px-4 py-2 cursor-pointer ${
                          index === activeSuggestion ? "bg-blue-50" : "hover:bg-gray-100"
                        }`}
                        // onMouseDown, no onClick: el clic fuera cierra la lista antes
                        // de que llegue el onClick del elemento.
                        onMouseDown={(event) => {
                          event.preventDefault()
                          selectSuggestion(suggestion)
                        }}
                        onMouseEnter={() => setActiveSuggestion(index)}
                      >
                        {suggestion}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
              {error && <p className="text-red-500 text-sm mt-1">{error}</p>}
            </div>
          </div>
          <Button onClick={handleApply} className="w-full bg-blue-500 hover:bg-blue-600 text-white">
            Aplicar
          </Button>
          <div className="space-y-4">
            <div className="flex items-center gap-2">
              <LayerControl
                id="titleLayer"
                label="Títulos Vigentes"
                checked={showTitleLayer}
                onCheckedChange={setShowTitleLayer}
                opacity={titleOpacity}
                onOpacityChange={setTitleOpacity}
              />
            </div>
            <div className="flex items-center gap-2">
              <LayerControl
                id="requestLayer"
                label="Solicitudes Vigentes"
                checked={showRequestLayer}
                onCheckedChange={setShowRequestLayer}
                opacity={requestOpacity}
                onOpacityChange={setRequestOpacity}
              />
            </div>
            <div className="flex items-center gap-2">
              <LayerControl
                id="anmServiceLayer"
                label="Subcontratos"
                checked={showAnmServiceLayer}
                onCheckedChange={setShowAnmServiceLayer}
                opacity={anmServiceOpacity}
                onOpacityChange={setAnmServiceOpacity}
              />
            </div>
            <div className="flex items-center gap-2">
              <LayerControl
                id="historicalTitleLayer"
                label="Título Histórico"
                checked={showHistoricalTitleLayer}
                onCheckedChange={setShowHistoricalTitleLayer}
                opacity={historicalTitleOpacity}
                onOpacityChange={setHistoricalTitleOpacity}
              />
            </div>
          </div>

          {showToggle && (
            <div className="space-y-4">
              {coordinatesAvailable && (
                <Button
                  variant="outline"
                  onClick={handleShowCoordinates}
                  className="w-full border text-blue-500 hover:bg-blue-50"
                >
                  Mostrar coordenadas
                </Button>
              )}
              <div className="flex justify-between gap-4">
                <Button
                  variant="outline"
                  onClick={handleReset}
                  className="flex-1 border text-gray-700 hover:bg-gray-100"
                >
                  <RefreshCw className="mr-2" size={18} />
                  Borrar
                </Button>
                <Button onClick={handleExportSHP} className="flex-1 bg-green-500 hover:bg-green-600 text-white">
                  <Download className="mr-2" size={18} />
                  Exportar
                </Button>
              </div>
            </div>
          )}
        </div>
      </div>
      <div className="flex-grow relative">
        <MapComponent
          expedientCode={expedientCode}
          onCoordinatesUpdate={handleCoordinatesUpdate}
          searchTrigger={searchTrigger}
          onMapInitialized={handleMapInitialized}
          showTitleLayer={showTitleLayer}
          showRequestLayer={showRequestLayer}
          showAnmServiceLayer={showAnmServiceLayer}
          showHistoricalTitleLayer={showHistoricalTitleLayer}
          titleOpacity={titleOpacity}
          requestOpacity={requestOpacity}
          anmServiceOpacity={anmServiceOpacity}
          historicalTitleOpacity={historicalTitleOpacity}
        />
        {!showSidebar && (
          <Button
            variant="outline"
            onClick={() => setShowSidebar(true)}
            className="absolute top-4 left-4 z-20 bg-white shadow-md rounded-full p-2"
            aria-label="Mostrar panel"
            title="Mostrar panel"
          >
            <ChevronRight className="h-6 w-6" />
          </Button>
        )}
      </div>
      {showTable && (
        <div className="fixed inset-0 z-30 flex items-center justify-center bg-black bg-opacity-50 backdrop-blur-sm">
          <div className="bg-white p-6 rounded-lg shadow-xl w-full max-w-md m-4">
            <h2 className="text-2xl font-bold mb-4 text-gray-800">Coordenadas</h2>
            <div className="mb-4 flex justify-center">
              <div className="bg-gray-100 p-1 rounded-full flex items-center">
                <Button
                  variant={selectedCoordinateSystem === "4686" ? "default" : "ghost"}
                  onClick={() => setSelectedCoordinateSystem("4686")}
                  className={`rounded-full px-4 ${selectedCoordinateSystem === "4686" ? "bg-blue-500 text-white" : "text-gray-700"}`}
                >
                  Magna-Sirgas
                </Button>
                <Button
                  variant={selectedCoordinateSystem === "9377" ? "default" : "ghost"}
                  onClick={() => setSelectedCoordinateSystem("9377")}
                  className={`rounded-full px-4 ${selectedCoordinateSystem === "9377" ? "bg-blue-500 text-white" : "text-gray-700"}`}
                >
                  Origen Nacional
                </Button>
              </div>
            </div>
            <div className="overflow-auto max-h-[60vh]">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="bg-gray-100 text-gray-700">Punto</TableHead>
                    <TableHead className="bg-gray-100 text-gray-700">
                      {selectedCoordinateSystem === "4686" ? "Latitud" : "Norte"}
                    </TableHead>
                    <TableHead className="bg-gray-100 text-gray-700">
                      {selectedCoordinateSystem === "4686" ? "Longitud" : "Este"}
                    </TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {transformedCoordinates.map((coord, index) => (
                    <Fragment key={index}>
                      {coordinateRings.length > 1 && ringStartLabels.has(index) && (
                        <TableRow>
                          <TableCell
                            colSpan={3}
                            className="bg-gray-100 text-xs font-semibold text-gray-600 text-center"
                          >
                            {ringStartLabels.get(index)}
                          </TableCell>
                        </TableRow>
                      )}
                      <TableRow>
                        <TableCell className="text-center">{index + 1}</TableCell>
                        <TableCell className="text-center">
                          {selectedCoordinateSystem === "4686" ? formatDegrees(coord[1]) : Math.round(coord[1])}
                        </TableCell>
                        <TableCell className="text-center">
                          {selectedCoordinateSystem === "4686" ? formatDegrees(coord[0]) : Math.round(coord[0])}
                        </TableCell>
                      </TableRow>
                    </Fragment>
                  ))}
                </TableBody>
              </Table>
            </div>
            <Button onClick={handleCloseTable} className="mt-4 w-full bg-red-500 hover:bg-red-600 text-white">
              Cerrar
            </Button>
          </div>
        </div>
      )}
      {showExportModal && (
        <div className="fixed inset-0 z-30 flex items-center justify-center bg-black bg-opacity-50 backdrop-blur-sm">
          <div className="bg-white p-6 rounded-lg shadow-xl w-full max-w-md m-4">
            <h2 className="text-2xl font-bold mb-4 text-gray-800">Tipo de archivo</h2>
            <ExportComponent
              geoJsonData={geoJsonData}
              selectedCoordinateSystem={selectedCoordinateSystem}
              expedientCode={expedientCode}
            />
            <Button onClick={handleCloseExportModal} className="mt-4 w-full bg-red-500 hover:bg-red-600 text-white">
              Cerrar
            </Button>
          </div>
        </div>
      )}
    </div>
  )
}
