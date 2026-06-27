import { useEffect, useRef, useCallback } from "react"
import L from "leaflet"
import * as EsriLeaflet from "esri-leaflet"
import { getLabelCoordinates, createPopupContent } from "../../utils/mapUtils"

export const useMapLayers = (
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
) => {
  const titleLayerRef = useRef(null)
  const requestLayerRef = useRef(null)
  const anmServiceLayerRef = useRef(null)
  const historicalTitleLayerRef = useRef(null)
  const titleLabelsLayerRef = useRef(null)
  const requestLabelsLayerRef = useRef(null)
  const anmServiceLabelsLayerRef = useRef(null)
  const historicalTitleLabelsLayerRef = useRef(null)
  const titleOpacityRef = useRef(titleOpacity)
  const requestOpacityRef = useRef(requestOpacity)
  const anmServiceOpacityRef = useRef(anmServiceOpacity)
  const historicalTitleOpacityRef = useRef(historicalTitleOpacity)
  const layerNumbersCacheRef = useRef(null)

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

  const shouldShowTitleLayer = showTitleLayer && titleOpacity > 0
  const shouldShowRequestLayer = showRequestLayer && requestOpacity > 0
  const shouldShowAnmServiceLayer = showAnmServiceLayer && anmServiceOpacity > 0
  const shouldShowHistoricalTitleLayer = showHistoricalTitleLayer && historicalTitleOpacity > 0

  const findLayerNumbers = useCallback(async () => {
    if (layerNumbersCacheRef.current) {
      return layerNumbersCacheRef.current
    }

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

    layerNumbersCacheRef.current = foundLayers
    return foundLayers
  }, [])

  useEffect(() => {
    if (!mapInstance) return

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
              const bestPoint = getLabelCoordinates(feature)
              const [long, lat] = bestPoint

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

              const popupContent = createPopupContent(feature.properties)
              layer.bindPopup(popupContent)
            },
          }).addTo(mapRef.current)

          const currentZoom = mapRef.current.getZoom()
          if (currentZoom >= 15 && currentZoom <= 19 && labelsLayerRef.current) {
            mapRef.current.addLayer(labelsLayerRef.current)
          }
        } else {
          layerRef.current.options.style = layerStyle
          layerRef.current.setStyle(layerStyle)
        }
      } else if (layerRef.current) {
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
        { color: "#894444", weight: 2, fillColor: "#A46F48", fillOpacity: titleOpacity },
      )
      updateLayer(
        shouldShowAnmServiceLayer,
        anmServiceLayerRef,
        anmServiceLabelsLayerRef,
        null,
        { color: "#6E4B3A", weight: 2, fillColor: "#B68863", fillOpacity: anmServiceOpacity },
        "https://geo.anm.gov.co/webgis/rest/services/ANM/ServiciosANM/MapServer/3",
      )
      updateLayer(
        shouldShowRequestLayer,
        requestLayerRef,
        requestLabelsLayerRef,
        "Solicitud Vigente",
        { color: "#F0C567", weight: 2, fillColor: "#FFF0AF", fillOpacity: requestOpacity },
      )
      updateLayer(
        shouldShowHistoricalTitleLayer,
        historicalTitleLayerRef,
        historicalTitleLabelsLayerRef,
        null,
        { color: "#22577A", weight: 2, fillColor: "#38A3A5", fillOpacity: historicalTitleOpacity },
        "https://annamineria.anm.gov.co/annageo/rest/services/SIGM/VisorInterno/MapServer/87",
      )
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
    setError,
    setShowErrorBanner
  ])

  useEffect(() => {
    if (!mapInstance) return
    const map = mapInstance
    const handleZoom = () => {
      if (titleLayerRef.current) {
        const style = { ...titleLayerRef.current.options.style, fillOpacity: titleOpacityRef.current }
        titleLayerRef.current.options.style = style
        titleLayerRef.current.setStyle(style)
      }
      if (requestLayerRef.current) {
        const style = { ...requestLayerRef.current.options.style, fillOpacity: requestOpacityRef.current }
        requestLayerRef.current.options.style = style
        requestLayerRef.current.setStyle(style)
      }
      if (historicalTitleLayerRef.current) {
        const style = { ...historicalTitleLayerRef.current.options.style, fillOpacity: historicalTitleOpacityRef.current }
        historicalTitleLayerRef.current.options.style = style
        historicalTitleLayerRef.current.setStyle(style)
      }
      if (anmServiceLayerRef.current) {
        const style = { ...anmServiceLayerRef.current.options.style, fillOpacity: anmServiceOpacityRef.current }
        anmServiceLayerRef.current.options.style = style
        anmServiceLayerRef.current.setStyle(style)
      }
    }
    map.on("zoomend", handleZoom)
    return () => {
      map.off("zoomend", handleZoom)
    }
  }, [mapInstance])

  return {
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
  }
}
