"use client"

import { useEffect, useRef, useState } from "react"
import L from "leaflet"
import "leaflet/dist/leaflet.css"
import "leaflet-draw"
import "leaflet-draw/dist/leaflet.draw.css"

import { useMapInitialization } from "./hooks/map/useMapInitialization"
import { useDrawControl } from "./hooks/map/useDrawControl"
import { useGeolocation } from "./hooks/map/useGeolocation"
import { useMapLayers } from "./hooks/map/useMapLayers"
import { useExpedientSearch } from "./hooks/map/useExpedientSearch"
import { formatDistance, formatArea } from "./utils/mapUtils"
import { MapControls } from "./components/MapControls"
import { ColorPicker } from "./components/ColorPicker"

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
  const drawControlRef = useRef(null)
  const drawnItemsRef = useRef(null)
  const measureControlRef = useRef(null)
  const geoJsonLayerRef = useRef(null)
  const verticesLayerRef = useRef(null)
  const labelsLayerRef = useRef(null)

  const [error, setError] = useState(null)
  const [showErrorBanner, setShowErrorBanner] = useState(false)
  const [mapInstance, setMapInstance] = useState(null)

  const { baseLayer, toggleBaseLayer } = useMapInitialization(mapRef)

  const {
    drawingColor,
    handleColorChange,
    showColorPicker,
    setShowColorPicker
  } = useDrawControl(mapRef, drawControlRef, drawnItemsRef)

  const {
    isLocating,
    hasLocated,
    isCompassActive,
    handleLocateUser,
    handleToggleCompass360,
    userLocationMarkerRef
  } = useGeolocation(mapRef, setError, setShowErrorBanner)

  const {
    findLayerNumbers,
    titleLayerRef,
    requestLayerRef,
    historicalTitleLayerRef,
    anmServiceLayerRef,
    titleOpacityRef,
    requestOpacityRef,
    historicalTitleOpacityRef,
    titleLabelsLayerRef,
    requestLabelsLayerRef,
    anmServiceLabelsLayerRef,
    historicalTitleLabelsLayerRef
  } = useMapLayers(
    mapRef,
    mapInstance,
    showTitleLayer,
    showRequestLayer,
    showAnmServiceLayer,
    showHistoricalTitleLayer,
    titleOpacity,
    requestOpacity,
    anmServiceOpacity,
    historicalTitleOpacity,
    setError,
    setShowErrorBanner
  )

  useExpedientSearch(
    mapRef,
    mapInstance,
    expedientCode,
    searchTrigger,
    onCoordinatesUpdate,
    findLayerNumbers,
    setError,
    setShowErrorBanner,
    geoJsonLayerRef,
    labelsLayerRef,
    verticesLayerRef
  )

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

      L.control.zoom({ position: "topright" }).addTo(mapInstanceLocal)

      const osmLayer = L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
        attribution: "© OpenStreetMap contributors",
      })
      osmLayer.addTo(mapInstanceLocal)

      drawnItemsRef.current = new L.FeatureGroup()
      mapInstanceLocal.addLayer(drawnItemsRef.current)

      const markerIcon = new L.Icon({
        iconUrl: "https://unpkg.com/leaflet@1.7.1/dist/images/marker-icon.png",
        iconRetinaUrl: "https://unpkg.com/leaflet@1.7.1/dist/images/marker-icon-2x.png",
        shadowUrl: "https://unpkg.com/leaflet@1.7.1/dist/images/marker-shadow.png",
        iconSize: [25, 41],
        iconAnchor: [12, 41],
        popupAnchor: [1, -34],
        shadowSize: [41, 41],
      })

      drawControlRef.current = new L.Control.Draw({
        position: "topright",
        draw: {
          polyline: {
            shapeOptions: { color: drawingColor, weight: 5 },
          },
          polygon: {
            allowIntersection: false,
            drawError: {
              color: "#e1e100",
              message: "<strong>¡Error!</strong> No se permiten polígonos que se intersecten.",
            },
            shapeOptions: { color: drawingColor },
          },
          circle: { shapeOptions: { color: drawingColor } },
          rectangle: { shapeOptions: { color: drawingColor } },
          marker: { icon: markerIcon },
          circlemarker: false,
        },
        edit: {
          featureGroup: drawnItemsRef.current,
          remove: true,
        },
      })

      mapInstanceLocal.addControl(drawControlRef.current)

      const startDistanceMeasure = () => {
        const drawer = new L.Draw.Polyline(mapInstanceLocal, {
          shapeOptions: { color: drawingColor, weight: 5 },
        })
        drawer.enable()
      }

      const startAreaMeasure = () => {
        const drawer = new L.Draw.Polygon(mapInstanceLocal, {
          allowIntersection: false,
          showArea: true,
          shapeOptions: { color: drawingColor },
        })
        drawer.enable()
      }

      const MeasureControl = L.Control.extend({
        options: { position: "topright" },
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

      const handleZoom = () => {
        const currentZoom = mapInstanceLocal.getZoom()
        const labelsLayers = [
          labelsLayerRef.current,
          titleLabelsLayerRef.current,
          requestLabelsLayerRef.current,
          anmServiceLabelsLayerRef.current,
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

        if (titleLayerRef.current && titleOpacityRef.current !== undefined) {
          titleLayerRef.current.setStyle({ fillOpacity: titleOpacityRef.current })
        }
        if (requestLayerRef.current && requestOpacityRef.current !== undefined) {
          requestLayerRef.current.setStyle({ fillOpacity: requestOpacityRef.current })
        }
        if (historicalTitleLayerRef.current && historicalTitleOpacityRef.current !== undefined) {
          historicalTitleLayerRef.current.setStyle({ fillOpacity: historicalTitleOpacityRef.current })
        }
      }

      mapInstanceLocal.on("zoomend", handleZoom)

      mapRef.current = mapInstanceLocal

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

      mapRef.current.removeVertices = () => {
        if (verticesLayerRef.current && mapInstanceLocal.hasLayer(verticesLayerRef.current)) {
          mapInstanceLocal.removeLayer(verticesLayerRef.current)
          verticesLayerRef.current = null
        }
      }

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

    return () => {
      if (mapRef.current) {
        mapRef.current.remove()
        mapRef.current = null
      }
      labelsLayerRef.current = null
      titleLabelsLayerRef.current = null
      requestLabelsLayerRef.current = null
      anmServiceLabelsLayerRef.current = null
      historicalTitleLabelsLayerRef.current = null
    }
  }, [onMapInitialized])

  return (
    <>
      <div id="map" className="absolute inset-0 z-0"></div>

      <ColorPicker
        drawingColor={drawingColor}
        handleColorChange={handleColorChange}
        showColorPicker={showColorPicker}
        setShowColorPicker={setShowColorPicker}
      />

      <MapControls
        baseLayer={baseLayer}
        toggleBaseLayer={toggleBaseLayer}
        isLocating={isLocating}
        hasLocated={hasLocated}
        handleLocateUser={handleLocateUser}
        isCompassActive={isCompassActive}
        handleToggleCompass360={handleToggleCompass360}
      />

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
