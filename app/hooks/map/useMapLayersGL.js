import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { Marker, Popup } from "maplibre-gl"

import {
  ANM_LAYERS,
  anmFillLayerId,
  anmLineLayerId,
  anmSourceId,
  emptyFeatureCollection,
  fetchLayerFeatures,
  LAYERS_MIN_ZOOM,
} from "../../utils/anmLayers"
import { createLabelElement } from "../../utils/mapLabelsGL"
import { createPopupContent, shouldShowLabels } from "../../utils/mapUtils"
import { findTenureLayerNumbers, tenureLayerUrl } from "../../utils/tenureLayers"
import { debounce } from "@/lib/utils"

// Arrastrar el mapa dispara un `moveend` por gesto, y cada uno es una consulta a
// la ANM por capa encendida. Esperar a que el usuario se quede quieto evita
// encadenar peticiones que van a quedar obsoletas antes de llegar.
const REFRESH_DELAY_MS = 400

/**
 * Capas de la ANM sobre MapLibre.
 *
 * Diferencia de fondo con la versión Leaflet: allá esri-leaflet se encargaba de
 * pedir las features del área visible, cachearlas y quitarlas al salir de
 * pantalla. Aquí eso lo hace este hook a mano, porque MapLibre no trae nada
 * equivalente. A cambio, el control es explícito: se ve exactamente cuándo se
 * consulta el servicio y con qué recuadro.
 *
 * Las capas del estilo no se crean ni se destruyen: ya están declaradas (ver
 * `createBaseStyle`) y aquí solo se les cambia la visibilidad, la opacidad y los
 * datos. Así el orden de apilamiento no depende de en qué orden pulse el usuario
 * los interruptores.
 */
export const useMapLayersGL = (
  mapRef,
  mapInstance,
  layerVisibility,
  layerOpacity,
  setError,
  setShowErrorBanner,
) => {
  const [isBelowMinZoom, setIsBelowMinZoom] = useState(false)
  const [truncatedLayers, setTruncatedLayers] = useState([])

  // Los marcadores de etiqueta vivos, agrupados por capa, para poder quitarlos
  // antes de poner los nuevos.
  const labelMarkersRef = useRef({})
  // Cada refresco invalida al anterior: si el usuario sigue arrastrando, la
  // respuesta de la consulta vieja llega tarde y no debe pisar a la nueva.
  const runIdRef = useRef(0)
  const abortRef = useRef(null)
  // Qué capas tienen datos puestos ahora mismo, para no mandar al worker a
  // vaciar lo que ya está vacío.
  const keysWithDataRef = useRef(new Set())
  // La visibilidad se lee dentro de una función asíncrona; con el valor de la
  // prop, esa función se quedaría viendo el estado del render en que se creó.
  const visibilityRef = useRef(layerVisibility)
  visibilityRef.current = layerVisibility

  const anyLayerEnabled = ANM_LAYERS.some(({ key }) => layerVisibility[key])

  const clearLabels = useCallback((key) => {
    const markers = labelMarkersRef.current[key]
    if (!markers) return
    markers.forEach((marker) => marker.remove())
    labelMarkersRef.current[key] = []
  }, [])

  const drawLabels = useCallback(
    (key, featureCollection) => {
      const map = mapRef.current
      clearLabels(key)
      if (!map || !shouldShowLabels(map.getZoom())) return

      const markers = []
      featureCollection.features.forEach((feature) => {
        const label = createLabelElement(feature)
        if (!label) return
        markers.push(new Marker({ element: label.element }).setLngLat(label.coordinates).addTo(map))
      })
      labelMarkersRef.current[key] = markers
    },
    [clearLabels, mapRef],
  )

  /**
   * Vacía una capa sin destruirla: se queda declarada, pero sin nada que pintar.
   *
   * Solo actúa si la capa tenía algo. Cada `setData` obliga al worker a volver a
   * teselar, y sin esta comprobación las tres capas apagadas se "vaciaban" otra
   * vez en cada movimiento del mapa, dándole trabajo para nada.
   */
  const clearLayerData = useCallback(
    (key) => {
      if (!keysWithDataRef.current.has(key)) return
      mapRef.current?.getSource(anmSourceId(key))?.setData(emptyFeatureCollection())
      keysWithDataRef.current.delete(key)
      clearLabels(key)
    },
    [clearLabels, mapRef],
  )

  const refresh = useCallback(async () => {
    const map = mapRef.current
    if (!map) return

    runIdRef.current += 1
    const runId = runIdRef.current
    const isStale = () => runId !== runIdRef.current

    abortRef.current?.abort()
    const controller = new AbortController()
    abortRef.current = controller

    const visibility = visibilityRef.current
    const activeLayers = ANM_LAYERS.filter(({ key }) => visibility[key])

    // Las capas apagadas se vacían aquí y no en el efecto de visibilidad: sin
    // esto, al apagar el interruptor los polígonos se ocultaban pero seguían
    // cargados, y volvían a aparecer con datos viejos al reencenderla.
    ANM_LAYERS.filter(({ key }) => !visibility[key]).forEach(({ key }) => clearLayerData(key))

    const belowMinZoom = map.getZoom() < LAYERS_MIN_ZOOM
    setIsBelowMinZoom(belowMinZoom)

    if (belowMinZoom || activeLayers.length === 0) {
      // Por debajo del zoom mínimo no se consulta nada. Vaciar además evita que
      // queden dibujados los polígonos del último zoom válido, que a esa escala
      // se ven como manchas sueltas sin contexto.
      activeLayers.forEach(({ key }) => clearLayerData(key))
      setTruncatedLayers([])
      return
    }

    const bounds = map.getBounds()
    const box = {
      west: bounds.getWest(),
      south: bounds.getSouth(),
      east: bounds.getEast(),
      north: bounds.getNorth(),
    }

    try {
      // Solo se descubren los índices si alguna capa activa los necesita. Pedirlos
      // siempre disparaba seis peticiones de metadatos nada más abrir la página,
      // con los cuatro interruptores apagados.
      const needsDiscovery = activeLayers.some(({ tenureName }) => tenureName)
      const layerNumbers = needsDiscovery ? await findTenureLayerNumbers() : {}
      if (isStale()) return

      const truncated = []

      await Promise.all(
        activeLayers.map(async ({ key, label, tenureName, url }) => {
          let layerUrl = url

          if (!layerUrl) {
            const layerNumber = layerNumbers[tenureName]
            if (layerNumber === undefined) {
              throw new Error(`No se encontró la capa "${tenureName}" en el servicio de la ANM`)
            }
            layerUrl = tenureLayerUrl(layerNumber)
          }

          const result = await fetchLayerFeatures(layerUrl, box, { signal: controller.signal })
          if (isStale() || !mapRef.current) return

          mapRef.current.getSource(anmSourceId(key))?.setData(result.featureCollection)
          keysWithDataRef.current.add(key)
          drawLabels(key, result.featureCollection)

          if (result.truncated) truncated.push(label)
        }),
      )

      if (isStale()) return
      setTruncatedLayers(truncated)
    } catch (error) {
      // Abortar es lo normal cuando el usuario sigue moviendo el mapa; no es un
      // fallo que haya que mostrarle.
      if (error?.name === "AbortError" || controller.signal.aborted || isStale()) return
      console.error("Error al actualizar las capas:", error)
      setShowErrorBanner(true)
      setError(`Error al actualizar las capas del mapa: ${error.message}`)
    }
  }, [clearLayerData, drawLabels, mapRef, setError, setShowErrorBanner])

  const debouncedRefresh = useMemo(() => debounce(() => refresh(), REFRESH_DELAY_MS), [refresh])

  // Visibilidad y opacidad: baratas, no tocan la red. Van en su propio efecto
  // para que mover el slider no dispare una consulta al servicio.
  useEffect(() => {
    const map = mapRef.current
    if (!map) return

    ANM_LAYERS.forEach(({ key }) => {
      const visible = layerVisibility[key] ? "visible" : "none"
      if (!map.getLayer(anmFillLayerId(key))) return

      map.setLayoutProperty(anmFillLayerId(key), "visibility", visible)
      map.setLayoutProperty(anmLineLayerId(key), "visibility", visible)
      // Solo el relleno responde al slider. El contorno se queda opaco, como en
      // el visor Leaflet: con opacidad 0 la capa sigue existiendo y se ve dónde
      // está, en vez de desaparecer del todo.
      map.setPaintProperty(anmFillLayerId(key), "fill-opacity", layerOpacity[key])
    })
  }, [mapInstance, layerVisibility, layerOpacity, mapRef])

  // Las etiquetas son marcadores HTML, no capas del estilo, así que la
  // visibilidad de la capa no las apaga: hay que quitarlas a mano.
  useEffect(() => {
    ANM_LAYERS.forEach(({ key }) => {
      if (!layerVisibility[key]) clearLabels(key)
    })
  }, [layerVisibility, clearLabels])

  // Encender o apagar una capa sí obliga a consultar; aquí sin esperar, que el
  // usuario acaba de pedirlo explícitamente.
  useEffect(() => {
    if (!mapInstance) return
    refresh()
  }, [mapInstance, layerVisibility, refresh])

  // Y cada vez que cambia el área visible.
  useEffect(() => {
    if (!mapInstance) return
    mapInstance.on("moveend", debouncedRefresh)
    return () => {
      mapInstance.off("moveend", debouncedRefresh)
    }
  }, [mapInstance, debouncedRefresh])

  // Popups e indicador del cursor sobre los polígonos.
  useEffect(() => {
    if (!mapInstance) return

    // `closeOnClick: false` y un único manejador de clic para todo el mapa, en
    // vez de uno por capa. No es una preferencia de estilo: con el
    // comportamiento por defecto, un popup abierto se cierra solo al siguiente
    // clic en el mapa, y ese cierre ocurría *después* de que nuestro manejador
    // hubiera puesto el contenido nuevo. Resultado: al hacer clic en un segundo
    // polígono la ficha desaparecía en lugar de cambiar, y había que volver a
    // hacer clic. Aquí el cierre lo decidimos nosotros y el orden es
    // determinista.
    const popup = new Popup({ maxWidth: "320px", closeOnClick: false })

    const fillLayerIds = () =>
      ANM_LAYERS.map(({ key }) => anmFillLayerId(key)).filter((id) => mapInstance.getLayer(id))

    const onClick = (event) => {
      // Solo se consultan las capas de la ANM: sin esta lista, el clic también
      // encontraría las teselas del mapa base.
      const hits = mapInstance.queryRenderedFeatures(event.point, { layers: fillLayerIds() })

      if (hits.length === 0) {
        popup.remove()
        return
      }

      // El primero es el de más arriba en el apilamiento, que es el que el
      // usuario ve y por tanto el que cree estar pulsando.
      popup.setLngLat(event.lngLat).setHTML(createPopupContent(hits[0].properties)).addTo(mapInstance)
    }

    mapInstance.on("click", onClick)

    // El cursor sí va por capa: es lo que avisa de que un polígono responde.
    const cursorHandlers = []
    ANM_LAYERS.forEach(({ key }) => {
      const layerId = anmFillLayerId(key)
      if (!mapInstance.getLayer(layerId)) return

      const onEnter = () => {
        mapInstance.getCanvas().style.cursor = "pointer"
      }
      const onLeave = () => {
        mapInstance.getCanvas().style.cursor = ""
      }

      mapInstance.on("mouseenter", layerId, onEnter)
      mapInstance.on("mouseleave", layerId, onLeave)
      cursorHandlers.push([layerId, onEnter, onLeave])
    })

    return () => {
      mapInstance.off("click", onClick)
      cursorHandlers.forEach(([layerId, onEnter, onLeave]) => {
        mapInstance.off("mouseenter", layerId, onEnter)
        mapInstance.off("mouseleave", layerId, onLeave)
      })
      popup.remove()
    }
  }, [mapInstance])

  // Desmontaje: los marcadores viven en el DOM colgados del mapa y no se van
  // solos. La misma trampa que documentaba el visor Leaflet con sus layerGroups.
  useEffect(() => {
    if (!mapInstance) return
    return () => {
      abortRef.current?.abort()
      Object.keys(labelMarkersRef.current).forEach((key) => clearLabels(key))
    }
  }, [mapInstance, clearLabels])

  return {
    // Una capa encendida por debajo del zoom mínimo no dibuja nada: hay que
    // decirlo, en vez de dejar el mapa vacío sin explicación.
    showZoomInHint: anyLayerEnabled && isBelowMinZoom,
    // ArcGIS recorta la respuesta en silencio. Callarlo es peor que avisar: el
    // usuario creería estar viendo todos los títulos del área.
    truncatedLayers,
  }
}
