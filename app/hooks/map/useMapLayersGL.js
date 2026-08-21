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
import { SEARCH_LAYERS } from "../../utils/mapStyles"
import { buildMapFilter, buildWhereClause } from "../../utils/layerFilters"
import { bboxOfGeometry } from "../../utils/bboxDownload"
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
 * `createBaseStyle`) y aquí solo se les cambia la visibilidad, la opacidad, el
 * color, el orden y los datos.
 *
 * @param layerState  {clave: {on, opacity, fillColor, lineColor}} — lo que el
 *   panel sabe de cada capa. Va en un solo objeto y no en cuatro paralelos
 *   porque los cuatro cambian juntos y separarlos solo daba ocasión de que se
 *   descuadraran.
 * @param layerOrder  claves de arriba abajo: la primera se pinta encima de todo.
 * @param filters     {selections, areaRange, scope} — qué filtrar y dónde.
 *   `scope: "viewport"` esconde lo ya cargado, y es instantáneo.
 *   `scope: "layer"` se lo pide al servicio sin recuadro, porque lo que cumple
 *   el filtro puede estar lejísimos de donde se está mirando.
 */
export const useMapLayersGL = (
  mapRef,
  mapInstance,
  layerState,
  layerOrder,
  filters,
  setError,
  setShowErrorBanner,
) => {
  const [isBelowMinZoom, setIsBelowMinZoom] = useState(false)
  const [truncatedLayers, setTruncatedLayers] = useState([])
  // Los atributos de todo lo que hay cargado ahora mismo. Es lo que llena los
  // desplegables del filtro: sus opciones se leen de los datos, no de una lista
  // escrita a mano que se quedaría desfasada en cuanto la ANM cambie una
  // palabra.
  const [loadedProperties, setLoadedProperties] = useState([])
  // Lo mismo, pero con el recuadro de cada figura: es lo que necesita la tabla
  // de resultados para poder llevar el mapa hasta un registro.
  const [loadedFeatures, setLoadedFeatures] = useState([])

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
  // Los atributos por capa, para reunirlos sin recorrer las fuentes del mapa.
  const propertiesRef = useRef({})
  const featuresRef = useRef({})
  // El filtro se lee dentro de la función asíncrona que consulta.
  const filtersRef = useRef(filters)
  filtersRef.current = filters
  // La visibilidad se lee dentro de una función asíncrona; con el valor de la
  // prop, esa función se quedaría viendo el estado del render en que se creó.
  const stateRef = useRef(layerState)
  stateRef.current = layerState

  const isOn = (key) => Boolean(layerState[key]?.on)
  const anyLayerEnabled = ANM_LAYERS.some(({ key }) => isOn(key))

  /**
   * Huella de qué capas están encendidas, como "1010".
   *
   * Es lo que dispara la consulta al servicio, en vez del objeto de estado
   * entero: ese objeto cambia también al mover la opacidad o al elegir un color,
   * y sin esta huella cada roce del deslizador lanzaba una consulta a la ANM.
   */
  const visibilitySignature = ANM_LAYERS.map(({ key }) => (isOn(key) ? "1" : "0")).join("")

  /**
   * Huella del filtro que sí obliga a volver a consultar.
   *
   * Filtrar "en pantalla" no toca la red —se esconde lo ya cargado—, pero
   * cambiar a "toda la capa", o cambiar el filtro estando en ese modo, sí: hay
   * que preguntarle otra vez al servicio. Sin esta huella, pasar de un modo a
   * otro no hacía nada hasta que el usuario moviera el mapa.
   */
  const queryFilterSignature = `${filters?.scope ?? "viewport"}|${
    filters?.scope === "layer" ? buildWhereClause(filters?.selections, filters?.areaRange) ?? "" : ""
  }`

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

    const estado = stateRef.current
    const encendida = (key) => Boolean(estado[key]?.on)
    const activeLayers = ANM_LAYERS.filter(({ key }) => encendida(key))

    // Las capas apagadas se vacían aquí y no en el efecto de visibilidad: sin
    // esto, al apagar el interruptor los polígonos se ocultaban pero seguían
    // cargados, y volvían a aparecer con datos viejos al reencenderla.
    ANM_LAYERS.filter(({ key }) => !encendida(key)).forEach(({ key }) => {
      clearLayerData(key)
      delete propertiesRef.current[key]
      delete featuresRef.current[key]
    })

    const filtro = filtersRef.current ?? {}
    const where = buildWhereClause(filtro.selections, filtro.areaRange)
    // Solo tiene sentido barrer la capa entera si hay algo que buscar en ella.
    // Sin filtro, "toda la capa" serían decenas de miles de polígonos que el
    // servicio recortaría de todos modos.
    const barrerCapa = filtro.scope === "layer" && Boolean(where)

    const belowMinZoom = !barrerCapa && map.getZoom() < LAYERS_MIN_ZOOM
    setIsBelowMinZoom(belowMinZoom)

    if (belowMinZoom || activeLayers.length === 0) {
      // Por debajo del zoom mínimo no se consulta nada. Vaciar además evita que
      // queden dibujados los polígonos del último zoom válido, que a esa escala
      // se ven como manchas sueltas sin contexto.
      activeLayers.forEach(({ key }) => clearLayerData(key))
      setTruncatedLayers([])
      setLoadedProperties([])
      setLoadedFeatures([])
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

          const result = await fetchLayerFeatures(
            layerUrl,
            barrerCapa ? null : box,
            { signal: controller.signal },
            barrerCapa ? where : null,
          )
          if (isStale() || !mapRef.current) return

          mapRef.current.getSource(anmSourceId(key))?.setData(result.featureCollection)
          keysWithDataRef.current.add(key)
          drawLabels(key, result.featureCollection)
          propertiesRef.current[key] = result.featureCollection.features.map((f) => f.properties ?? {})
          // El recuadro se calcula una vez, al llegar los datos, y no cada vez
          // que se abre la tabla: recorrer los vértices de dos mil polígonos en
          // el momento de pulsar un botón se nota.
          featuresRef.current[key] = result.featureCollection.features.map((f) => ({
            layerKey: key,
            properties: f.properties ?? {},
            bbox: bboxOfGeometry(f.geometry),
          }))

          if (result.truncated) truncated.push(label)
        }),
      )

      if (isStale()) return
      setTruncatedLayers(truncated)
      setLoadedProperties(activeLayers.flatMap(({ key }) => propertiesRef.current[key] ?? []))
      setLoadedFeatures(activeLayers.flatMap(({ key }) => featuresRef.current[key] ?? []))
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

  // Visibilidad, opacidad y color: baratas, no tocan la red. Van en su propio
  // efecto para que mover el slider o elegir un color no dispare una consulta.
  useEffect(() => {
    const map = mapRef.current
    if (!map) return

    ANM_LAYERS.forEach(({ key, fillColor, lineColor }) => {
      const estado = layerState[key]
      if (!estado || !map.getLayer(anmFillLayerId(key))) return

      const visible = estado.on ? "visible" : "none"
      map.setLayoutProperty(anmFillLayerId(key), "visibility", visible)
      map.setLayoutProperty(anmLineLayerId(key), "visibility", visible)
      // Solo el relleno responde al slider. El contorno se queda opaco, como en
      // el visor Leaflet: con opacidad 0 la capa sigue existiendo y se ve dónde
      // está, en vez de desaparecer del todo.
      map.setPaintProperty(anmFillLayerId(key), "fill-opacity", estado.opacity)
      map.setPaintProperty(anmFillLayerId(key), "fill-color", estado.fillColor ?? fillColor)
      map.setPaintProperty(anmLineLayerId(key), "line-color", estado.lineColor ?? lineColor)
    })
  }, [mapInstance, layerState, mapRef])

  /**
   * Orden de pintado, según el orden de la lista del panel.
   *
   * `moveLayer(id, antesDe)` coloca la capa *debajo* de `antesDe`. Recorriendo
   * la lista de abajo arriba y empujando cada capa justo antes del resultado de
   * la búsqueda, cada nueva llamada deja su capa por encima de la anterior: al
   * terminar, la primera de la lista quedó arriba del todo, que es lo que el
   * usuario acaba de decir arrastrándola.
   *
   * El resultado de la búsqueda se queda siempre por encima: es lo que el
   * usuario pidió expresamente y no debería tapárselo una capa de fondo.
   */
  useEffect(() => {
    const map = mapRef.current
    if (!map || !map.getLayer(SEARCH_LAYERS.fill)) return

    ;[...layerOrder].reverse().forEach((key) => {
      const fill = anmFillLayerId(key)
      const line = anmLineLayerId(key)
      if (!map.getLayer(fill)) return
      // El contorno se mueve después que el relleno para quedar sobre él; al
      // revés, el relleno translúcido de la propia capa apagaría su borde.
      map.moveLayer(fill, SEARCH_LAYERS.fill)
      map.moveLayer(line, SEARCH_LAYERS.fill)
    })
  }, [mapInstance, layerOrder, mapRef])

  /**
   * Los filtros esconden lo que no cumple, sin volver a consultar nada.
   *
   * `setFilter(id, null)` es lo que quita un filtro puesto antes; pasarle
   * `undefined` no lo quita, lo deja como estaba, y las figuras escondidas
   * seguirían escondidas sin que nada en el panel lo explicara.
   */
  useEffect(() => {
    const map = mapRef.current
    if (!map) return

    // Cuando el filtro se le pidió al servicio, lo que llegó ya cumple: volver a
    // esconder por encima no cambiaría nada y solo daría trabajo al motor.
    const expresion =
      filters?.scope === "layer" ? null : buildMapFilter(filters?.selections, filters?.areaRange)

    ANM_LAYERS.forEach(({ key }) => {
      if (!map.getLayer(anmFillLayerId(key))) return
      map.setFilter(anmFillLayerId(key), expresion)
      map.setFilter(anmLineLayerId(key), expresion)
    })
  }, [mapInstance, filters, mapRef])

  // Las etiquetas son marcadores HTML, no capas del estilo, así que la
  // visibilidad de la capa no las apaga: hay que quitarlas a mano.
  useEffect(() => {
    ANM_LAYERS.forEach(({ key }) => {
      if (!layerState[key]?.on) clearLabels(key)
    })
  }, [layerState, clearLabels])

  // Encender o apagar una capa sí obliga a consultar; aquí sin esperar, que el
  // usuario acaba de pedirlo explícitamente. Depende de la huella y no del
  // estado entero: ver `visibilitySignature`.
  useEffect(() => {
    if (!mapInstance) return
    refresh()
  }, [mapInstance, visibilitySignature, queryFilterSignature, refresh])

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
    // Los atributos de lo cargado: con esto el panel arma las opciones del
    // filtro a partir de lo que hay, no de una lista inventada.
    loadedProperties,
    loadedFeatures,
  }
}
