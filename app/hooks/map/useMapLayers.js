import { useEffect, useRef, useCallback, useState } from "react"
import L from "leaflet"
import * as EsriLeaflet from "esri-leaflet"
import { getLabelCoordinates, getFeatureLabel, createPopupContent } from "../../utils/mapUtils"
import { fetchArcgisJson } from "../../utils/arcgis"

const TENURE_LAYERS_URL = "https://annamineria.anm.gov.co/annageo/rest/services/SIGM/TenureLayers/MapServer"
const REQUIRED_LAYER_NAMES = ["Solicitud Vigente", "Título Vigente"]
const LAYER_PROBE_RANGE = [0, 1, 2, 3, 4, 5]

// Estas capas cubren todo el país. Pedirlas a zoom bajo trae decenas de miles de
// polígonos: ArcGIS corta la respuesta en maxRecordCount y el mapa quedaba mostrando
// un subconjunto incompleto sin avisar, además de congelar el navegador.
export const LAYERS_MIN_ZOOM = 10

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
  const layerNumbersPromiseRef = useRef(null)
  const updateRunIdRef = useRef(0)

  const [isBelowLayersMinZoom, setIsBelowLayersMinZoom] = useState(false)

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

  const anyLayerEnabled =
    shouldShowTitleLayer || shouldShowRequestLayer || shouldShowAnmServiceLayer || shouldShowHistoricalTitleLayer

  const findLayerNumbers = useCallback(async () => {
    if (layerNumbersCacheRef.current) {
      return layerNumbersCacheRef.current
    }
    // Compartir la consulta en vuelo: varias llamadas concurrentes repetían las seis
    // peticiones de metadatos cada una.
    if (layerNumbersPromiseRef.current) {
      return layerNumbersPromiseRef.current
    }

    const request = (async () => {
      const probes = await Promise.all(
        LAYER_PROBE_RANGE.map(async (index) => {
          try {
            const data = await fetchArcgisJson(`${TENURE_LAYERS_URL}/${index}?f=json`)
            return [data.name, index]
          } catch (error) {
            console.error(`Error checking layer ${index}:`, error)
            return null
          }
        }),
      )

      const foundLayers = {}
      probes.forEach((probe) => {
        if (probe && REQUIRED_LAYER_NAMES.includes(probe[0])) {
          foundLayers[probe[0]] = probe[1]
        }
      })

      // No cachear un resultado incompleto: si todas las peticiones fallaban se
      // guardaba {} para siempre y las capas dinámicas quedaban rotas hasta recargar.
      if (REQUIRED_LAYER_NAMES.every((name) => foundLayers[name] !== undefined)) {
        layerNumbersCacheRef.current = foundLayers
      }

      return foundLayers
    })()

    layerNumbersPromiseRef.current = request
    try {
      return await request
    } finally {
      layerNumbersPromiseRef.current = null
    }
  }, [])

  useEffect(() => {
    if (!mapInstance) return

    // Cada ejecución invalida a la anterior. updateLayer espera a findLayerNumbers
    // antes de mirar layerRef.current, así que dos ejecuciones solapadas (arrastrar
    // el slider de opacidad, alternar switches rápido) veían ambas el ref vacío y
    // creaban y añadían dos capas superpuestas.
    updateRunIdRef.current += 1
    const runId = updateRunIdRef.current
    const isStale = () => runId !== updateRunIdRef.current

    const updateLayer = async (show, layerRef, labelsLayerRef, layerName, layerStyle, customUrl = null) => {
      let layerUrl = customUrl

      if (!layerUrl) {
        const layerNumbers = await findLayerNumbers()
        if (isStale()) return

        const layerNumber = layerNumbers[layerName]
        if (layerNumber === undefined) {
          throw new Error(`No se encontró la capa "${layerName}" en el servicio de la ANM`)
        }
        layerUrl = `${TENURE_LAYERS_URL}/${layerNumber}`
      }

      if (isStale() || !mapRef.current) return

      if (show) {
        if (!layerRef.current) {
          layerRef.current = EsriLeaflet.featureLayer({
            url: layerUrl,
            style: layerStyle,
            minZoom: LAYERS_MIN_ZOOM,
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
        } else {
          layerRef.current.options.style = layerStyle
          layerRef.current.setStyle(layerStyle)
        }
      } else if (layerRef.current) {
        // Anular el ref siempre, no solo cuando el grupo está en el mapa: fuera del
        // rango de zoom de etiquetas nunca lo está, y conservarlo hacía que al
        // reencender la capa los marcadores nuevos se apilaran sobre los viejos.
        if (labelsLayerRef.current) {
          if (mapRef.current.hasLayer(labelsLayerRef.current)) {
            mapRef.current.removeLayer(labelsLayerRef.current)
          }
          labelsLayerRef.current = null
        }
        if (mapRef.current.hasLayer(layerRef.current)) {
          mapRef.current.removeLayer(layerRef.current)
        }
        layerRef.current = null
      }
    }

    // El try/catch anterior envolvía llamadas async que nunca se esperaban, así que
    // todo fallo se convertía en una promesa rechazada sin manejar y el banner de
    // error nunca aparecía.
    const run = async () => {
      try {
        await Promise.all([
          updateLayer(
            shouldShowTitleLayer,
            titleLayerRef,
            titleLabelsLayerRef,
            "Título Vigente",
            { color: "#894444", weight: 2, fillColor: "#A46F48", fillOpacity: titleOpacity },
          ),
          updateLayer(
            shouldShowAnmServiceLayer,
            anmServiceLayerRef,
            anmServiceLabelsLayerRef,
            null,
            { color: "#6E4B3A", weight: 2, fillColor: "#B68863", fillOpacity: anmServiceOpacity },
            "https://geo.anm.gov.co/webgis/rest/services/ANM/ServiciosANM/MapServer/3",
          ),
          updateLayer(
            shouldShowRequestLayer,
            requestLayerRef,
            requestLabelsLayerRef,
            "Solicitud Vigente",
            { color: "#F0C567", weight: 2, fillColor: "#FFF0AF", fillOpacity: requestOpacity },
          ),
          updateLayer(
            shouldShowHistoricalTitleLayer,
            historicalTitleLayerRef,
            historicalTitleLabelsLayerRef,
            null,
            { color: "#22577A", weight: 2, fillColor: "#38A3A5", fillOpacity: historicalTitleOpacity },
            "https://annamineria.anm.gov.co/annageo/rest/services/SIGM/VisorInterno/MapServer/87",
          ),
        ])

        if (isStale() || !mapRef.current) return
        mapRef.current.invalidateSize()
      } catch (error) {
        if (isStale()) return
        console.error("Error al actualizar las capas:", error)
        setShowErrorBanner(true)
        setError(`Error al actualizar las capas del mapa: ${error.message}`)
      }
    }

    run()
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
    mapRef,
    setError,
    setShowErrorBanner
  ])

  // Desmontaje. El efecto de arriba se re-ejecuta con cada cambio de opacidad, así
  // que no puede llevar esta limpieza: destruiría y recargaría las capas cada vez.
  useEffect(() => {
    if (!mapInstance) return

    const layerPairs = [
      [titleLayerRef, titleLabelsLayerRef],
      [requestLayerRef, requestLabelsLayerRef],
      [anmServiceLayerRef, anmServiceLabelsLayerRef],
      [historicalTitleLayerRef, historicalTitleLabelsLayerRef],
    ]

    return () => {
      // Sin esto los refs sobrevivían al remontaje apuntando a capas de un mapa ya
      // destruido, y updateLayer entraba por la rama de setStyle: las capas no
      // volvían a aparecer nunca.
      layerPairs.forEach(([layerRef, labelsLayerRef]) => {
        ;[layerRef, labelsLayerRef].forEach((ref) => {
          if (ref.current) {
            if (mapInstance.hasLayer(ref.current)) {
              mapInstance.removeLayer(ref.current)
            }
            ref.current = null
          }
        })
      })
    }
  }, [mapInstance])

  useEffect(() => {
    if (!mapInstance) return
    const map = mapInstance

    const handleZoom = () => {
      setIsBelowLayersMinZoom(map.getZoom() < LAYERS_MIN_ZOOM)

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

    handleZoom()
    map.on("zoomend", handleZoom)
    return () => {
      map.off("zoomend", handleZoom)
    }
  }, [mapInstance])

  return {
    findLayerNumbers,
    // Una capa encendida por debajo del zoom mínimo no dibuja nada: hay que decirlo,
    // en vez de dejar el mapa vacío sin explicación.
    showZoomInHint: anyLayerEnabled && isBelowLayersMinZoom,
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
