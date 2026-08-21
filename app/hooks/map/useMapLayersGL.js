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
import { layerByKey } from "../../utils/themeAreas"
import { bboxOfGeometry } from "../../utils/bboxDownload"
import { labelElementFor } from "../../utils/mapLabelsGL"
import { selectVisibleLabels } from "../../utils/labelPlacement"
import { createPopupContent, getFeatureLabel, getLabelCoordinates } from "../../utils/mapUtils"
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
 * @param filters     {scope, byArea} — dónde filtrar, y el filtro de cada área.
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
  popupsEnabled = true,
) => {
  const [isBelowMinZoom, setIsBelowMinZoom] = useState(false)
  const [truncatedLayers, setTruncatedLayers] = useState([])
  // Todo lo que hay cargado ahora mismo: de qué capa viene cada figura, sus
  // atributos y su recuadro.
  //
  // Con eso se hacen las tres cosas que necesita el panel: llenar los
  // desplegables del filtro con los valores que de verdad están en pantalla,
  // contar cuántas figuras pasan el filtro, y llevar el mapa hasta una fila de
  // la tabla. Antes había además una lista de solo atributos; era la misma
  // información dos veces, y dos veces es una de más.
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
  // Las figuras por capa, para reunirlas sin recorrer las fuentes del mapa.
  const featuresRef = useRef({})
  // Punto, recuadro y texto de cada figura: lo que necesita `labelPlacement`
  // para decidir qué etiquetas caben. Se guarda para poder recolocarlas al
  // cambiar el zoom sin volver a consultar al servicio.
  const labelCandidatesRef = useRef({})
  // El filtro se lee dentro de la función asíncrona que consulta.
  const filtersRef = useRef(filters)
  filtersRef.current = filters
  // La visibilidad se lee dentro de una función asíncrona; con el valor de la
  // prop, esa función se quedaría viendo el estado del render en que se creó.
  const stateRef = useRef(layerState)
  stateRef.current = layerState
  // Se lee dentro del manejador de clic, que se registra una sola vez.
  const popupsEnabledRef = useRef(popupsEnabled)
  popupsEnabledRef.current = popupsEnabled

  /**
   * El filtro que le toca a una capa: el de su área.
   *
   * Estaba escrito a mano como «el de Minería», y funcionaba solo porque las
   * cuatro capas conectadas son de Minería. El día que entrara la primera capa
   * del SGC o del IGAC, filtrar Geología habría filtrado Minería sin dar ningún
   * error: la peor clase de fallo, invisible hasta que aparece disfrazado de
   * otra cosa.
   */
  const filtroDeCapa = useCallback((key) => {
    const areaId = layerByKey(key)?.areaId
    return filtersRef.current?.byArea?.[areaId] ?? { selections: {}, areaRange: null }
  }, [])

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
    filters?.scope === "layer"
      ? ANM_LAYERS.map(({ key }) => {
          const { selections, areaRange } = filters?.byArea?.[layerByKey(key)?.areaId] ?? {}
          return `${key}:${buildWhereClause(selections, areaRange) ?? ""}`
        }).join(";")
      : ""
  }`

  /**
   * ¿Hay alguna capa encendida que se esté consultando entera, sin recuadro?
   *
   * Es lo que decide si mover el mapa tiene que volver a consultar. Se calcula
   * en el render y no dentro de `refresh` porque quien la necesita es el efecto
   * que engancha el oyente de `moveend`.
   */
  const barreCapaEntera =
    filters?.scope === "layer" &&
    ANM_LAYERS.some(({ key }) => {
      if (!isOn(key)) return false
      const { selections, areaRange } = filters?.byArea?.[layerByKey(key)?.areaId] ?? {}
      return Boolean(buildWhereClause(selections, areaRange))
    })

  const clearLabels = useCallback((key) => {
    const markers = labelMarkersRef.current[key]
    if (!markers) return
    markers.forEach((marker) => marker.remove())
    labelMarkersRef.current[key] = []
  }, [])

  /**
   * Lo que hace falta para decidir si una figura lleva etiqueta: dónde iría y
   * qué tan grande se ve. Se calcula una sola vez, al llegar los datos, porque
   * encontrar un punto interior de un polígono con huecos es lo caro de todo
   * esto y no cambia al mover el mapa.
   */
  const labelCandidatesFor = useCallback(
    (key, featureCollection) =>
      featureCollection.features
        .map((feature) => {
          const anchor = getLabelCoordinates(feature)
          if (!anchor) return null
          const bbox = bboxOfGeometry(feature.geometry)
          if (!bbox) return null
          return { key, anchor, bbox, text: getFeatureLabel(feature.properties) }
        })
        .filter(Boolean),
    [],
  )

  /**
   * Redibuja las etiquetas de todas las capas encendidas, de una vez.
   *
   * De una vez y no capa por capa a propósito: dos títulos de capas distintas
   * pueden solaparse igual que dos de la misma, y quien decide quién sobrevive
   * necesita verlos todos juntos. Antes cada capa colocaba las suyas sin saber
   * de las demás.
   */
  const redrawLabels = useCallback(() => {
    const map = mapRef.current
    if (!map) return

    Object.keys(labelMarkersRef.current).forEach((key) => clearLabels(key))
    if (map.getZoom() < LAYERS_MIN_ZOOM) return

    const candidatos = Object.entries(labelCandidatesRef.current)
      .filter(([key]) => Boolean(stateRef.current[key]?.on))
      .flatMap(([, lista]) => lista)

    const lienzo = map.getCanvas()
    const elegidas = selectVisibleLabels(candidatos, {
      project: (lngLat) => map.project(lngLat),
      width: lienzo.clientWidth,
      height: lienzo.clientHeight,
    })

    elegidas.forEach((candidato) => {
      const marker = new Marker({ element: labelElementFor(candidato.text) })
        .setLngLat(candidato.anchor)
        .addTo(map)
      ;(labelMarkersRef.current[candidato.key] ??= []).push(marker)
    })
  }, [clearLabels, labelCandidatesRef, mapRef, stateRef])

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
      delete labelCandidatesRef.current[key]
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
      delete featuresRef.current[key]
    })

    const scope = filtersRef.current?.scope ?? "viewport"
    // El `where` de cada capa sale del filtro de su área, no de uno común.
    // Solo tiene sentido barrer la capa entera si hay algo que buscar en ella:
    // sin filtro, "toda la capa" serían decenas de miles de polígonos que el
    // servicio recortaría de todos modos.
    const whereDe = (key) => {
      if (scope !== "layer") return null
      const { selections, areaRange } = filtroDeCapa(key)
      return buildWhereClause(selections, areaRange)
    }
    // ¿Alguna capa encendida se va a consultar completa? Eso decide si el zoom
    // mínimo aplica: barrer el país no depende de lo que se esté mirando.
    const barrerAlguna = activeLayers.some(({ key }) => Boolean(whereDe(key)))

    const belowMinZoom = !barrerAlguna && map.getZoom() < LAYERS_MIN_ZOOM
    setIsBelowMinZoom(belowMinZoom)

    if (belowMinZoom || activeLayers.length === 0) {
      // Por debajo del zoom mínimo no se consulta nada. Vaciar además evita que
      // queden dibujados los polígonos del último zoom válido, que a esa escala
      // se ven como manchas sueltas sin contexto.
      activeLayers.forEach(({ key }) => clearLayerData(key))
      setTruncatedLayers([])
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

          const where = whereDe(key)
          const result = await fetchLayerFeatures(
            layerUrl,
            where ? null : box,
            { signal: controller.signal },
            where,
          )
          if (isStale() || !mapRef.current) return

          mapRef.current.getSource(anmSourceId(key))?.setData(result.featureCollection)
          keysWithDataRef.current.add(key)
          labelCandidatesRef.current[key] = labelCandidatesFor(key, result.featureCollection)
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
      // Las etiquetas se colocan cuando ya llegaron todas las capas: quién tapa
      // a quién solo se puede decidir viéndolas juntas.
      redrawLabels()
      setTruncatedLayers(truncated)
      setLoadedFeatures(activeLayers.flatMap(({ key }) => featuresRef.current[key] ?? []))
    } catch (error) {
      // Abortar es lo normal cuando el usuario sigue moviendo el mapa; no es un
      // fallo que haya que mostrarle.
      if (error?.name === "AbortError" || controller.signal.aborted || isStale()) return
      console.error("Error al actualizar las capas:", error)
      setShowErrorBanner(true)
      setError(`Error al actualizar las capas del mapa: ${error.message}`)
    }
  }, [clearLayerData, filtroDeCapa, labelCandidatesFor, mapRef, redrawLabels, setError, setShowErrorBanner])

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

    ANM_LAYERS.forEach(({ key }) => {
      if (!map.getLayer(anmFillLayerId(key))) return

      // Cuando el filtro se le pidió al servicio, lo que llegó ya cumple: volver
      // a esconder por encima no cambiaría nada y solo daría trabajo al motor.
      const { selections, areaRange } = filters?.byArea?.[layerByKey(key)?.areaId] ?? {}
      const expresion =
        filters?.scope === "layer" ? null : buildMapFilter(selections, areaRange)

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

  // Y cada vez que cambia el área visible... salvo cuando no hace falta.
  //
  // Con el filtro en "toda la capa" la consulta ignora el recuadro a propósito:
  // mover el mapa no cambia el resultado. Aun así se relanzaba en cada arrastre,
  // y con cuatro capas encendidas eso son cuatro consultas nacionales por gesto,
  // para volver a recibir exactamente lo mismo. Además de la espera, es la clase
  // de tráfico por la que un servicio empieza a cortar peticiones.
  useEffect(() => {
    if (!mapInstance || barreCapaEntera) return
    mapInstance.on("moveend", debouncedRefresh)
    return () => {
      mapInstance.off("moveend", debouncedRefresh)
      // Y se anula la que estuviera esperando: si no, el temporizador ya en
      // marcha dispara una consulta más justo después de desengancharse.
      debouncedRefresh.cancel()
    }
  }, [mapInstance, debouncedRefresh, barreCapaEntera])

  /**
   * Las etiquetas se apartan mientras la cámara se mueve sobre terreno 3D.
   *
   * Cada etiqueta es un nodo del documento que MapLibre recoloca en cada
   * fotograma, y **con el terreno puesto cada recolocación consulta además la
   * altura de ese punto**. Con ciento cincuenta etiquetas eso son ciento
   * cincuenta consultas de altura por fotograma, y es la razón principal de que
   * girar en 3D se sienta pesado. En 2D no pasa: mover un nodo es barato, y ver
   * las etiquetas viajar con el mapa es la respuesta que uno espera.
   *
   * Volver a ponerlas va aplazado a propósito. El giro en bucle dispara un
   * `moveend` por fotograma, así que restaurarlas en cada uno sería peor que no
   * apartarlas: con el aplazamiento, se quedan fuera mientras gira y vuelven
   * cuando de verdad se para.
   */
  const etiquetasApartadasRef = useRef(false)

  const restaurarEtiquetas = useMemo(
    () =>
      debounce(() => {
        if (!etiquetasApartadasRef.current) return
        etiquetasApartadasRef.current = false
        redrawLabels()
      }, 220),
    [redrawLabels],
  )

  useEffect(() => {
    if (!mapInstance) return

    const alMoverse = () => {
      // Solo con terreno: es el único caso en que recolocar cuesta caro.
      if (!mapInstance.getTerrain() || etiquetasApartadasRef.current) return
      etiquetasApartadasRef.current = true
      Object.keys(labelMarkersRef.current).forEach((key) => clearLabels(key))
    }

    mapInstance.on("movestart", alMoverse)
    mapInstance.on("move", alMoverse)
    mapInstance.on("moveend", restaurarEtiquetas)

    return () => {
      mapInstance.off("movestart", alMoverse)
      mapInstance.off("move", alMoverse)
      mapInstance.off("moveend", restaurarEtiquetas)
      restaurarEtiquetas.cancel()
    }
  }, [mapInstance, clearLabels, restaurarEtiquetas])

  // Recolocar las etiquetas al terminar un zoom, sin esperar a la consulta.
  //
  // Qué etiquetas caben depende del zoom, y volver a pedirle los datos a la ANM
  // para averiguarlo sería absurdo: los polígonos son los mismos, solo se ven de
  // otro tamaño. Sin esto, al alejarse quedaban en pantalla, durante el segundo
  // que tarda la consulta, etiquetas más grandes que su propio polígono.
  useEffect(() => {
    if (!mapInstance) return
    mapInstance.on("zoomend", redrawLabels)
    return () => {
      mapInstance.off("zoomend", redrawLabels)
    }
  }, [mapInstance, redrawLabels])

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
      // Con la consulta de terreno encendida, el clic es para preguntar por la
      // ladera; abrir además la ficha del polígono taparía la respuesta.
      if (!popupsEnabledRef.current) return

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
    // Se copia el objeto de marcadores a una variable local: el ref puede
    // apuntar a otro sitio para cuando corra esta limpieza, y entonces se
    // quitarían los marcadores equivocados —o ninguno—.
    const marcadores = labelMarkersRef.current
    const aborter = abortRef
    return () => {
      aborter.current?.abort()
      Object.values(marcadores).forEach((lista) => lista?.forEach((m) => m.remove()))
    }
  }, [mapInstance])

  return {
    // Una capa encendida por debajo del zoom mínimo no dibuja nada: hay que
    // decirlo, en vez de dejar el mapa vacío sin explicación.
    showZoomInHint: anyLayerEnabled && isBelowMinZoom,
    // ArcGIS recorta la respuesta en silencio. Callarlo es peor que avisar: el
    // usuario creería estar viendo todos los títulos del área.
    truncatedLayers,
    // Los atributos de lo cargado: con esto el panel arma las opciones del
    // filtro a partir de lo que hay, no de una lista inventada.
    loadedFeatures,
  }
}
