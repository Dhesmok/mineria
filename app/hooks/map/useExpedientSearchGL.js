import { useCallback, useEffect, useRef } from "react"
import { LngLatBounds, Marker, Popup } from "maplibre-gl"

import { createPopupContent, extractRings, formatDegrees, getFeatureLabel } from "../../utils/mapUtils"
import { createLabelElement } from "../../utils/mapLabelsGL"
import { fetchArcgisJson } from "../../utils/arcgis"
import { emptyFeatureCollection } from "../../utils/anmLayers"
import { INITIAL_CENTER, INITIAL_ZOOM, SEARCH_LAYERS, SEARCH_SOURCES } from "../../utils/mapStyles"
import {
  findTenureLayerNumbers,
  REQUEST_LAYER_NAME,
  TITLE_LAYER_NAME,
  tenureLayerUrl,
} from "../../utils/tenureLayers"

/**
 * Búsqueda por expediente sobre MapLibre.
 *
 * La lógica de consulta es la misma del visor Leaflet, incluidas sus dos
 * lecciones aprendidas: cada capa se sondea con `TENURE_ID` y con
 * `CODIGO_EXPEDIENTE` porque no todas exponen el mismo campo, y una capa solo
 * cuenta como caída si fallan sus dos consultas —es normal que una devuelva
 * "campo inexistente"—. Lo que cambia es el dibujo.
 *
 * Detalle que conviene no perder: esta ruta sí pide `f=geojson` y funciona así
 * desde antes de la migración. Las capas masivas de la Fase 2 piden `f=json` por
 * prudencia; aquí se respeta lo que ya estaba probado en producción.
 */

const RESULT_STYLES = {
  title: { line: "#894444", fill: "#A46F48" },
  anmService: { line: "#6E4B3A", fill: "#B68863" },
  request: { line: "#F0C567", fill: "#FFF0AF" },
  historicalTitle: { line: "#22577A", fill: "#38A3A5" },
}

/** Recuadro que encierra a toda una FeatureCollection, para encuadrar el mapa. */
const boundsOf = (featureCollection) => {
  const bounds = new LngLatBounds()
  let any = false

  const walk = (coordinates) => {
    if (typeof coordinates?.[0] === "number") {
      bounds.extend(coordinates)
      any = true
      return
    }
    ;(coordinates || []).forEach(walk)
  }

  featureCollection.features.forEach((feature) => walk(feature?.geometry?.coordinates))
  return any ? bounds : null
}

/** Los vértices como puntos numerados, para dibujarlos y poder consultarlos. */
const verticesFeatureCollection = (rings) => {
  const showPart = rings.length > 1
  let vertexNumber = 0

  return {
    type: "FeatureCollection",
    features: rings.flatMap((ring) =>
      ring.coordinates.map(([lon, lat]) => {
        vertexNumber += 1
        return {
          type: "Feature",
          geometry: { type: "Point", coordinates: [lon, lat] },
          properties: {
            // Se guarda ya formateado: la ficha del vértice solo tiene que
            // mostrarlo. Antes se pasaban [lat, lon] y se leía coord[1] como
            // latitud, así que el globo mostraba la longitud rotulada "Lat".
            etiqueta: [
              showPart ? ring.label : null,
              `Vértice ${vertexNumber}`,
              `Lat: ${formatDegrees(lat)}`,
              `Lon: ${formatDegrees(lon)}`,
            ]
              .filter(Boolean)
              .join("\n"),
          },
        }
      }),
    ),
  }
}

export const useExpedientSearchGL = (
  mapRef,
  mapInstance,
  expedientCode,
  searchTrigger,
  onCoordinatesUpdate,
  setError,
  setShowErrorBanner,
) => {
  const lastSearchTriggerRef = useRef(0)
  const searchIdRef = useRef(0)
  const abortControllerRef = useRef(null)
  // La etiqueta del expediente encontrado, como marcador HTML igual que las de
  // las capas de la ANM.
  const labelMarkerRef = useRef(null)

  const setSourceData = useCallback(
    (sourceId, data) => {
      mapRef.current?.getSource(sourceId)?.setData(data)
    },
    [mapRef],
  )

  const removeVertices = useCallback(() => {
    setSourceData(SEARCH_SOURCES.vertices, emptyFeatureCollection())
  }, [setSourceData])

  const addVertices = useCallback(
    (rings) => {
      setSourceData(SEARCH_SOURCES.vertices, verticesFeatureCollection(rings))
    },
    [setSourceData],
  )

  const clearSearchResult = useCallback(() => {
    setSourceData(SEARCH_SOURCES.result, emptyFeatureCollection())
    removeVertices()
    labelMarkerRef.current?.remove()
    labelMarkerRef.current = null
    mapRef.current?.flyTo({ center: INITIAL_CENTER, zoom: INITIAL_ZOOM })
    setError(null)
  }, [mapRef, removeVertices, setSourceData, setError])

  const fetchData = useCallback(async () => {
    const map = mapRef.current
    if (!map || !expedientCode) return

    const normalizedCode = expedientCode.trim().toUpperCase().replace(/'/g, "''")

    // Una búsqueda invalida a la anterior. Sin esto, pulsar "Aplicar" varias
    // veces dejaba dibujado el resultado de una consulta que llegó tarde.
    abortControllerRef.current?.abort()
    const controller = new AbortController()
    abortControllerRef.current = controller
    searchIdRef.current += 1
    const searchId = searchIdRef.current
    const isStale = () => searchId !== searchIdRef.current

    const layerNumbers = await findTenureLayerNumbers()
    if (isStale()) return

    // Una capa que no se pudo descubrir se omite en vez de construir una URL con
    // ".../MapServer/undefined/query", pero sigue contando en el total para que
    // el mensaje de error no mienta sobre cuántas capas se consultaron.
    const dynamicLayer = (layerName, key) => {
      const layerNumber = layerNumbers[layerName]
      return layerNumber === undefined ? null : { url: `${tenureLayerUrl(layerNumber)}/query`, key }
    }

    const allLayers = [
      dynamicLayer(TITLE_LAYER_NAME, "title"),
      {
        url: "https://geo.anm.gov.co/webgis/rest/services/ANM/ServiciosANM/MapServer/3/query",
        key: "anmService",
      },
      dynamicLayer(REQUEST_LAYER_NAME, "request"),
      {
        url: "https://annamineria.anm.gov.co/annageo/rest/services/SIGM/VisorInterno/MapServer/87/query",
        key: "historicalTitle",
      },
    ]
    const layers = allLayers.filter(Boolean)
    const totalLayers = allLayers.length

    // Limpiar antes de buscar: si no, una búsqueda sin resultados dejaba en el
    // mapa el polígono y los vértices del expediente anterior.
    setSourceData(SEARCH_SOURCES.result, emptyFeatureCollection())
    removeVertices()
    labelMarkerRef.current?.remove()
    labelMarkerRef.current = null

    let unreachableLayers = totalLayers - layers.length

    for (const layer of layers) {
      // No todas las capas exponen los dos campos; por eso se prueban ambos.
      const queries = [
        `UPPER(TENURE_ID)='${normalizedCode}'`,
        `UPPER(CODIGO_EXPEDIENTE)='${normalizedCode}'`,
      ]

      let layerResponded = false

      for (const whereClause of queries) {
        const params = new URLSearchParams({
          where: whereClause,
          outFields: "*",
          returnGeometry: "true",
          f: "geojson",
        })

        try {
          const data = await fetchArcgisJson(`${layer.url}?${params}`, {
            signal: controller.signal,
          })
          layerResponded = true

          // Otra búsqueda arrancó mientras esperábamos: no tocar el mapa.
          if (isStale()) return

          if (data.features && data.features.length > 0) {
            const style = RESULT_STYLES[layer.key]
            map.setPaintProperty(SEARCH_LAYERS.fill, "fill-color", style.fill)
            map.setPaintProperty(SEARCH_LAYERS.line, "line-color", style.line)
            setSourceData(SEARCH_SOURCES.result, data)

            const bounds = boundsOf(data)
            if (bounds) map.fitBounds(bounds, { padding: 60, duration: 800 })

            // La etiqueta del expediente buscado se muestra siempre, sin
            // depender del zoom: es un único resultado que el usuario pidió, y
            // el encuadre suele quedar por debajo del zoom mínimo de las capas
            // masivas.
            const label = createLabelElement(data.features[0])
            if (label) {
              labelMarkerRef.current = new Marker({ element: label.element })
                .setLngLat(label.coordinates)
                .addTo(map)
            }

            // Todas las features y todos sus anillos, no solo la primera.
            const rings = extractRings(data)
            addVertices(rings)

            onCoordinatesUpdate(
              rings.flatMap((ring) => ring.coordinates),
              data,
              rings,
            )
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
    if (unreachableLayers === totalLayers) {
      setError(
        "No se pudo consultar ninguna de las capas de la ANM. Revisa tu conexión e inténtalo de nuevo.",
      )
    } else if (unreachableLayers > 0) {
      setError(
        `${unreachableLayers} de ${totalLayers} capas de la ANM no respondieron, y el expediente '${expedientCode}' no se encontró en las demás.`,
      )
    } else {
      setError(`No se encontró un polígono con el expediente introducido '${expedientCode}'.`)
    }
    onCoordinatesUpdate([], null)
  }, [
    addVertices,
    expedientCode,
    mapRef,
    onCoordinatesUpdate,
    removeVertices,
    setError,
    setShowErrorBanner,
    setSourceData,
  ])

  useEffect(() => {
    if (!mapInstance) return
    if (searchTrigger !== lastSearchTriggerRef.current) {
      lastSearchTriggerRef.current = searchTrigger
      setError(null)
      setShowErrorBanner(false)
      fetchData()
    }
  }, [mapInstance, searchTrigger, fetchData, setError, setShowErrorBanner])

  // Ficha del expediente al hacer clic, y de cada vértice al pasar por encima.
  useEffect(() => {
    if (!mapInstance) return

    const popup = new Popup({ maxWidth: "320px", closeOnClick: false })
    const vertexPopup = new Popup({ closeButton: false, closeOnClick: false, offset: 12 })

    const onResultClick = (event) => {
      const feature = event.features?.[0]
      if (!feature) return
      popup.setLngLat(event.lngLat).setHTML(createPopupContent(feature.properties)).addTo(mapInstance)
    }

    const onVertexEnter = (event) => {
      const feature = event.features?.[0]
      if (!feature) return
      mapInstance.getCanvas().style.cursor = "pointer"
      vertexPopup
        .setLngLat(feature.geometry.coordinates)
        // El texto lleva saltos de línea, y setText los respeta con el
        // white-space que aplica la hoja de estilos del componente.
        .setText(feature.properties.etiqueta)
        .addTo(mapInstance)
    }

    const onVertexLeave = () => {
      mapInstance.getCanvas().style.cursor = ""
      vertexPopup.remove()
    }

    mapInstance.on("click", SEARCH_LAYERS.fill, onResultClick)
    mapInstance.on("mouseenter", SEARCH_LAYERS.vertices, onVertexEnter)
    mapInstance.on("mouseleave", SEARCH_LAYERS.vertices, onVertexLeave)

    return () => {
      mapInstance.off("click", SEARCH_LAYERS.fill, onResultClick)
      mapInstance.off("mouseenter", SEARCH_LAYERS.vertices, onVertexEnter)
      mapInstance.off("mouseleave", SEARCH_LAYERS.vertices, onVertexLeave)
      popup.remove()
      vertexPopup.remove()
    }
  }, [mapInstance])

  useEffect(() => {
    return () => {
      abortControllerRef.current?.abort()
      labelMarkerRef.current?.remove()
      labelMarkerRef.current = null
    }
  }, [])

  return { addVertices, removeVertices, clearSearchResult }
}
