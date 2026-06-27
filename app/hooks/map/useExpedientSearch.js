import { useEffect, useRef, useCallback } from "react"
import L from "leaflet"
import { getLabelCoordinates, createPopupContent } from "../../utils/mapUtils"

export const useExpedientSearch = (
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
) => {
  const lastSearchTriggerRef = useRef(0)

  const fetchData = useCallback(async () => {
    if (!mapInstance || !expedientCode) return
    const normalizedCode = expedientCode.trim().toUpperCase().replace(/'/g, "''")

    const layerNumbers = await findLayerNumbers()

    const layers = [
      {
        url: `https://annamineria.anm.gov.co/annageo/rest/services/SIGM/TenureLayers/MapServer/${layerNumbers["Título Vigente"]}/query`,
        style: { color: "#894444", weight: 3, fillColor: "#A46F48", fillOpacity: 0.6 },
      },
      {
        url: "https://geo.anm.gov.co/webgis/rest/services/ANM/ServiciosANM/MapServer/3/query",
        style: { color: "#6E4B3A", weight: 3, fillColor: "#B68863", fillOpacity: 0.6 },
      },
      {
        url: `https://annamineria.anm.gov.co/annageo/rest/services/SIGM/TenureLayers/MapServer/${layerNumbers["Solicitud Vigente"]}/query`,
        style: { color: "#F0C567", weight: 3, fillColor: "#FFF0AF", fillOpacity: 0.6 },
      },
      {
        url: "https://annamineria.anm.gov.co/annageo/rest/services/SIGM/VisorInterno/MapServer/87/query",
        style: { color: "#22577A", weight: 3, fillColor: "#38A3A5", fillOpacity: 0.6 },
      },
    ]

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
            geoJsonLayerRef.current = L.geoJSON(data, {
              style: layer.style,
              onEachFeature: (feature, layer) => {
                const bestPoint = getLabelCoordinates(feature)
                const [long, lat] = bestPoint

                const label = L.divIcon({
                  className: "map-label",
                  html: `<div>${feature.properties.TENURE_ID}</div>`,
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

            mapRef.current.fitBounds(geoJsonLayerRef.current.getBounds())

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

            const mappedCoordinates = allCoordinates.map((coord) => [coord[1], coord[0]])
            if (mapRef.current.addVertices) {
              mapRef.current.addVertices(mappedCoordinates)
            }

            onCoordinatesUpdate(allCoordinates, data)
            return
          }
        } catch (error) {
          console.error("Error al obtener los datos:", error)
          hasFetchError = true
        }
      }
    }

    setShowErrorBanner(true)
    if (hasFetchError) {
      setError(`No se pudo obtener la información de algunas capas debido a un error del servidor, y no se encontró el expediente introducido '${expedientCode}'.`)
    } else {
      setError(`No se encontró un polígono con el expediente introducido '${expedientCode}'.`)
    }
    onCoordinatesUpdate([], null)
  }, [
    expedientCode, onCoordinatesUpdate, findLayerNumbers, mapInstance,
    setError, setShowErrorBanner, geoJsonLayerRef, labelsLayerRef, verticesLayerRef
  ])

  useEffect(() => {
    if (searchTrigger !== lastSearchTriggerRef.current) {
      lastSearchTriggerRef.current = searchTrigger
      setError(null)
      setShowErrorBanner(false)
      fetchData()
    }
  }, [searchTrigger, fetchData, setError, setShowErrorBanner])
}
