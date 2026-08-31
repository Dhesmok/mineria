import { useCallback, useEffect, useRef, useState } from "react"
import { Marker } from "maplibre-gl"
import MapboxDraw from "@mapbox/mapbox-gl-draw"

import { createDrawStyles, DEFAULT_DRAWING_COLOR } from "../../utils/drawStyles"
import { areaInHectares, areaInSquareMeters, lengthInMeters } from "../../utils/measure"
import { formatArea, formatDistance, getLabelCoordinates } from "../../utils/mapUtils"
import { formatCoordinate, fromGeographic, SOURCE_CRS } from "../../utils/crs"

/**
 * Dibujo y medición sobre MapLibre.
 *
 * **Se fusionaron dos cosas que en el visor Leaflet iban por separado.** Allá
 * había una barra para dibujar y, aparte, dos botones de "medir distancia" y
 * "medir área" que en realidad también dibujaban, solo que mostrando el
 * resultado. Eran dos juegos de herramientas que hacían lo mismo. Aquí toda
 * figura que se dibuja muestra su medida: un polígono, su área; una línea, su
 * longitud; un punto, sus coordenadas. Nunca se muestra menos información que
 * antes, y hay una barra en vez de dos.
 *
 * La medida se recalcula al mover un vértice, cosa que el visor anterior no
 * hacía: allá el globo con el área se quedaba con el valor del momento en que se
 * cerró la figura, aunque después se editara.
 */

/** Etiqueta con la medida, anclada a la figura. */
const measurementElement = (text) => {
  const element = document.createElement("div")
  element.className = "map-label draw-measure"

  const inner = document.createElement("div")
  // textContent y no innerHTML: aquí no hay datos de terceros, pero la regla se
  // mantiene en todo el proyecto para no tener que pensarlo cada vez.
  inner.textContent = text
  element.appendChild(inner)

  return element
}

/**
 * Cómo se cuelga la etiqueta de su figura.
 *
 * En un polígono va centrada en el interior, que es donde no estorba. En un
 * punto **no puede ir centrada**: el recuadro oscuro de la etiqueta es mucho más
 * grande que el círculo del punto y lo tapaba entero, así que el visor decía las
 * coordenadas del sitio pero no señalaba el sitio. Anclándola por abajo y
 * subiéndola unos píxeles, la etiqueta flota encima y el punto se ve.
 */
const LABEL_ANCHORS = {
  Point: { anchor: "bottom", offset: [0, -14] },
  LineString: { anchor: "bottom", offset: [0, -8] },
  Polygon: { anchor: "center", offset: [0, 0] },
}

/**
 * ¿La figura tiene geometría de verdad, o es la que la librería deja apartada
 * mientras se dibuja? Un punto sin coordenadas llega como `coordinates: []`, y
 * un polígono a medio cerrar, como un anillo con menos de cuatro posiciones.
 */
const hasCoordinates = (geometry) => {
  if (!geometry) return false
  if (geometry.type === "Point") return geometry.coordinates?.length === 2
  if (geometry.type === "LineString") return (geometry.coordinates?.length ?? 0) >= 2
  if (geometry.type === "Polygon") return (geometry.coordinates?.[0]?.length ?? 0) >= 4
  return true
}

/** Lo dibujado, en números: es lo que resume la barra de dibujo. */
const EMPTY_SUMMARY = { polygons: 0, areaM2: 0, lines: 0, lengthM: 0, points: 0 }

/** Qué dice la etiqueta y dónde se ancla, según el tipo de figura. */
const measurementOf = (feature, crsId) => {
  const geometry = feature?.geometry

  if (geometry?.type === "Polygon") {
    const metros = areaInSquareMeters(geometry)
    if (metros <= 0) return null
    // Metros/hectáreas/km² según el tamaño, y siempre las hectáreas al lado: es
    // la unidad en que se habla de títulos mineros, aunque para un cuadro
    // pequeño resulte un número incómodo.
    const text = `${formatArea(metros)}  (${areaInHectares(geometry).toFixed(4)} ha)`
    const point = getLabelCoordinates(feature)
    return point ? { text, point } : null
  }

  if (geometry?.type === "LineString") {
    const metros = lengthInMeters(geometry)
    if (metros <= 0) return null
    const coordinates = geometry.coordinates
    return { text: formatDistance(metros), point: coordinates[coordinates.length - 1] }
  }

  if (geometry?.type === "Point") {
    // El evento draw.render se dispara también mientras se coloca el punto, con
    // el punto siguiendo al cursor antes del clic. En ese instante las
    // coordenadas pueden no estar completas todavía, y darle undefined al
    // formateador reventaba con "Cannot read properties of undefined". Es un fallo por
    // tiempos: aparecía o no según cuándo cayera el render.
    const [lon, lat] = geometry.coordinates ?? []
    if (typeof lon !== "number" || typeof lat !== "number") return null

    // En el sistema elegido en el panel, no siempre en grados: marcar un punto
    // para leer su coordenada y que salga en un sistema distinto del que se está
    // usando obliga a convertirla a mano, que es justo lo que se quería evitar.
    const [x, y] = fromGeographic([lon, lat], crsId)
    return {
      text: `${formatCoordinate(y, crsId)}, ${formatCoordinate(x, crsId)}`,
      point: geometry.coordinates,
    }
  }

  return null
}

export const useDrawControlGL = (mapRef, mapInstance, crsId = SOURCE_CRS) => {
  const [drawingColor, setDrawingColor] = useState(DEFAULT_DRAWING_COLOR)
  const [mode, setMode] = useState("simple_select")
  // Ids de lo que está seleccionado. La paleta de colores se muestra con esto y
  // con el modo: fuera de dibujar y sin nada señalado, un selector de color no
  // tiene sobre qué actuar y solo ocupa sitio.
  const [selectedIds, setSelectedIds] = useState([])
  // ¿Hay al menos un polígono dibujado? Lo usa el botón de descarga por área,
  // que no tiene sentido sin un área. Se actualiza al crear y borrar, no en cada
  // cuadro de render.
  const [hasArea, setHasArea] = useState(false)
  const [summary, setSummary] = useState(EMPTY_SUMMARY)

  const drawRef = useRef(null)
  // Una etiqueta por figura, indexada por su id, para poder actualizarlas y
  // quitarlas sin recrearlas todas.
  const labelsRef = useRef(new Map())
  // El color se lee dentro de manejadores de eventos creados una sola vez; con
  // el valor del estado se quedarían viendo el del primer render.
  const colorRef = useRef(drawingColor)
  colorRef.current = drawingColor
  // El sistema de coordenadas se lee dentro de manejadores creados una sola vez.
  const crsRef = useRef(crsId)
  crsRef.current = crsId

  /**
   * Elegir color hace dos cosas: fija el color de lo que se dibuje a partir de
   * ahora y, si hay algo seleccionado, se lo aplica. Antes solo hacía lo
   * primero, así que para cambiarle el color a una figura ya dibujada había que
   * borrarla y volver a dibujarla.
   */
  const handleColorChange = useCallback((color) => {
    setDrawingColor(color)

    const draw = drawRef.current
    if (!draw) return

    draw.getSelectedIds().forEach((id) => draw.setFeatureProperty(id, "color", color))
  }, [])

  /** Pone las etiquetas al día con lo que hay dibujado ahora mismo. */
  const syncMeasurements = useCallback(() => {
    const map = mapRef.current
    const draw = drawRef.current
    if (!map || !draw) return

    const features = draw.getAll().features
    const alive = new Set()

    features.forEach((feature) => {
      const measurement = measurementOf(feature, crsRef.current)
      if (!measurement) return

      alive.add(feature.id)
      const existing = labelsRef.current.get(feature.id)

      if (existing) {
        // Reutilizar el marcador en vez de recrearlo: al arrastrar un vértice
        // esto se ejecuta en cada cuadro, y crear y destruir nodos del DOM a esa
        // velocidad se nota.
        existing.getElement().firstChild.textContent = measurement.text
        existing.setLngLat(measurement.point)
        return
      }

      const { anchor, offset } = LABEL_ANCHORS[feature.geometry.type] ?? LABEL_ANCHORS.Polygon
      labelsRef.current.set(
        feature.id,
        new Marker({ element: measurementElement(measurement.text), anchor, offset })
          .setLngLat(measurement.point)
          .addTo(map),
      )
    })

    // Las figuras borradas se llevan su etiqueta.
    labelsRef.current.forEach((marker, id) => {
      if (alive.has(id)) return
      marker.remove()
      labelsRef.current.delete(id)
    })
  }, [mapRef])

  const clearMeasurements = useCallback(() => {
    labelsRef.current.forEach((marker) => marker.remove())
    labelsRef.current.clear()
  }, [])

  /** Recalcula si hay algún polígono dibujado. */
  /**
   * El recuento y los totales de lo dibujado.
   *
   * La medida de cada figura sale sobre ella, en el mapa, y eso está bien para
   * una; con tres polígonos y dos líneas no hay forma de saber cuánto suma todo
   * sin ir leyéndolas una a una. Esto es lo que enseña la barra de dibujo.
   *
   * Se calcula en los eventos de crear, cambiar y borrar, **no en `draw.render`**:
   * ese último se dispara en cada cuadro mientras se arrastra un vértice, y
   * publicar estado a esa velocidad repintaría el visor entero sesenta veces por
   * segundo. Mientras se arrastra, el número de la figura sí se actualiza en
   * vivo —esa etiqueta no pasa por React—; el total se pone al día al soltar.
   */
  const refreshHasArea = useCallback(() => {
    const draw = drawRef.current
    if (!draw) {
      setHasArea(false)
      setSummary(EMPTY_SUMMARY)
      return
    }

    const features = draw.getAll().features.filter((f) => hasCoordinates(f?.geometry))
    const resumen = { ...EMPTY_SUMMARY }

    features.forEach(({ geometry }) => {
      if (geometry.type === "Polygon") {
        resumen.polygons += 1
        resumen.areaM2 += areaInSquareMeters(geometry)
      } else if (geometry.type === "LineString") {
        resumen.lines += 1
        resumen.lengthM += lengthInMeters(geometry)
      } else if (geometry.type === "Point") {
        resumen.points += 1
      }
    })

    setHasArea(resumen.polygons > 0)
    setSummary(resumen)
  }, [])

  useEffect(() => {
    if (!mapInstance) return

    const draw = new MapboxDraw({
      // Sin la barra de botones propia de mapbox-gl-draw: su CSS está escrito
      // para las clases de Mapbox (`mapboxgl-ctrl-group`), que en MapLibre se
      // llaman distinto, así que saldría sin estilo. Los botones los pone el
      // componente con los mismos que usa el resto de la aplicación.
      displayControlsDefault: false,
      styles: createDrawStyles(),
      // Sin esto el color no se ve, aunque quede bien guardado. mapbox-gl-draw
      // mantiene dos copias de cada figura: la del usuario y otra interna que
      // es la que realmente se pinta. Las propiedades propias solo se copian a
      // esa segunda si se activa `userProperties`; si no, el estilo busca
      // `user_color` y no encuentra nada, así que todo sale del color por
      // defecto. Es un fallo que no se nota mirando los datos —ahí el color
      // está—, solo mirando la pantalla.
      userProperties: true,
      /**
       * Los atajos de teclado de la librería, apagados.
       *
       * El comentario decía «suprimir la tecla Supr» y el valor era `true`, que
       * es justo lo que la deja activa: la tecla borraba la figura seleccionada
       * sin preguntar y sin dejar rastro, y quien leyera el código creería lo
       * contrario. Se resuelve por donde decía el comentario, que además es lo
       * correcto: borrar es de la papelera, que está a la vista y tiene el
       * comportamiento documentado —sin selección, borra todo—.
       *
       * Escape sigue saliendo del modo de dibujo: lo maneja `handleKeyDown` más
       * abajo, no la librería, así que no se pierde nada al apagar esto.
       */
      keybindings: false,
    })

    mapInstance.addControl(draw)
    drawRef.current = draw

    // Solo en desarrollo, igual que `window.__mapa`: deja el control a mano en
    // la consola para poder preguntarle qué hay dibujado (`__mapa.__draw.getAll()`)
    // sin instrumentar el código. `next build` elimina esta rama entera.
    if (process.env.NODE_ENV === "development") {
      mapInstance.__draw = draw
    }

    const handleCreate = (event) => {
      const nuevos = event.features.map((feature) => feature.id)
      // Marcar puntos suele hacerse de a varios —los vértices de un lindero, una
      // fila de bocaminas—, así que la herramienta de punto se queda encendida y
      // el siguiente clic marca el siguiente. Los polígonos y las líneas no: ahí
      // lo normal es dibujar una figura y pasar a mirarla. Para salir del modo
      // punto se vuelve a pulsar su botón, o Escape.
      const seguirEnElMismoModo = event.features.every(
        (feature) => feature?.geometry?.type === "Point",
      )
      syncMeasurements()

      // Todo lo que sigue va aplazado un turno, y el setTimeout no es
      // cosmético. Tocar el estado de mapbox-gl-draw dentro del propio
      // manejador de draw.create lo deja a medio camino: seguía creyendo estar
      // dibujando la figura anterior, así que cada figura nueva reemplazaba a
      // la de antes en vez de sumarse, y los botones de línea y punto acababan
      // dibujando polígonos. Aplazarlo deja que la librería termine de procesar
      // la creación.
      setTimeout(() => {
        const control = drawRef.current
        if (!control) return

        // El color se guarda como dato de cada figura, no en el estilo global:
        // así las ya dibujadas conservan el suyo cuando el usuario cambia de
        // color.
        nuevos.forEach((id) => {
          const feature = control.get(id)
          if (!feature) return
          control.setFeatureProperty(id, "color", colorRef.current)
        })

        // Volver a "seleccionar": sin esto el siguiente clic empieza otra
        // figura, que es lo contrario de lo que espera quien acaba de terminar
        // una.
        const siguiente = seguirEnElMismoModo ? "draw_point" : "simple_select"
        control.changeMode(siguiente)
        setMode(siguiente)
        refreshHasArea()
      }, 0)
    }

    const handleDelete = () => {
      syncMeasurements()
      refreshHasArea()
    }

    const handleModeChange = (event) => setMode(event.mode)

    // Qué hay seleccionado ahora mismo. Lo usa la paleta de colores, que
    // aparece también cuando hay una figura señalada para poder recolorearla.
    const handleSelectionChange = (event) =>
      setSelectedIds((event.features ?? []).map((feature) => feature.id))

    // Escape sale del modo de dibujo. Es la salida que espera cualquiera y la
    // que no hay que descubrir; el botón de la herramienta hace lo mismo.
    const handleKeyDown = (event) => {
      if (event.key !== "Escape") return
      const control = drawRef.current
      if (!control || control.getMode() === "simple_select") return
      control.changeMode("simple_select")
      setMode("simple_select")
    }

    mapInstance.on("draw.create", handleCreate)
    mapInstance.on("draw.update", syncMeasurements)
    mapInstance.on("draw.delete", handleDelete)
    // Mientras se arrastra un vértice, para que la medida se mueva con él.
    mapInstance.on("draw.render", syncMeasurements)
    mapInstance.on("draw.modechange", handleModeChange)
    mapInstance.on("draw.selectionchange", handleSelectionChange)
    document.addEventListener("keydown", handleKeyDown)

    return () => {
      mapInstance.off("draw.create", handleCreate)
      mapInstance.off("draw.update", syncMeasurements)
      mapInstance.off("draw.delete", handleDelete)
      mapInstance.off("draw.render", syncMeasurements)
      mapInstance.off("draw.modechange", handleModeChange)
      mapInstance.off("draw.selectionchange", handleSelectionChange)
      document.removeEventListener("keydown", handleKeyDown)
      clearMeasurements()
      // El control se quita solo si el mapa sigue vivo: al desmontar la página,
      // MapLibre ya se destruyó y removeControl reventaría.
      //
      // `getStyle()` va **dentro** del try, y no fuera como estaba: sobre un mapa
      // ya quitado lanza por su cuenta, así que la comprobación que existía para
      // evitar la excepción se saltaba el catch puesto para lo mismo.
      try {
        if (mapInstance.getStyle()) mapInstance.removeControl(draw)
      } catch {
        // El mapa ya se estaba destruyendo; no queda nada que quitar.
      }
      drawRef.current = null
    }
  }, [mapInstance, syncMeasurements, clearMeasurements, refreshHasArea])

  /**
   * Enciende una herramienta, o la apaga si ya estaba encendida.
   *
   * Lo segundo faltaba: una vez pulsado "dibujar polígono" no había manera de
   * volver atrás salvo dibujando algo, y el mapa se quedaba en modo dibujo
   * mientras el usuario intentaba, por ejemplo, hacer clic en un título para ver
   * su ficha.
   */
  useEffect(() => {
    syncMeasurements()
  }, [crsId, syncMeasurements])

  const startMode = useCallback((nextMode) => {
    const draw = drawRef.current
    if (!draw) return

    const target = draw.getMode() === nextMode ? "simple_select" : nextMode
    draw.changeMode(target)
    setMode(target)
  }, [])

  /**
   * Marca un punto en unas coordenadas dadas, sin usar el ratón.
   *
   * Es la vía de "escribir la coordenada": el punto entra por el mismo control
   * de dibujo que los que se marcan con el ratón, así que hereda todo lo demás
   * —el símbolo, la etiqueta con sus coordenadas, la papelera, la exportación—
   * sin tener que reimplementarlo.
   */
  const addPointAt = useCallback(
    (lngLat) => {
      const draw = drawRef.current
      const map = mapRef.current
      if (!draw || !map) return null

      const [id] = draw.add({
        type: "Feature",
        properties: { color: colorRef.current },
        geometry: { type: "Point", coordinates: [lngLat[0], lngLat[1]] },
      })

      syncMeasurements()
      // Y el recuento, que faltaba: un punto marcado con el ratón lo actualiza
      // desde `draw.create`, pero `draw.add()` no dispara ese evento. Escribir
      // una coordenada metía el punto en el mapa y dejaba la barra de dibujo
      // diciendo «2 figuras» con tres puestas.
      refreshHasArea()
      return id
    },
    [mapRef, refreshHasArea, syncMeasurements],
  )

  const deleteSelected = useCallback(() => {
    const draw = drawRef.current
    if (!draw) return

    const selected = draw.getSelectedIds()
    // Sin selección se borra todo: es lo que espera quien pulsa la papelera sin
    // haber señalado nada, y lo que hacía el botón equivalente en Leaflet.
    if (selected.length > 0) {
      draw.delete(selected)
    } else {
      draw.deleteAll()
    }
    syncMeasurements()
    refreshHasArea()
    setSelectedIds([])
  }, [syncMeasurements, refreshHasArea])

  const clearDrawings = useCallback(() => {
    drawRef.current?.deleteAll()
    clearMeasurements()
    refreshHasArea()
    setSelectedIds([])
  }, [clearMeasurements, refreshHasArea])

  /**
   * Lo dibujado, en GeoJSON estándar. Es lo que consume la exportación.
   *
   * Se filtran las figuras a medio hacer. Al entrar en un modo de dibujo,
   * mapbox-gl-draw ya mete en su almacén la figura que se va a dibujar, todavía
   * sin coordenadas, y `getAll()` la devuelve como una más. Con la herramienta
   * de punto encendida —que ahora se queda encendida entre punto y punto— eso
   * significa que casi siempre hay una figura vacía esperando, y se colaba en la
   * descarga por área: un punto sin coordenadas dentro de un GeoJSON no es
   * GeoJSON válido, y quien abriera el archivo se encontraría un error en vez de
   * sus datos.
   */
  const getDrawnFeatures = useCallback(() => {
    const all = drawRef.current?.getAll() ?? { type: "FeatureCollection", features: [] }
    return {
      ...all,
      features: all.features.filter((feature) => hasCoordinates(feature?.geometry)),
    }
  }, [])

  return {
    summary,
    drawingColor,
    handleColorChange,
    mode,
    startMode,
    addPointAt,
    selectedIds,
    deleteSelected,
    clearDrawings,
    getDrawnFeatures,
    hasArea,
  }
}
