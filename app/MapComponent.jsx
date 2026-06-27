"use client"

import { useEffect, useCallback, useRef, useState } from "react"
import L from "leaflet"
import "leaflet/dist/leaflet.css"
import * as EsriLeaflet from "esri-leaflet"
import { Button } from "@/components/ui/button"
import { Compass, Crosshair, MapIcon, Satellite, User } from "lucide-react"
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
  showAnmServiceLayer,
  showHistoricalTitleLayer,
  titleOpacity,
  requestOpacity,
  anmServiceOpacity,
  historicalTitleOpacity,
}) {
  const mapRef = useRef(null)
  const geoJsonLayerRef = useRef(null)
  const verticesLayerRef = useRef(null)
  const titleLayerRef = useRef(null)
  const requestLayerRef = useRef(null)
  const anmServiceLayerRef = useRef(null)
  const historicalTitleLayerRef = useRef(null)
  const titleOpacityRef = useRef(titleOpacity)
  const requestOpacityRef = useRef(requestOpacity)
  const anmServiceOpacityRef = useRef(anmServiceOpacity)
  const historicalTitleOpacityRef = useRef(historicalTitleOpacity)
  const lastSearchTriggerRef = useRef(0)
  const labelsLayerRef = useRef(null)
  const titleLabelsLayerRef = useRef(null)
  const requestLabelsLayerRef = useRef(null)
  const anmServiceLabelsLayerRef = useRef(null)
  const historicalTitleLabelsLayerRef = useRef(null)
  const drawControlRef = useRef(null)
  const drawnItemsRef = useRef(null)
  const measureControlRef = useRef(null)
  const [error, setError] = useState(null)
  const [baseLayer, setBaseLayer] = useState("osm")
  // Después de la declaración de los estados, añadir un nuevo estado para el color
  const [drawingColor, setDrawingColor] = useState("#f357a1")
  const [mapInstance, setMapInstance] = useState(null)
  const [showColorPicker, setShowColorPicker] = useState(false)
  const [showErrorBanner, setShowErrorBanner] = useState(false)
  const [isCompassActive, setIsCompassActive] = useState(false)
  const [deviceHeading, setDeviceHeading] = useState(null)
  const [isLocating, setIsLocating] = useState(false)
  const [hasLocated, setHasLocated] = useState(false)
  const layerNumbersCacheRef = useRef(null)
  const userLocationMarkerRef = useRef(null)
  const deviceOrientationCleanupRef = useRef(null)
  const locationWatchIdRef = useRef(null)
  const deviceHeadingRef = useRef(null)
  const hasCenteredRef = useRef(false)

  const formatDistance = (meters) => {
    if (meters >= 1000) {
      return `${(meters / 1000).toFixed(2)} km`
    }
    return `${meters.toFixed(2)} m`
  }

  const formatArea = (squareMeters) => {
    if (squareMeters >= 1000000) {
      return `${(squareMeters / 1000000).toFixed(2)} km²`
    }
    if (squareMeters >= 10000) {
      return `${(squareMeters / 10000).toFixed(2)} ha`
    }
    return `${squareMeters.toFixed(2)} m²`
  }

  useEffect(() => {
    titleOpacityRef.current = titleOpacity
  }, [titleOpacity])

  useEffect(() => {
    requestOpacityRef.current = requestOpacity
  }, [requestOpacity])

  useEffect(() => {
    anmServiceOpacityRef.current = anmServiceOpacity
  }, [anmServiceOpacity])

  useEffect(() => {
    historicalTitleOpacityRef.current = historicalTitleOpacity
  }, [historicalTitleOpacity])

  // Determinar si las capas deben mostrarse teniendo en cuenta el valor
  // proveniente de los controles y la opacidad configurada
  const shouldShowTitleLayer = showTitleLayer && titleOpacity > 0
  const shouldShowRequestLayer = showRequestLayer && requestOpacity > 0
  const shouldShowAnmServiceLayer = showAnmServiceLayer && anmServiceOpacity > 0
  const shouldShowHistoricalTitleLayer = showHistoricalTitleLayer && historicalTitleOpacity > 0

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

      const startDistanceMeasure = () => {
        const drawer = new L.Draw.Polyline(mapInstanceLocal, {
          shapeOptions: {
            color: drawingColor,
            weight: 5,
          },
        })
        drawer.enable()
      }

      const startAreaMeasure = () => {
        const drawer = new L.Draw.Polygon(mapInstanceLocal, {
          allowIntersection: false,
          showArea: true,
          shapeOptions: {
            color: drawingColor,
          },
        })
        drawer.enable()
      }

      const MeasureControl = L.Control.extend({
        options: {
          position: "topright",
        },
        onAdd: () => {
          const container = L.DomUtil.create("div", "leaflet-bar leaflet-control measure-control")

          const distanceButton = L.DomUtil.create("a", "", container)
          distanceButton.href = "#"
          distanceButton.title = "Medir distancia"
          distanceButton.innerHTML = "📏"
          distanceButton.setAttribute("aria-label", "Medir distancia")

          const areaButton = L.DomUtil.create("a", "", container)
          areaButton.href = "#"
          areaButton.title = "Medir área"
          areaButton.innerHTML = "⬠"
          areaButton.setAttribute("aria-label", "Medir área")

          L.DomEvent.disableClickPropagation(container)
          L.DomEvent.on(distanceButton, "click", (event) => {
            L.DomEvent.preventDefault(event)
            startDistanceMeasure()
          })
          L.DomEvent.on(areaButton, "click", (event) => {
            L.DomEvent.preventDefault(event)
            startAreaMeasure()
          })

          return container
        },
      })

      measureControlRef.current = new MeasureControl()
      mapInstanceLocal.addControl(measureControlRef.current)

      // Evento para cuando se crea un elemento dibujado
      mapInstanceLocal.on(L.Draw.Event.CREATED, (event) => {
        const layer = event.layer
        drawnItemsRef.current.addLayer(layer)

        if (event.layerType === "polyline") {
          const latLngs = layer.getLatLngs()
          let totalDistance = 0
          for (let i = 1; i < latLngs.length; i += 1) {
            totalDistance += mapInstanceLocal.distance(latLngs[i - 1], latLngs[i])
          }
          layer.bindPopup(`<strong>Distancia:</strong> ${formatDistance(totalDistance)}`).openPopup()
        }

        if (event.layerType === "polygon" || event.layerType === "rectangle") {
          const latLngs = layer.getLatLngs()[0]
          const area = L.GeometryUtil.geodesicArea(latLngs)
          layer.bindPopup(`<strong>Área:</strong> ${formatArea(area)}`).openPopup()
        }
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

      // Manejamos la visibilidad de las etiquetas y la opacidad según el zoom
      const handleZoom = () => {
        const currentZoom = mapInstanceLocal.getZoom()
        const labelsLayers = [
          labelsLayerRef.current,
          titleLabelsLayerRef.current,
          requestLabelsLayerRef.current,
          historicalTitleLabelsLayerRef.current,
        ]
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

        if (titleLayerRef.current) {
          titleLayerRef.current.setStyle({ fillOpacity: titleOpacityRef.current })
        }
        if (requestLayerRef.current) {
          requestLayerRef.current.setStyle({ fillOpacity: requestOpacityRef.current })
        }
        if (historicalTitleLayerRef.current) {
          historicalTitleLayerRef.current.setStyle({ fillOpacity: historicalTitleOpacityRef.current })
        }
      }

      mapInstanceLocal.on("zoomend", handleZoom)

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

      // Función para limpiar los dibujos
      mapRef.current.clearDrawings = () => {
        drawnItemsRef.current.clearLayers()
      }

      mapRef.current.clearSearchResult = () => {
        if (geoJsonLayerRef.current && mapInstanceLocal.hasLayer(geoJsonLayerRef.current)) {
          mapInstanceLocal.removeLayer(geoJsonLayerRef.current)
        }
        geoJsonLayerRef.current = null

        if (labelsLayerRef.current && mapInstanceLocal.hasLayer(labelsLayerRef.current)) {
          mapInstanceLocal.removeLayer(labelsLayerRef.current)
        }
        labelsLayerRef.current = null

        if (verticesLayerRef.current && mapInstanceLocal.hasLayer(verticesLayerRef.current)) {
          mapInstanceLocal.removeLayer(verticesLayerRef.current)
        }
        verticesLayerRef.current = null

        mapInstanceLocal.closePopup()
        mapInstanceLocal.setView([4, -72], 5)
        setError(null)
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
      historicalTitleLabelsLayerRef.current = null
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
    if (layerNumbersCacheRef.current) {
      return layerNumbersCacheRef.current
    }

    const baseUrl =
      "https://annamineria.anm.gov.co/annageo/rest/services/SIGM/TenureLayers/MapServer"
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

    layerNumbersCacheRef.current = foundLayers
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
      // Usamos mayor precisión (0.1) para minimizar la probabilidad
      // de que el punto caiga cerca del borde
      let bestPoint = polylabel(coordinates, 0.1)
      // Aseguramos que realmente esté dentro del polígono
      if (
        !turf.booleanPointInPolygon(
          turf.point(bestPoint),
          turf.polygon(coordinates),
        )
      ) {
        // polylabel debería estar dentro, pero si por alguna razón no lo está,
        // usamos un punto garantizado dentro del polígono
        bestPoint = turf.pointOnFeature(feature).geometry.coordinates
      }
      return bestPoint // [long, lat]
    } else if (type === "MultiPolygon") {
      // Podríamos calcular la etiqueta para cada polígono y elegir el de mayor área,
      // o simplemente tomar el primero. Aquí tomamos el de mayor área.
      let largestArea = 0
      let bestOverallPoint = [0, 0]
      let polygonForBestPoint = null
      for (const polygonCoords of coordinates) {
        // 'polygonCoords' es un array de anillos para ese polígono
        let labelPoint = polylabel(polygonCoords, 0.1)
        // Verificamos que el punto obtenido esté realmente dentro del polígono
        if (
          !turf.booleanPointInPolygon(
            turf.point(labelPoint),
            turf.polygon(polygonCoords),
          )
        ) {
          labelPoint = turf.pointOnFeature(turf.polygon(polygonCoords)).geometry.coordinates
        }
        // Calculamos el área para ver cuál polígono es más grande
        const area = turf.area(turf.polygon(polygonCoords))
        if (area > largestArea) {
          largestArea = area
          bestOverallPoint = labelPoint
          polygonForBestPoint = polygonCoords
        }
      }
      if (
        polygonForBestPoint &&
        !turf.booleanPointInPolygon(
          turf.point(bestOverallPoint),
          turf.polygon(polygonForBestPoint),
        )
      ) {
        bestOverallPoint = turf.pointOnFeature(feature).geometry.coordinates
      }
      return bestOverallPoint
    }

    // Si no es Polygon ni MultiPolygon, devolvemos algo por defecto
    return [0, 0]
  }

  // Función para cargar datos de un expediente específico
  const fetchData = useCallback(async () => {
    if (!mapRef.current || !expedientCode) return
    const normalizedCode = expedientCode.trim().toUpperCase().replace(/'/g, "''")

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
        url: "https://geo.anm.gov.co/webgis/rest/services/ANM/ServiciosANM/MapServer/3/query",
        style: {
          color: "#6E4B3A",
          weight: 3,
          fillColor: "#B68863",
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
      {
        url: "https://annamineria.anm.gov.co/annageo/rest/services/SIGM/VisorInterno/MapServer/87/query",
        style: {
          color: "#22577A",
          weight: 3,
          fillColor: "#38A3A5",
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
    let hasFetchError = false;

    for (const layer of layers) {
      const queries = [
        `UPPER(TENURE_ID)='${normalizedCode}'`,
        `UPPER(CODIGO_EXPEDIENTE)='${normalizedCode}'`
      ];

      for (const whereClause of queries) {
        const params = new URLSearchParams({
          where: whereClause,
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

          // Obtenemos los vértices para dibujar marcadores
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

            // Salimos de ambos bucles porque ya encontramos el expediente
            return
          }
        } catch (error) {
          console.error("Error al obtener los datos:", error)
          hasFetchError = true
        }
      }
    }

    // Si llegamos aquí, no se encontró el expediente
    setShowErrorBanner(true)
    if (hasFetchError) {
      setError(
        `No se pudo obtener la información de algunas capas debido a un error del servidor, y no se encontró el expediente introducido '${expedientCode}'.`,
      )
    } else {
      setError(`No se encontró un polígono con el expediente introducido '${expedientCode}'.`)
    }
    onCoordinatesUpdate([], null)
  }, [expedientCode, onCoordinatesUpdate, findLayerNumbers])

  // Cada vez que cambie searchTrigger, buscamos de nuevo
  useEffect(() => {
    if (searchTrigger !== lastSearchTriggerRef.current) {
      lastSearchTriggerRef.current = searchTrigger
      setError(null)
      setShowErrorBanner(false)
      fetchData()
    }
  }, [searchTrigger, fetchData])

  // Muestra/Oculta las capas de Títulos Vigentes y Solicitudes Vigentes en el mapa
  useEffect(() => {
    if (!mapRef.current) return

    const updateLayer = async (show, layerRef, labelsLayerRef, layerName, layerStyle, customUrl = null) => {
      let layerUrl = customUrl

      if (!layerUrl) {
        const layerNumbers = await findLayerNumbers()
        const layerNumber = layerNumbers[layerName]
        if (layerNumber === undefined) {
          console.error(`No se encontró la capa: ${layerName}`)
          return
        }
        layerUrl = `https://annamineria.anm.gov.co/annageo/rest/services/SIGM/TenureLayers/MapServer/${layerNumber}`
      }

      if (show) {
        if (!layerRef.current) {
          layerRef.current = EsriLeaflet.featureLayer({
            url: layerUrl,
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
          layerRef.current.options.style = layerStyle
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

      updateLayer(
        shouldShowTitleLayer,
        titleLayerRef,
        titleLabelsLayerRef,
        "Título Vigente",
        {
          color: "#894444",
          weight: 2,
          fillColor: "#A46F48",
          fillOpacity: titleOpacity,
        },
      )

      updateLayer(
        shouldShowAnmServiceLayer,
        anmServiceLayerRef,
        anmServiceLabelsLayerRef,
        null,
        {
          color: "#6E4B3A",
          weight: 2,
          fillColor: "#B68863",
          fillOpacity: anmServiceOpacity,
        },
        "https://geo.anm.gov.co/webgis/rest/services/ANM/ServiciosANM/MapServer/3",
      )

      updateLayer(
        shouldShowRequestLayer,
        requestLayerRef,
        requestLabelsLayerRef,
        "Solicitud Vigente",
        {
          color: "#F0C567",
          weight: 2,
          fillColor: "#FFF0AF",
          fillOpacity: requestOpacity,
        },
      )

      updateLayer(
        shouldShowHistoricalTitleLayer,
        historicalTitleLayerRef,
        historicalTitleLabelsLayerRef,
        null,
        {
          color: "#22577A",
          weight: 2,
          fillColor: "#38A3A5",
          fillOpacity: historicalTitleOpacity,
        },
        "https://annamineria.anm.gov.co/annageo/rest/services/SIGM/VisorInterno/MapServer/87",
      )


      // Forzamos que Leaflet refresque la vista
      mapRef.current.invalidateSize()
    } catch (error) {
      console.error("Error al actualizar las capas:", error)
      setShowErrorBanner(true)
      setError("Error al actualizar las capas del mapa")
    }

  }, [
    mapInstance,
    shouldShowTitleLayer,
    shouldShowRequestLayer,
    shouldShowAnmServiceLayer,
    shouldShowHistoricalTitleLayer,
    titleOpacity,
    requestOpacity,
    anmServiceOpacity,
    historicalTitleOpacity,
    findLayerNumbers,
  ])

  // Reaplicar opacidad según el valor de los sliders al hacer zoom
  useEffect(() => {
    if (!mapRef.current) return

    const map = mapRef.current

    const handleZoom = () => {
      if (titleLayerRef.current) {
        const style = {
          ...titleLayerRef.current.options.style,
          fillOpacity: titleOpacityRef.current,
        }
        titleLayerRef.current.options.style = style
        titleLayerRef.current.setStyle(style)
      }
      if (requestLayerRef.current) {
        const style = {
          ...requestLayerRef.current.options.style,
          fillOpacity: requestOpacityRef.current,
        }
        requestLayerRef.current.options.style = style
        requestLayerRef.current.setStyle(style)
      }
      if (historicalTitleLayerRef.current) {
        const style = {
          ...historicalTitleLayerRef.current.options.style,
          fillOpacity: historicalTitleOpacityRef.current,
        }
        historicalTitleLayerRef.current.options.style = style
        historicalTitleLayerRef.current.setStyle(style)
      }
      if (anmServiceLayerRef.current) {
        const style = {
          ...anmServiceLayerRef.current.options.style,
          fillOpacity: anmServiceOpacityRef.current,
        }
        anmServiceLayerRef.current.options.style = style
        anmServiceLayerRef.current.setStyle(style)
      }
    }

    map.on("zoomend", handleZoom)
    return () => {
      map.off("zoomend", handleZoom)
    }
  }, [mapInstance])



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


  const buildGpsCompassIcon = useCallback(
    (compassActive) => {
      const size = compassActive ? 250 : 44
      const center = size / 2

      let dialHtml = ''
      let needleHtml = ''

      if (compassActive) {
        let ticks = ''
        for (let i = 0; i < 360; i += 2) {
          const isTen = i % 10 === 0
          const length = isTen ? 12 : (i % 5 === 0 ? 8 : 4)
          ticks += `<line x1="${center}" y1="${isTen ? 0 : (12-length)}" x2="${center}" y2="12" transform="rotate(${i} ${center} ${center})" stroke="rgba(255,255,255,0.8)" stroke-width="1.5"/>`
          ticks += `<line x1="${center}" y1="${isTen ? 0 : (12-length)}" x2="${center}" y2="12" transform="rotate(${i} ${center} ${center})" stroke="rgba(0,0,0,0.5)" stroke-width="0.5"/>`
          if (isTen) {
            ticks += `<text x="${center}" y="24" transform="rotate(${i} ${center} ${center})" fill="white" font-size="10" text-anchor="middle" font-family="sans-serif" font-weight="bold" style="text-shadow: 1px 1px 2px black;">${i}</text>`
          }
        }

        dialHtml = `
          <svg width="${size}" height="${size}" viewBox="0 0 ${size} ${size}" style="position: absolute; left: 0; top: 0; pointer-events: none;">
            <circle cx="${center}" cy="${center}" r="${center - 2}" fill="rgba(0, 50, 100, 0.1)" stroke="rgba(255,255,255,0.4)" stroke-width="1"/>
            ${ticks}
            <g font-size="28" font-weight="bold" font-family="serif" style="text-shadow: 1px 1px 3px black;">
              <text x="${center}" y="55" fill="#ff4444" text-anchor="middle">N</text>
              <text x="${center}" y="${size - 35}" fill="white" text-anchor="middle">S</text>
              <text x="${size - 35}" y="${center + 10}" fill="white" text-anchor="middle">E</text>
              <text x="35" y="${center + 10}" fill="white" text-anchor="middle">W</text>
            </g>
            <line x1="${center - 15}" y1="${center}" x2="${center + 15}" y2="${center}" stroke="rgba(255,255,255,0.7)" stroke-width="1.5"/>
            <line x1="${center}" y1="${center - 15}" x2="${center}" y2="${center + 15}" stroke="rgba(255,255,255,0.7)" stroke-width="1.5"/>
          </svg>
        `

        needleHtml = `
          <div class="gps-compass__needle" style="width:${size}px; height:${size}px; left:0; top:0; transform-origin: center; transform: rotate(0deg); background:transparent; border:none; filter:none; position:absolute;">
            <svg width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
              <line x1="${center}" y1="${center}" x2="${center}" y2="20" stroke="#ff4444" stroke-width="2"/>
              <polygon points="${center - 4},35 ${center + 4},35 ${center},20" fill="#ff4444" />
              <circle cx="${center}" cy="${center}" r="3" fill="#ff4444"/>
            </svg>
          </div>
        `
      }

      return L.divIcon({
        className: "gps-compass-marker",
        html: `
          <div class="gps-compass__pulse" style="left: ${center}px; top: ${center}px;"></div>
          <div class="gps-compass__ring" style="width: ${size}px; height: ${size}px;">
            ${dialHtml}
            ${needleHtml}
            <div class="gps-compass__dot" style="left: ${center}px; top: ${center}px;"></div>
          </div>
        `,
        iconSize: [size, size],
        iconAnchor: [center, center],
      })
    },
    [],
  )


  const updateCompassNeedle = useCallback((heading) => {
    if (!Number.isFinite(heading) || !userLocationMarkerRef.current) return

    const markerElement = userLocationMarkerRef.current.getElement()
    if (!markerElement) return

    const needleElement = markerElement.querySelector(".gps-compass__needle")
    if (!needleElement) return

    needleElement.style.transform = `rotate(${heading}deg)`
  }, [])

  const startDeviceOrientationTracking = useCallback(async () => {
    if (typeof window === "undefined" || typeof DeviceOrientationEvent === "undefined") {
      setError("Este dispositivo no soporta lectura de brújula.")
      return false
    }

    if (deviceOrientationCleanupRef.current) {
      deviceOrientationCleanupRef.current()
      deviceOrientationCleanupRef.current = null
    }

    let permissionGranted = true

    if (typeof DeviceOrientationEvent.requestPermission === "function") {
      try {
        const permissionState = await DeviceOrientationEvent.requestPermission()
        permissionGranted = permissionState === "granted"
      } catch {
        permissionGranted = false
      }
    }

    if (!permissionGranted) {
      setError("GPS activo, pero no pude leer la orientación del celular (permiso denegado).")
      return false
    }

    const handleOrientation = (event) => {
      let heading = null

      if (typeof event.webkitCompassHeading === "number") {
        heading = event.webkitCompassHeading
      } else if (typeof event.alpha === "number") {
        heading = (360 - event.alpha) % 360
      }

      if (heading !== null) {
        setDeviceHeading(heading)
        deviceHeadingRef.current = heading
        updateCompassNeedle(heading)
      }
    }

    window.addEventListener("deviceorientationabsolute", handleOrientation, true)
    window.addEventListener("deviceorientation", handleOrientation, true)
    deviceOrientationCleanupRef.current = () => {
      window.removeEventListener("deviceorientationabsolute", handleOrientation, true)
      window.removeEventListener("deviceorientation", handleOrientation, true)
    }
    return true
  }, [updateCompassNeedle])

  const stopDeviceOrientationTracking = useCallback(() => {
    if (deviceOrientationCleanupRef.current) {
      deviceOrientationCleanupRef.current()
      deviceOrientationCleanupRef.current = null
    }
    setIsCompassActive(false)
    setDeviceHeading(null)
  }, [])

  const handleToggleCompass360 = useCallback(async () => {
    if (isCompassActive) {
      stopDeviceOrientationTracking()
      if (userLocationMarkerRef.current) {
        userLocationMarkerRef.current.setIcon(buildGpsCompassIcon(false))
      }
      return
    }

    setError(null)
    setShowErrorBanner(false)
    const started = await startDeviceOrientationTracking()
    if (started) {
      setIsCompassActive(true)
      if (userLocationMarkerRef.current) {
        userLocationMarkerRef.current.setIcon(buildGpsCompassIcon(true))
        setTimeout(() => {
          if (deviceHeadingRef.current !== null) {
            updateCompassNeedle(deviceHeadingRef.current)
          }
        }, 0)
      }
    }
  }, [isCompassActive, startDeviceOrientationTracking, stopDeviceOrientationTracking, buildGpsCompassIcon, updateCompassNeedle])

  const handleLocateUser = useCallback(() => {
    if (!mapRef.current) return

    if (hasLocated || isLocating) {
      if (locationWatchIdRef.current !== null) {
        navigator.geolocation.clearWatch(locationWatchIdRef.current)
        locationWatchIdRef.current = null
      }
      if (userLocationMarkerRef.current) {
        mapRef.current.removeLayer(userLocationMarkerRef.current)
        userLocationMarkerRef.current = null
      }
      setIsLocating(false)
      setHasLocated(false)
      hasCenteredRef.current = false
      return
    }

    if (!navigator.geolocation) {
      setShowErrorBanner(true)
      setError("Tu navegador no soporta geolocalización.")
      return
    }

    setError(null)
    setShowErrorBanner(false)
    setIsLocating(true)

    locationWatchIdRef.current = navigator.geolocation.watchPosition(
      async (position) => {
        setIsLocating(false)
        setHasLocated(true)
        const { latitude, longitude } = position.coords
        const map = mapRef.current

        if (userLocationMarkerRef.current) {
          userLocationMarkerRef.current.setLatLng([latitude, longitude])
          userLocationMarkerRef.current.setPopupContent(
            `Tu ubicación actual:<br/>Latitud: ${latitude.toFixed(6)}<br/>Longitud: ${longitude.toFixed(6)}`
          )
        } else {
          userLocationMarkerRef.current = L.marker([latitude, longitude], {
            icon: buildGpsCompassIcon(isCompassActive),
          })
            .addTo(map)
            .bindPopup(
              `Tu ubicación actual:<br/>Latitud: ${latitude.toFixed(6)}<br/>Longitud: ${longitude.toFixed(6)}`,
            )
        }

        // Solo centramos la cámara la primera vez para no interrumpir al usuario si mueve el mapa
        if (!hasCenteredRef.current) {
          map.flyTo([latitude, longitude], 16, {
            animate: true,
            duration: 1.5,
          })
          userLocationMarkerRef.current.openPopup()
          hasCenteredRef.current = true
        }
      },
      () => {
        setIsLocating(false)
        setHasLocated(false)
        hasCenteredRef.current = false
        setShowErrorBanner(true)
        setError("No se pudo obtener tu ubicación. Revisa permisos de GPS e inténtalo de nuevo.")
      },
      {
        enableHighAccuracy: true,
        timeout: 10000,
        maximumAge: 0
      },
    )
  }, [buildGpsCompassIcon, hasLocated, isLocating, isCompassActive])

  useEffect(() => {
    return () => {
      stopDeviceOrientationTracking()
      if (locationWatchIdRef.current !== null) {
        navigator.geolocation.clearWatch(locationWatchIdRef.current)
      }
    }
  }, [stopDeviceOrientationTracking])

  const compassLabels = Array.from({ length: 12 }, (_, index) => index * 30)

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
          onClick={handleLocateUser}
          className={`transition-colors ${
            isLocating
              ? "bg-blue-50 text-blue-500 animate-pulse"
              : hasLocated
                ? "bg-blue-50 text-blue-600 hover:bg-blue-100"
                : "bg-white text-black hover:bg-gray-200"
          }`}
        >
          <Crosshair className={`mr-2 h-4 w-4 ${isLocating ? "animate-spin" : ""}`} />
          {isLocating ? "Ubicando..." : hasLocated ? "Ubicación activa" : "Activar GPS"}
        </Button>
        <Button
          onClick={handleToggleCompass360}
          className={`transition-colors ${
            isCompassActive
              ? "bg-blue-50 text-blue-600 hover:bg-blue-100"
              : "bg-white text-black hover:bg-gray-200"
          }`}
        >
          <Compass className={`mr-2 h-4 w-4 ${isCompassActive ? "text-blue-600" : ""}`} />
          {isCompassActive ? "Ocultar 360°" : "Brújula 360°"}
        </Button>
        <Button
          onClick={() => window.open("https://www.linkedin.com/in/fabio-espinosa/", "_blank", "noopener,noreferrer")}
          className="bg-white text-black hover:bg-gray-200"
        >
          <User className="mr-2 h-4 w-4" />
          Fabio A. Espinosa
        </Button>
      </div>
      {error && showErrorBanner && (
        <div className="absolute top-0 left-0 right-0 bg-red-500 text-white p-2 z-10 flex items-center justify-between gap-2">
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
            .measure-control a {
              width: 30px;
              height: 30px;
              line-height: 30px;
              text-align: center;
              font-size: 16px;
              text-decoration: none;
            }
            .gps-compass-marker {
              background: transparent;
              border: none;
            }
            .gps-compass__ring {
              position: relative;
              width: 44px;
              height: 44px;
              border-radius: 9999px;
              background: transparent;
            }
            .gps-compass__dot {
              position: absolute;
              left: 50%;
              top: 50%;
              width: 16px;
              height: 16px;
              border-radius: 9999px;
              transform: translate(-50%, -50%);
              background: #007aff;
              border: 3px solid #ffffff;
              box-shadow: 0 0 6px rgba(0, 0, 0, 0.3);
              z-index: 3;
            }
            .gps-compass__needle {
              position: absolute;
              left: 50%;
              top: -6px;
              width: 0;
              height: 0;
              border-left: 20px solid transparent;
              border-right: 20px solid transparent;
              border-bottom: 40px solid rgba(0, 122, 255, 0.3);
              transform-origin: 50% 28px;
              transform: translateX(-50%) rotate(0deg);
              z-index: 2;
              border-radius: 10px;
              filter: blur(1px);
            }
            .gps-compass__pulse {
              position: absolute;
              left: 50%;
              top: 50%;
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
    </>
  )
}
