"use client"

import { useState, useEffect, useCallback, useRef } from "react"
import dynamic from "next/dynamic"
import { Label } from "@/components/ui/label"
import { Input } from "@/components/ui/input"
import { Switch } from "@/components/ui/switch"
import { Button } from "@/components/ui/button"
import { Table, TableHeader, TableRow, TableHead, TableBody, TableCell } from "@/components/ui/table"
import { Loader2, ChevronLeft, Search, Download, RefreshCw, ChevronRight } from "lucide-react"
import proj4 from "proj4"
import ExportComponent from "./ExportComponent"
import { debounce } from "lodash"

const MapComponent = dynamic(() => import("./MapComponent"), {
  ssr: false,
  loading: () => <p>Cargando mapa...</p>,
})

// Definición de los sistemas de coordenadas
const epsg4686 = "+proj=longlat +ellps=GRS80 +towgs84=0,0,0,0,0,0,0 +no_defs"
const epsg9377 =
  "+proj=tmerc +lat_0=4.0 +lon_0=-73.0 +k=0.9992 +x_0=5000000 +y_0=2000000 +ellps=GRS80 +towgs84=0,0,0,0,0,0,0 +units=m +no_defs"

export default function Component() {
  const [showSidebar, setShowSidebar] = useState(true)
  const [showTable, setShowTable] = useState(false)
  const [coordinates, setCoordinates] = useState([])
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
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState(null)
  const inputRef = useRef(null)
  const [showTitleLayer, setShowTitleLayer] = useState(false)
  const [showRequestLayer, setShowRequestLayer] = useState(false)
  const [titleOpacity, setTitleOpacity] = useState(0.6)
  const [requestOpacity, setRequestOpacity] = useState(0.7)

  const handleApply = useCallback(() => {
    if (!expedientCode) {
      alert("Por favor, introduce un código de expediente.")
      return
    }
    setSearchTrigger((prev) => prev + 1)
    setShowToggle(true)
  }, [expedientCode])

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
    setTransformedCoordinates([])
    setShowTable(false)
    setShowToggle(false)
    setSearchTrigger(0)
    setCoordinatesAvailable(false)
    setGeoJsonData(null)
    if (mapRef.current) {
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

  const handleCoordinatesUpdate = useCallback((newCoordinates, newGeoJsonData) => {
    setCoordinates(newCoordinates)
    setCoordinatesAvailable(newCoordinates.length > 0)
    setGeoJsonData(newGeoJsonData)
  }, [])

  const transformCoordinates = useCallback((coords, fromEPSG, toEPSG) => {
    return coords.map((coord) => {
      const [x, y] = proj4(fromEPSG, toEPSG, coord)
      return [x, y]
    })
  }, [])

  useEffect(() => {
    if (coordinates.length > 0) {
      if (selectedCoordinateSystem === "4686") {
        setTransformedCoordinates(coordinates)
      } else {
        const transformed = transformCoordinates(coordinates, epsg4686, epsg9377)
        setTransformedCoordinates(transformed)
      }
    }
  }, [coordinates, selectedCoordinateSystem, transformCoordinates])

  const handleMapInitialized = useCallback((map) => {
    mapRef.current = map
    setMapInitialized(true)
  }, [])

  const fetchExpedients = useCallback(async (query) => {
    setIsLoading(true)
    setError(null)
    try {
      const urls = [
        `https://annamineria.anm.gov.co/annageo/rest/services/SIGM/TenureLayers/MapServer/3/query?where=TENURE_ID%20LIKE%20'${query}%'&outFields=CODIGO_EXPEDIENTE&returnGeometry=false&f=json`,
        `https://annamineria.anm.gov.co/annageo/rest/services/SIGM/TenureLayers/MapServer/4/query?where=TENURE_ID%20LIKE%20'${query}%'&outFields=CODIGO_EXPEDIENTE&returnGeometry=false&f=json`,
      ]

      const responses = await Promise.all(urls.map((url) => fetch(url)))
      const data = await Promise.all(responses.map((res) => res.json()))

      const expedients = data.flatMap((d) => d.features.map((f) => f.attributes.CODIGO_EXPEDIENTE))
      const uniqueExpedients = [...new Set(expedients)]
      if (uniqueExpedients.length > 0) {
        setExpedientSuggestions(uniqueExpedients.slice(0, 10))
      } else {
        setExpedientSuggestions([])
      }
    } catch (error) {
      console.error("Error fetching expedients:", error)
      setError("Error al cargar los expedientes. Por favor, intente de nuevo.")
    } finally {
      setIsLoading(false)
    }
  }, [])

  const debouncedFetchExpedients = useCallback(
    debounce((query) => fetchExpedients(query), 300),
    [fetchExpedients],
  )

  useEffect(() => {
    if (expedientCode.trim().length > 0) {
      debouncedFetchExpedients(expedientCode)
    } else {
      setExpedientSuggestions([])
    }
  }, [expedientCode, debouncedFetchExpedients])

  useEffect(() => {
    const handleClickOutside = (event) => {
      if (inputRef.current && !inputRef.current.contains(event.target)) {
        setExpedientSuggestions([])
      }
    }

    const handleEscapeKey = (event) => {
      if (event.key === "Escape") {
        setExpedientSuggestions([])
      }
    }

    document.addEventListener("click", handleClickOutside)
    document.addEventListener("keydown", handleEscapeKey)

    return () => {
      document.removeEventListener("click", handleClickOutside)
      document.removeEventListener("keydown", handleEscapeKey)
    }
  }, [])

  return (
    <div className="relative flex w-full h-screen bg-gray-100">
      <div
        className={`absolute top-4 left-4 z-10 w-[350px] bg-white shadow-lg rounded-xl transition-transform duration-300 ease-in-out ${showSidebar ? "translate-x-0" : "-translate-x-full"}`}
      >
        <div className="p-4 space-y-4">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-xl font-semibold">Títulos y Solicitudes</h2>
            <Button variant="ghost" onClick={() => setShowSidebar(false)} className="p-1 rounded-full">
              <ChevronLeft className="h-6 w-6" />
            </Button>
          </div>
          <div className="space-y-4">
            <div>
              <Label htmlFor="search" className="text-sm font-medium mb-1 block">
                Buscar Expediente
              </Label>
              <div className="relative">
                <Input
                  ref={inputRef}
                  id="search"
                  placeholder="Ingrese el expediente"
                  value={expedientCode}
                  onChange={(e) => {
                    const value = e.target.value.toUpperCase()
                    setExpedientCode(value)
                    if (!value.trim()) {
                      setExpedientSuggestions([])
                    }
                  }}
                  className="pl-10 pr-4 py-2 w-full border rounded-md"
                  aria-autocomplete="list"
                  aria-controls="expedient-suggestions"
                  aria-expanded={expedientSuggestions.length > 0}
                />
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400" size={18} />
                {isLoading && (
                  <div className="absolute right-3 top-1/2 transform -translate-y-1/2">
                    <Loader2 className="h-5 w-5 animate-spin text-blue-500" />
                  </div>
                )}
              </div>
              {error && <p className="text-red-500 text-sm mt-1">{error}</p>}
              {expedientSuggestions.length > 0 && (
                <ul
                  id="expedient-suggestions"
                  className="absolute z-20 w-full bg-white border mt-1 rounded-md shadow-lg max-h-60 overflow-auto"
                >
                  {expedientSuggestions.map((suggestion, index) => (
                    <li
                      key={index}
                      className="px-4 py-2 hover:bg-gray-100 cursor-pointer"
                      onClick={() => {
                        setExpedientCode(suggestion)
                        setExpedientSuggestions([])
                      }}
                    >
                      {suggestion}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
          <Button onClick={handleApply} className="w-full bg-blue-500 hover:bg-blue-600 text-white">
            Aplicar
          </Button>
          <div className="space-y-4">
            <div>
              <div className="flex items-center justify-between">
                <Label htmlFor="titleLayer" className="text-sm">
                  Títulos Vigentes
                </Label>
                <Switch id="titleLayer" checked={showTitleLayer} onCheckedChange={setShowTitleLayer} />
              </div>
              <input
                type="range"
                min="0"
                max="1"
                step="0.1"
                value={titleOpacity}
                onChange={(e) => setTitleOpacity(parseFloat(e.target.value))}
                className="w-full mt-1"
              />
            </div>
            <div>
              <div className="flex items-center justify-between">
                <Label htmlFor="requestLayer" className="text-sm">
                  Solicitudes Vigente
                </Label>
                <Switch id="requestLayer" checked={showRequestLayer} onCheckedChange={setShowRequestLayer} />
              </div>
              <input
                type="range"
                min="0"
                max="1"
                step="0.1"
                value={requestOpacity}
                onChange={(e) => setRequestOpacity(parseFloat(e.target.value))}
                className="w-full mt-1"
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
          titleOpacity={titleOpacity}
          requestOpacity={requestOpacity}
        />
        {!showSidebar && (
          <Button
            variant="outline"
            onClick={() => setShowSidebar(true)}
            className="absolute top-4 left-4 z-20 bg-white shadow-md rounded-full p-2"
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
                    <TableRow key={index}>
                      <TableCell className="text-center">{index + 1}</TableCell>
                      <TableCell className="text-center">
                        {selectedCoordinateSystem === "4686"
                          ? coord[1].toFixed(5).replace(".", ",")
                          : Math.round(coord[1])}
                      </TableCell>
                      <TableCell className="text-center">
                        {selectedCoordinateSystem === "4686"
                          ? coord[0].toFixed(5).replace(".", ",")
                          : Math.round(coord[0])}
                      </TableCell>
                    </TableRow>
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
              transformedCoordinates={transformedCoordinates}
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

