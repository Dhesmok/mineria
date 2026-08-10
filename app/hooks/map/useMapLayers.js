import { useEffect, useRef, useCallback, useState } from "react"
import L from "leaflet"
import * as EsriLeaflet from "esri-leaflet"
import { createPopupContent } from "../../utils/mapUtils"
import { createLabelMarker, shouldShowLabels, syncLabelsWithFeatures } from "../../utils/mapLabels"
import {
  findTenureLayerNumbers,
  REQUEST_LAYER_NAME,
  TITLE_LAYER_NAME,
  tenureLayerUrl,
} from "../../utils/tenureLayers"

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

  // El interruptor decide si la capa existe; el slider solo controla el relleno.
  // Antes una opacidad de 0 destruía la capa entera —contorno incluido— y forzaba a
  // recargarla desde el servidor al volver a subir el slider.
  const anyLayerEnabled =
    showTitleLayer || showRequestLayer || showAnmServiceLayer || showHistoricalTitleLayer

  useEffect(() => {
    if (!mapInstance) return

    // Cada ejecución invalida a la anterior. updateLayer espera a findTenureLayerNumbers
    // antes de mirar layerRef.current, así que dos ejecuciones solapadas (arrastrar
    // el slider de opacidad, alternar switches rápido) veían ambas el ref vacío y
    // creaban y añadían dos capas superpuestas.
    updateRunIdRef.current += 1
    const runId = updateRunIdRef.current
    const isStale = () => runId !== updateRunIdRef.current

    const updateLayer = async (show, layerRef, labelsLayerRef, layerName, layerStyle, customUrl = null) => {
      // Capa apagada y todavía sin crear: no hay nada que hacer. Resolver la URL aquí
      // disparaba el descubrimiento de capas nada más cargar la página, con los cuatro
      // interruptores en off, y sacaba el banner de error si el servicio no respondía.
      if (!show && !layerRef.current) return

      let layerUrl = customUrl

      if (show && !layerUrl) {
        const layerNumbers = await findTenureLayerNumbers()
        if (isStale()) return

        const layerNumber = layerNumbers[layerName]
        if (layerNumber === undefined) {
          throw new Error(`No se encontró la capa "${layerName}" en el servicio de la ANM`)
        }
        layerUrl = tenureLayerUrl(layerNumber)
      }

      if (isStale() || !mapRef.current) return

      if (show) {
        if (!layerRef.current) {
          // Poblado desde onEachFeature; syncLabelsWithFeatures lo usa para quitar y
          // reponer las etiquetas según entran y salen del viewport.
          const labelMarkers = new Map()

          layerRef.current = EsriLeaflet.featureLayer({
            url: layerUrl,
            style: layerStyle,
            minZoom: LAYERS_MIN_ZOOM,
            onEachFeature: (feature, layer) => {
              const marker = createLabelMarker(feature)

              if (marker) {
                if (!labelsLayerRef.current) {
                  labelsLayerRef.current = L.layerGroup()
                }
                labelsLayerRef.current.addLayer(marker)
                labelMarkers.set(feature.id, marker)
              }

              layer.bindPopup(createPopupContent(feature.properties))
            },
          })

          syncLabelsWithFeatures(layerRef.current, labelsLayerRef, labelMarkers)
          layerRef.current.addTo(mapRef.current)

          if (shouldShowLabels(mapRef.current.getZoom()) && labelsLayerRef.current) {
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
            showTitleLayer,
            titleLayerRef,
            titleLabelsLayerRef,
            TITLE_LAYER_NAME,
            { color: "#894444", weight: 2, fillColor: "#A46F48", fillOpacity: titleOpacity },
          ),
          updateLayer(
            showAnmServiceLayer,
            anmServiceLayerRef,
            anmServiceLabelsLayerRef,
            null,
            { color: "#6E4B3A", weight: 2, fillColor: "#B68863", fillOpacity: anmServiceOpacity },
            "https://geo.anm.gov.co/webgis/rest/services/ANM/ServiciosANM/MapServer/3",
          ),
          updateLayer(
            showRequestLayer,
            requestLayerRef,
            requestLabelsLayerRef,
            REQUEST_LAYER_NAME,
            { color: "#F0C567", weight: 2, fillColor: "#FFF0AF", fillOpacity: requestOpacity },
          ),
          updateLayer(
            showHistoricalTitleLayer,
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
    showTitleLayer,
    showRequestLayer,
    showAnmServiceLayer,
    showHistoricalTitleLayer,
    titleOpacity,
    requestOpacity,
    anmServiceOpacity,
    historicalTitleOpacity,
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
