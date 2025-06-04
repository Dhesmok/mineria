"use client"

import { useEffect, useCallback, useRef, useState } from "react"
import L from "leaflet"
import "leaflet/dist/leaflet.css"
import * as EsriLeaflet from "esri-leaflet"
import { Button } from "@/components/ui/button"
import { MapIcon, Satellite, User } from "lucide-react"
import "leaflet-draw"
import "leaflet-draw/dist/leaflet.draw.css"

// Turf se sigue usando para medir áreas, si quieres, o para otras cosas.
// Pero lo importante aquí es polylabel para colocar la etiqueta:
import * as turf from "@turf/turf"
import polylabel from "polylabel"

export default function MapComponent({
  expedientCode,
  onCoordinatesUpdate,
  searchTrigger,
  onMapInitialized,
  showTitleLayer,
  showRequestLayer,
  titleOpacity,
  requestOpacity,
}) {
  const mapRef = useRef(null)
  const geoJsonLayerRef = useRef(null)
  const verticesLayerRef = useRef(null)
  const titleLayerRef = useRef(null)
  const requestLayerRef = useRef(null)
  const lastSearchTriggerRef = useRef(0)
  const labelsLayerRef = useRef(null)
  const titleLabelsLayerRef = useRef(null)
  const requestLabelsLayerRef = useRef(null)
  const drawControlRef = useRef(null)
  const drawnItemsRef = useRef(null)
  const [error, setError] = useState(null)
  const [baseLayer, setBaseLayer] = useState("osm")
  // Después de la declaración de los estados, añadir un nuevo estado para el color
  const [drawingColor, setDrawingColor] = useState("#f357a1")
  const [mapInstance, setMapInstance] = useState(null)
  const [showColorPicker, setShowColorPicker] = useState(false)

  const showTitleLayer = titleOpacity > 0
  const showRequestLayer = requestOpacity > 0

  // Función para formatear fechas
  const formatDate = (value) => {
    if (!value) {
      return "N/A"
    }
    let date
    if (typeof value === "number" || /^[0-9]+$/.test(value)) {
      const timestamp = Number.parseInt(value, 10)
      date = new Date(timestamp)
    } else {
      date = new Date(value)
    }
    if (!isNaN(date.getTime())) {
      const day = ("0" + date.getUTCDate()).slice(-2)
      const month = ("0" + (date.getUTCMonth() + 1)).slice(-2)
      const year = date.getUTCFullYear()
      return `${day}/${month}/${year}`
    }
    return value || "N/A"
  }

  // Inicialización del mapa
  useEffect(() => {
    if (!mapRef.current) {
      const mapInstanceLocal = L.map("map", {
        center: [4, -72],
        zoom: 5,
        wheelPxPerZoomLevel: 300,
        zoomSnap: 0.1,
        zoomDelta: 0.5,
        zoomControl: false,
      })

      setMapInstance(mapInstanceLocal)

      // Control de zoom en la esquina superior derecha
      L.control
        .zoom({
          position: "topright",
        })
        .addTo(mapInstanceLocal)

      // Capa base OpenStreetMap
      const osmLayer = L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
        attribution: "© OpenStreetMap contributors",
      })

      // Capa satelital
      const satelliteLayer = L.tileLayer("https://{s}.google.com/vt/lyrs=s&x={x}&y={y}&z={z}", {
        maxZoom: 20,
        subdomains: ["mt0", "mt1", "mt2", "mt3"],
        attribution: "© Google",
      })

      // Agregamos OSM por defecto
      osmLayer.addTo(mapInstanceLocal)

      // Inicializar capa para elementos dibujados
      drawnItemsRef.current = new L.FeatureGroup()
      mapInstanceLocal.addLayer(drawnItemsRef.current)

      // Crear iconos personalizados para los marcadores
      const markerIcon = new L.Icon({
        iconUrl: "https://unpkg.com/leaflet@1.7.1/dist/images/marker-icon.png",
        iconRetinaUrl: "https://unpkg.com/leaflet@1.7.1/dist/images/marker-icon-2x.png",
        shadowUrl: "https://unpkg.com/leaflet@1.7.1/dist/images/marker-shadow.png",
        iconSize: [25, 41],
        iconAnchor: [12, 41],
        popupAnchor: [1, -34],
        shadowSize: [41, 41],
      })

      // Modificar la inicialización de los controles de dibujo para usar el color seleccionado
      // Reemplazar la sección donde se crea drawControlRef.current with:

      // Inicializar controles de dibujo y agregarlos directamente al mapa
      drawControlRef.current = new L.Control.Draw({
        position: "topright",
        draw: {
          polyline: {
            shapeOptions: {
              color: drawingColor,
              weight: 5,
            },
          },
          polygon: {
            allowIntersection: false,
            drawError: {
              color: "#e1e100",
              message: "<strong>¡Error!</strong> No se permiten polígonos que se intersecten.",
            },
            shapeOptions: {
              color: drawingColor,
            },
          },
          circle: {
            shapeOptions: {
              color: drawingColor,
            },
          },
          rectangle: {
            shapeOptions: {
              color: drawingColor,
            },
          },
          marker: {
            icon: markerIcon,
          },
          circlemarker: false,
        },
        edit: {
          featureGroup: drawnItemsRef.current,
          remove: true,
        },
      })

      // Agregamos el control de dibujo directamente al mapa
      mapInstanceLocal.addControl(drawControlRef.current)

      // Evento para cuando se crea un elemento dibujado
      mapInstanceLocal.on(L.Draw.Event.CREATED, (event) => {
        const layer = event.layer
        drawnItemsRef.current.addLayer(layer)
      })

      // Añadir después del evento L.Draw.Event.CREATED:

      // Actualizar el control de dibujo cuando cambie el color
      // useEffect(() => {
      //   if (mapRef.current && drawControlRef.current) {
      //     // Remover el control actual
      //     mapRef.current.removeControl(drawControlRef.current)

      //     // Crear un nuevo control con el color actualizado
      //     drawControlRef.current = new L.Control.Draw({
      //       position: "topright",
      //       draw: {
      //         polyline: {
      //           shapeOptions: {
      //             color: drawingColor,
      //             weight: 5,
      //           },
      //         },
      //         polygon: {
      //           allowIntersection: false,
      //           drawError: {
      //             color: "#e1e100",
      //             message: "<strong>¡Error!</strong> No se permiten polígonos que se intersecten.",
      //           },
      //           shapeOptions: {
      //             color: drawingColor,
      //           },
      //         },
      //         circle: {
      //           shapeOptions: {
      //             color: drawingColor,
      //           },
      //         },
      //         rectangle: {
      //           shapeOptions: {
      //             color: drawingColor,
      //           },
      //         },
      //         marker: {
      //           icon: markerIcon,
      //         },
      //         circlemarker: false,
      //       },
      //       edit: {
      //         featureGroup: drawnItemsRef.current,
      //         remove: true,
      //       },
      //     })

      //     // Añadir el nuevo control al mapa
      //     mapRef.current.addControl(drawControlRef.current)
      //   }
      // }, [drawingColor])

      // Manejamos la visibilidad de las etiquetas según el zoom
      mapInstanceLocal.on("zoomend", () => {
        const currentZoom = mapInstanceLocal.getZoom()
        const labelsLayers = [labelsLayerRef.current, titleLabelsLayerRef.current, requestLabelsLayerRef.current]
        labelsLayers.forEach((layer) => {
          if (layer) {
            if (currentZoom >= 15 && currentZoom <= 19) {
              if (!mapInstanceLocal.hasLayer(layer)) {
                mapInstanceLocal.addLayer(layer)
              }
            } else {
              if (mapInstanceLocal.hasLayer(layer)) {
                mapInstanceLocal.removeLayer(layer)
              }
            }
          }
        })
      })

      mapRef.current = mapInstanceLocal

      // Función para agregar marcadores de vértices
      mapRef.current.addVertices = (coordinates) => {
        if (verticesLayerRef.current) {
          if (mapInstanceLocal.hasLayer(verticesLayerRef.current)) {
            mapInstanceLocal.removeLayer(verticesLayerRef.current)
          }
        }
        verticesLayerRef.current = L.layerGroup().addTo(mapInstanceLocal)

        coordinates.forEach((coord, index) => {
          const circle = L.circleMarker(coord, {
            radius: 10,
            fillColor: "red",
            color: "#fff",
            weight: 1,
            opacity: 1,
            fillOpacity: 0.5,
          }).addTo(verticesLayerRef.current)

          circle.bindTooltip(
            `Vértice ${index + 1}<br>Lat: ${coord[1].toFixed(5).replace(".", ",")}<br>Lon: ${coord[0]
              .toFixed(5)
              .replace(".", ",")}`,
            {
              permanent: false,
              direction: "top",
            },
          )
        })
      }

      // Función para eliminar los vértices
      mapRef.current.removeVertices = () => {
        if (verticesLayerRef.current && mapInstanceLocal.hasLayer(verticesLayerRef.current)) {
          mapInstanceLocal.removeLayer(verticesLayerRef.current)
          verticesLayerRef.current = null
        }
      }

      // Función para limpiar todos los dibujos
      mapRef.current.clearDrawings = () => {
        drawnItemsRef.current.clearLayers()
      }

      onMapInitialized(mapRef.current)
    }

    // Limpieza
    return () => {
      if (mapRef.current) {
        mapRef.current.remove()
        mapRef.current = null
      }
      labelsLayerRef.current = null
      titleLabelsLayerRef.current = null
      requestLabelsLayerRef.current = null
    }
  }, [onMapInitialized])

  // Actualizar el control de dibujo cuando cambie el color
  useEffect(() => {
    if (mapRef.current && drawControlRef.current) {
      // Remover el control actual
      mapRef.current.removeControl(drawControlRef.current)

      // Crear un nuevo control con el color actualizado
      drawControlRef.current = new L.Control.Draw({
        position: "topright",
        draw: {
          polyline: {
            shapeOptions: {
              color: drawingColor,
              weight: 5,
            },
          },
          polygon: {
            allowIntersection: false,
            drawError: {
              color: "#e1e100",
              message: "<strong>¡Error!</strong> No se permiten polígonos que se intersecten.",
            },
            shapeOptions: {
              color: drawingColor,
            },
          },
          circle: {
            shapeOptions: {
              color: drawingColor,
            },
          },
          rectangle: {
            shapeOptions: {
              color: drawingColor,
            },
          },
          marker: {
            icon: new L.Icon({
              iconUrl: "https://unpkg.com/leaflet@1.7.1/dist/images/marker-icon.png",
              iconRetinaUrl: "https://unpkg.com/leaflet@1.7.1/dist/images/marker-icon-2x.png",
              shadowUrl: "https://unpkg.com/leaflet@1.7.1/dist/images/marker-shadow.png",
              iconSize: [25, 41],
              iconAnchor: [12, 41],
              popupAnchor: [1, -34],
              shadowSize: [41, 41],
            }),
          },
          circlemarker: false,
        },
        edit: {
          featureGroup: drawnItemsRef.current,
          remove: true,
        },
      })

      // Añadir el nuevo control al mapa
      mapRef.current.addControl(drawControlRef.current)
    }
  }, [drawingColor])

  // Añadir un efecto para cerrar el selector de colores cuando se hace clic fuera de él
  // Añadir este useEffect después del useEffect que actualiza el control de dibujo:

  // Cerrar el selector de colores cuando se hace clic fuera de él
  useEffect(() => {
    if (!showColorPicker) return

    const handleClickOutside = (event) => {
      const colorPickerElements = document.querySelectorAll('[aria-label^="Color"]')
      let isColorPickerClick = false

      colorPickerElements.forEach((element) => {
        if (element.contains(event.target)) {
          isColorPickerClick = true
        }
      })

      if (!isColorPickerClick) {
        setShowColorPicker(false)
      }
    }

    document.addEventListener("mousedown", handleClickOutside)
    return () => {
      document.removeEventListener("mousedown", handleClickOutside)
    }
  }, [showColorPicker])

  // Crea el contenido del Popup
  const createPopupContent = (properties) => {
    return `
          <div class="popup-content">
            <h3>Información del Expediente</h3>
            <p><strong>Código Expediente:</strong> ${properties.CODIGO_EXPEDIENTE || properties.TENURE_ID || "N/A"}</p>
            <p><strong>Modalidad:</strong> ${properties.MODALIDAD || "N/A"}</p>
            <p><strong>Estado del Título:</strong> ${properties.TITULO_ESTADO || properties.STATUS || "N/A"}</p>
            <p><strong>Área (ha):</strong> ${
              typeof properties.AREA_HA === "number" ? properties.AREA_HA.toFixed(4) : properties.AREA_HA || "N/A"
            }</p>
            <p><strong>Clasificación Minería:</strong> ${properties.CLASIFICACION_MINERIA || "N/A"}</p>
            <p><strong>Etapa:</strong> ${properties.ETAPA || "N/A"}</p>
            <p><strong>Solicitantes o Titulares:</strong> ${properties.SOLICITANTES_O_TITULARES || "N/A"}</p>
            <p><strong>Minerales:</strong> ${properties.MINERALES || "N/A"}</p>
            <p><strong>Fecha de Solicitud:</strong> ${formatDate(properties.FECHA_DE_SOLICITUD)}</p>
            <p><strong>Fecha de Expedición:</strong> ${formatDate(properties.FECHA_DE_EXPEDICION)}</p>
            <p><strong>Fecha de Aniversario:</strong> ${formatDate(properties.FECHA_DE_ANIVERSARIO)}</p>
            <p><strong>Fecha de Expiración:</strong> ${formatDate(properties.FECHA_DE_EXPIRACION)}</p>
            <p><strong>PAR:</strong> ${properties.PAR || "N/A"}</p>
          </div>
        `
  }

  // Función para buscar los números de capa
  const findLayerNumbers = useCallback(async () => {
    const baseUrl = "https://annamineria.anm.gov.co/annageo/rest/services/SIGM/TenureLayers/MapServer"
    const layerNames = ["Solicitud Vigente", "Título Vigente"]
    const foundLayers = {}

    for (let i = 0; i <= 5; i++) {
      try {
        const response = await fetch(`${baseUrl}/${i}?f=json`)
        const data = await response.json()
        if (layerNames.includes(data.name)) {
          foundLayers[data.name] = i
        }
      } catch (error) {
        console.error(`Error checking layer ${i}:`, error)
      }
    }

    return foundLayers
  }, [])

  /**
   * Función auxiliar para obtener un punto interno usando polylabel
   * @param {Object} feature - GeoJSON Feature (Polygon o MultiPolygon)
   * @returns {Array} [long, lat] del punto más "interno" del polígono
   */
  const getLabelCoordinates = (feature) => {
    const { type, coordinates } = feature.geometry

    if (type === "Polygon") {
      // polylabel necesita un array de anillos: [exterior, agujeros...]
      // 'coordinates' ya es algo así: [ [ [x,y], [x,y],...], [ [x,y],...], ...]
      // El segundo parámetro (1.0) es la precisión; a menor valor, más preciso pero más lento.
      const bestPoint = polylabel(coordinates, 1.0)
      // polylabel retorna [x, y]
      return bestPoint // [long, lat]
    } else if (type === "MultiPolygon") {
      // Podríamos calcular la etiqueta para cada polígono y elegir el de mayor área,
      // o simplemente tomar el primero. Aquí tomamos el de mayor área.
      let largestArea = 0
      let bestOverallPoint = [0, 0]
      for (const polygonCoords of coordinates) {
        // 'polygonCoords' es un array de anillos para ese polígono
        const labelPoint = polylabel(polygonCoords, 1.0)
        // Calculamos el área para ver cuál polígono es más grande
        const area = turf.area(turf.polygon(polygonCoords))
        if (area > largestArea) {
          largestArea = area
          bestOverallPoint = labelPoint
        }
      }
      return bestOverallPoint
    }

    // Si no es Polygon ni MultiPolygon, devolvemos algo por defecto
    return [0, 0]
  }

  // Función para cargar datos de un expediente específico
  const fetchData = useCallback(async () => {
    if (!mapRef.current || !expedientCode) return

    const layerNumbers = await findLayerNumbers()

    const layers = [
      {
        url: `https://annamineria.anm.gov.co/annageo/rest/services/SIGM/TenureLayers/MapServer/${layerNumbers["Título Vigente"]}/query`,
        style: {
          color: "#894444",
          weight: 3,
          fillColor: "#A46F48",
          fillOpacity: 0.6,
        },
      },
      {
        url: `https://annamineria.anm.gov.co/annageo/rest/services/SIGM/TenureLayers/MapServer/${layerNumbers["Solicitud Vigente"]}/query`,
        style: {
          color: "#F0C567",
          weight: 3,
          fillColor: "#FFF0AF",
          fillOpacity: 0.6,
        },
      },
    ]

    // Eliminamos capas previas si existen
    if (geoJsonLayerRef.current) {
      if (mapRef.current.hasLayer(geoJsonLayerRef.current)) {
        mapRef.current.removeLayer(geoJsonLayerRef.current)
      }
      geoJsonLayerRef.current = null
    }
    if (labelsLayerRef.current) {
      if (mapRef.current.hasLayer(labelsLayerRef.current)) {
        mapRef.current.removeLayer(labelsLayerRef.current)
      }
      labelsLayerRef.current = null
    }

    // Buscamos en ambas capas (Título y Solicitud)
    for (const layer of layers) {
      const params = new URLSearchParams({
        where: `TENURE_ID='${expedientCode}'`,
        outFields: "*",
        returnGeometry: "true",
        f: "geojson",
      })

      try {
        const response = await fetch(`${layer.url}?${params}`)
        const data = await response.json()

        if (data.features && data.features.length > 0) {
          // Agregamos la capa GeoJSON
          geoJsonLayerRef.current = L.geoJSON(data, {
            style: layer.style,
            onEachFeature: (feature, layer) => {
              // Usamos polylabel para encontrar un punto interno "lo más adentro posible"
              const bestPoint = getLabelCoordinates(feature)
              const [long, lat] = bestPoint

              // Creamos el icono de la etiqueta
              const label = L.divIcon({
                className: "map-label",
                html: `<div>${feature.properties.TENURE_ID}</div>`,
                iconSize: [100, 40],
                iconAnchor: [50, 20],
              })

              // Si no existe el layerGroup de etiquetas, lo creamos
              if (!labelsLayerRef.current) {
                labelsLayerRef.current = L.layerGroup()
              }
              // Agregamos el marcador en la ubicación de polylabel
              const marker = L.marker([lat, long], { icon: label })
              labelsLayerRef.current.addLayer(marker)

              // Popup
              const popupContent = createPopupContent(feature.properties)
              layer.bindPopup(popupContent)
            },
          }).addTo(mapRef.current)

          // Mostramos las etiquetas solo si el zoom está entre 15 y 19
          const currentZoom = mapRef.current.getZoom()
          if (currentZoom >= 15 && currentZoom <= 19 && labelsLayerRef.current) {
            mapRef.current.addLayer(labelsLayerRef.current)
          }

          // Ajustamos el mapa para mostrar el polígono
          mapRef.current.fitBounds(geoJsonLayerRef.current.getBounds())

          // Obtenemos todos los vértices para dibujar marcadores
          let allCoordinates = []
          const firstFeature = data.features[0]
          const geomType = firstFeature.geometry.type

          if (geomType === "Polygon") {
            const rings = firstFeature.geometry.coordinates
            rings.forEach((ring) => {
              const ringCoords = ring[0] === ring[ring.length - 1] ? ring.slice(0, -1) : ring
              allCoordinates = [...allCoordinates, ...ringCoords]
            })
          } else if (geomType === "MultiPolygon") {
            const multiRings = firstFeature.geometry.coordinates
            multiRings.forEach((polygon) => {
              polygon.forEach((ring) => {
                const ringCoords = ring[0] === ring[ring.length - 1] ? ring.slice(0, -1) : ring
                allCoordinates = [...allCoordinates, ...ringCoords]
              })
            })
          }

          // Convertimos a formato [lat, lng]
          const mappedCoordinates = allCoordinates.map((coord) => [coord[1], coord[0]])
          mapRef.current.addVertices(mappedCoordinates)

          // Llamamos a onCoordinatesUpdate si existe
          onCoordinatesUpdate(allCoordinates, data)

          // Salimos del bucle porque ya encontramos el expediente
          return
        }
      } catch (error) {
        console.error("Error al obtener los datos:", error)
        setError("Error al obtener los datos del expediente")
      }
    }

    // Si llegamos aquí, no se encontró el expediente
    setError(`No se encontró un polígono con el expediente introducido '${expedientCode}'.`)
    onCoordinatesUpdate([], null)
  }, [expedientCode, onCoordinatesUpdate, findLayerNumbers])

  // Cada vez que cambie searchTrigger, buscamos de nuevo
  useEffect(() => {
    if (searchTrigger !== lastSearchTriggerRef.current) {
      lastSearchTriggerRef.current = searchTrigger
      setError(null)
      fetchData()
    }
  }, [searchTrigger, fetchData])

  // Muestra/Oculta las capas de Títulos Vigentes y Solicitudes Vigentes en el mapa
  useEffect(() => {
    if (!mapRef.current) return

    const updateLayer = async (show, layerRef, labelsLayerRef, layerName, layerStyle) => {
      const layerNumbers = await findLayerNumbers()
      const layerNumber = layerNumbers[layerName]

      if (show) {
        if (!layerRef.current) {
          layerRef.current = EsriLeaflet.featureLayer({
            url: `https://annamineria.anm.gov.co/annageo/rest/services/SIGM/TenureLayers/MapServer/${layerNumber}`,
            style: layerStyle,
            onEachFeature: (feature, layer) => {
              // De nuevo, usamos polylabel para asegurar que la etiqueta quede dentro
              const bestPoint = getLabelCoordinates(feature)
              const [long, lat] = bestPoint

              // Creamos el icono
              const label = L.divIcon({
                className: "map-label",
                html: `<div>${feature.properties.TENURE_ID || "N/A"}</div>`,
                iconSize: [100, 40],
                iconAnchor: [50, 20],
              })

              if (!labelsLayerRef.current) {
                labelsLayerRef.current = L.layerGroup()
              }
              const marker = L.marker([lat, long], { icon: label })
              labelsLayerRef.current.addLayer(marker)

              // Popup
              const popupContent = createPopupContent(feature.properties)
              layer.bindPopup(popupContent)
            },
          }).addTo(mapRef.current)

        // Mostramos etiquetas solo entre zoom 15 y 19
        const currentZoom = mapRef.current.getZoom()
        if (currentZoom >= 15 && currentZoom <= 19 && labelsLayerRef.current) {
          mapRef.current.addLayer(labelsLayerRef.current)
        }
        } else {
          layerRef.current.setStyle(layerStyle)
        }
      } else if (layerRef.current) {
        // Si ya no se va a mostrar, removemos todo
        if (labelsLayerRef.current && mapRef.current.hasLayer(labelsLayerRef.current)) {
          mapRef.current.removeLayer(labelsLayerRef.current)
          labelsLayerRef.current = null
        }
        if (mapRef.current.hasLayer(layerRef.current)) {
          mapRef.current.removeLayer(layerRef.current)
        }
        layerRef.current = null
      }
    }

    try {
      updateLayer(showTitleLayer, titleLayerRef, titleLabelsLayerRef, "Título Vigente", {
        color: "#894444",
        weight: 2,
        fillColor: "#A46F48",
        fillOpacity: titleOpacity,
      })

      updateLayer(showRequestLayer, requestLayerRef, requestLabelsLayerRef, "Solicitud Vigente", {
        color: "#F0C567",
        weight: 2,
        fillColor: "#FFF0AF",
        fillOpacity: requestOpacity,
      })

      // Forzamos que Leaflet refresque la vista
      mapRef.current.invalidateSize()
    } catch (error) {
      console.error("Error al actualizar las capas:", error)
      setError("Error al actualizar las capas del mapa")
    }
  }, [showTitleLayer, showRequestLayer, titleOpacity, requestOpacity, findLayerNumbers])


  // Alternar entre capa base OSM y Satélite
  const toggleBaseLayer = useCallback(() => {
    if (!mapRef.current) return

    const map = mapRef.current
    map.eachLayer((layer) => {
      if (layer instanceof L.TileLayer) {
        map.removeLayer(layer)
      }
    })

    if (baseLayer === "osm") {
      L.tileLayer("https://{s}.google.com/vt/lyrs=s,h&x={x}&y={y}&z={z}", {
        maxZoom: 22,
        subdomains: ["mt0", "mt1", "mt2", "mt3"],
        attribution: "© Google",
      }).addTo(map)
      setBaseLayer("satellite")
    } else {
      L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
        attribution: "© OpenStreetMap contributors",
      }).addTo(map)
      setBaseLayer("osm")
    }
  }, [baseLayer])

  // Añadir antes del return, un selector de color personalizado
  const handleColorChange = (newColor) => {
    setDrawingColor(newColor)
  }

  return (
    <>
      <div id="map" className="absolute inset-0 z-0"></div>

      {/* Selector de color para dibujos - Botón desplegable */}
      <div className="absolute top-4 right-20 z-10">
        <div className="relative">
          <button
            onClick={() => setShowColorPicker(!showColorPicker)}
            className="bg-white p-2 rounded-md shadow-md flex items-center"
            aria-label="Seleccionar color de dibujo"
          >
            <div className="w-5 h-5 rounded-full mr-2" style={{ backgroundColor: drawingColor }}></div>
            <span className="text-xs font-medium">Color</span>
          </button>

          {showColorPicker && (
            <div className="absolute top-full left-0 mt-1 bg-white rounded-md shadow-lg p-2 z-20">
              <div className="grid grid-cols-4 gap-2">
                {["#f357a1", "#3b82f6", "#10b981", "#f59e0b", "#ef4444", "#8b5cf6", "#000000", "#ffffff"].map(
                  (color) => (
                    <button
                      key={color}
                      onClick={() => {
                        handleColorChange(color)
                        setShowColorPicker(false)
                      }}
                      className={`w-6 h-6 rounded-full border ${
                        drawingColor === color ? "border-gray-800 border-2" : "border-gray-300"
                      }`}
                      style={{
                        backgroundColor: color,
                        boxShadow: color === "#ffffff" ? "inset 0 0 0 1px #e5e7eb" : "none",
                      }}
                      aria-label={`Color ${color}`}
                    />
                  ),
                )}
              </div>
            </div>
          )}
        </div>
      </div>

      <div className="absolute bottom-4 left-4 z-10 flex flex-col space-y-2">
        <Button onClick={toggleBaseLayer} className="bg-white text-black hover:bg-gray-200">
          {baseLayer === "osm" ? <Satellite className="mr-2 h-4 w-4" /> : <MapIcon className="mr-2 h-4 w-4" />}
          {baseLayer === "osm" ? "Satélite" : "Mapa"}
        </Button>
        <Button
          onClick={() => window.open("https://www.linkedin.com/in/fabio-espinosa/", "_blank", "noopener,noreferrer")}
          className="bg-white text-black hover:bg-gray-200"
        >
          <User className="mr-2 h-4 w-4" />
          Fabio A. Espinosa
        </Button>
      </div>
      {error && <div className="absolute top-0 left-0 right-0 bg-red-500 text-white p-2 text-center z-10">{error}</div>}

      <style jsx global>{`
            .map-label {
              background: none;
              border: none;
              box-shadow: none;
            }
            .map-label div {
              font-size: 14px;
              font-weight: bold;
              color: white;
              text-shadow:
                -1px -1px 0 #000,
                 1px -1px 0 #000,
                -1px  1px 0 #000,
                 1px  1px 0 #000;
              white-space: nowrap;
            }
            .leaflet-popup-content-wrapper {
              background: rgba(255, 255, 255, 0.9);
              color: #333;
              font-size: 14px;
              line-height: 24px;
              border-radius: 4px;
              max-height: 400px;
              overflow-y: auto;
            }
            .leaflet-popup-content-wrapper h3 {
              font-size: 16px;
              font-weight: bold;
              margin-bottom: 10px;
              border-bottom: 1px solid #ccc;
              padding-bottom: 5px;
            }
            .leaflet-popup-content-wrapper p {
              margin-bottom: 5px;
            }
            .leaflet-popup-tip-container {
              width: 30px;
              height: 15px;
            }
            .leaflet-popup-tip {
              background: rgba(255, 255, 255, 0.9);
            }
            /* Estilos para los controles de dibujo */
            .leaflet-draw-toolbar a {
              background-color: white;
              color: #333;
            }
            .leaflet-draw-toolbar a:hover {
              background-color: #f0f0f0;
            }
            
            .leaflet-draw-actions a {
              background-color: white;
              color: #333;
            }
            .leaflet-draw-actions a:hover {
              background-color: #f0f0f0;
            }
          `}</style>
    </>
  )
}

