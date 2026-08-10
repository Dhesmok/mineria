import { useEffect, useRef, useCallback } from "react"
import L from "leaflet"
import { getLabelCoordinates, getFeatureLabel, createPopupContent, extractRings } from "../../utils/mapUtils"
import { fetchArcgisJson } from "../../utils/arcgis"

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
  const searchIdRef = useRef(0)
  const abortControllerRef = useRef(null)

  const fetchData = useCallback(async () => {
    if (!mapInstance || !expedientCode) return
    const normalizedCode = expedientCode.trim().toUpperCase().replace(/'/g, "''")

    // Una búsqueda invalida a la anterior. Sin esto, pulsar "Aplicar" varias veces
    // dejaba una copia huérfana del polígono en el mapa por cada búsqueda en vuelo:
    // la nueva sobrescribía geoJsonLayerRef antes de que la anterior terminara, así
    // que la capa vieja se quedaba dibujada y ya nadie podía quitarla.
    abortControllerRef.current?.abort()
    const controller = new AbortController()
    abortControllerRef.current = controller
    searchIdRef.current += 1
    const searchId = searchIdRef.current
    const isStale = () => searchId !== searchIdRef.current

    const layerNumbers = await findLayerNumbers()
    if (isStale()) return

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

    // Los vértices también: antes una búsqueda fallida dejaba en el mapa los
    // círculos rojos del expediente anterior.
    const layersToClear = [geoJsonLayerRef, labelsLayerRef, verticesLayerRef]
    layersToClear.forEach((ref) => {
      if (ref.current) {
        if (mapRef.current.hasLayer(ref.current)) {
          mapRef.current.removeLayer(ref.current)
        }
        ref.current = null
      }
    })

    // Una capa que responde a alguna de sus dos consultas está sana y simplemente no
    // tiene el expediente. Solo cuenta como caída si fallan las dos: cada capa se
    // sondea con TENURE_ID y con CODIGO_EXPEDIENTE, y es normal que una de ellas
    // devuelva un error de campo inexistente.
    let unreachableLayers = 0

    for (const layer of layers) {
      const queries = [
        `UPPER(TENURE_ID)='${normalizedCode}'`,
        `UPPER(CODIGO_EXPEDIENTE)='${normalizedCode}'`
      ];

      let layerResponded = false

      for (const whereClause of queries) {
        const params = new URLSearchParams({
          where: whereClause,
          outFields: "*",
          returnGeometry: "true",
          f: "geojson",
        })

        try {
          const data = await fetchArcgisJson(`${layer.url}?${params}`, { signal: controller.signal })
          layerResponded = true

          // Otra búsqueda arrancó mientras esperábamos: no tocar el mapa.
          if (isStale()) return

          if (data.features && data.features.length > 0) {
            geoJsonLayerRef.current = L.geoJSON(data, {
              style: layer.style,
              onEachFeature: (feature, layer) => {
                const bestPoint = getLabelCoordinates(feature)

                if (bestPoint) {
                  const [long, lat] = bestPoint

                  const label = L.divIcon({
                    className: "map-label",
                    html: `<div>${getFeatureLabel(feature.properties)}</div>`,
                    iconSize: [100, 40],
                    iconAnchor: [50, 20],
                  })

                  if (!labelsLayerRef.current) {
                    labelsLayerRef.current = L.layerGroup()
                  }
                  const marker = L.marker([lat, long], { icon: label })
                  labelsLayerRef.current.addLayer(marker)
                }

                const popupContent = createPopupContent(feature.properties)
                layer.bindPopup(popupContent)
              },
            }).addTo(mapRef.current)

            const currentZoom = mapRef.current.getZoom()
            if (currentZoom >= 15 && currentZoom <= 19 && labelsLayerRef.current) {
              mapRef.current.addLayer(labelsLayerRef.current)
            }

            mapRef.current.fitBounds(geoJsonLayerRef.current.getBounds())

            // Todas las features y todos sus anillos, no solo la primera.
            const rings = extractRings(data)
            const allCoordinates = rings.flatMap((ring) => ring.coordinates)

            if (mapRef.current.addVertices) {
              mapRef.current.addVertices(rings)
            }

            onCoordinatesUpdate(allCoordinates, data, rings)
            return
          }
        } catch (error) {
          if (error?.name === "AbortError") return
          console.error("Error al obtener los datos:", error)
        }
      }

      if (!layerResponded) {
        unreachableLayers += 1
      }
    }

    if (isStale()) return

    setShowErrorBanner(true)
    if (unreachableLayers === layers.length) {
      setError("No se pudo consultar ninguna de las capas de la ANM. Revisa tu conexión e inténtalo de nuevo.")
    } else if (unreachableLayers > 0) {
      setError(`${unreachableLayers} de ${layers.length} capas de la ANM no respondieron, y el expediente '${expedientCode}' no se encontró en las demás.`)
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

  useEffect(() => {
    return () => {
      abortControllerRef.current?.abort()
    }
  }, [])
}
