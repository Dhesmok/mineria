import { useCallback, useEffect, useRef, useState } from "react"
import { Marker } from "maplibre-gl"
import MapboxDraw from "@mapbox/mapbox-gl-draw"

import { createDrawStyles, DEFAULT_DRAWING_COLOR } from "../../utils/drawStyles"
import { areaInHectares, areaInSquareMeters, lengthInMeters } from "../../utils/measure"
import { formatArea, formatDegrees, formatDistance, getLabelCoordinates } from "../../utils/mapUtils"

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

/** Qué dice la etiqueta y dónde se ancla, según el tipo de figura. */
const measurementOf = (feature) => {
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
    // coordenadas pueden no estar completas todavía, y formatDegrees(undefined)
    // reventaba con "Cannot read properties of undefined". Es un fallo por
    // tiempos: aparecía o no según cuándo cayera el render.
    const [lon, lat] = geometry.coordinates ?? []
    if (typeof lon !== "number" || typeof lat !== "number") return null
    return { text: `${formatDegrees(lat)}, ${formatDegrees(lon)}`, point: geometry.coordinates }
  }

  return null
}

export const useDrawControlGL = (mapRef, mapInstance) => {
  const [drawingColor, setDrawingColor] = useState(DEFAULT_DRAWING_COLOR)
  const [showColorPicker, setShowColorPicker] = useState(false)
  const [mode, setMode] = useState("simple_select")
  // ¿Hay al menos un polígono dibujado? Lo usa el botón de descarga por área,
  // que no tiene sentido sin un área. Se actualiza al crear y borrar, no en cada
  // cuadro de render.
  const [hasArea, setHasArea] = useState(false)

  const drawRef = useRef(null)
  // Una etiqueta por figura, indexada por su id, para poder actualizarlas y
  // quitarlas sin recrearlas todas.
  const labelsRef = useRef(new Map())
  // El color se lee dentro de manejadores de eventos creados una sola vez; con
  // el valor del estado se quedarían viendo el del primer render.
  const colorRef = useRef(drawingColor)
  colorRef.current = drawingColor

  const handleColorChange = useCallback((color) => setDrawingColor(color), [])

  /** Pone las etiquetas al día con lo que hay dibujado ahora mismo. */
  const syncMeasurements = useCallback(() => {
    const map = mapRef.current
    const draw = drawRef.current
    if (!map || !draw) return

    const features = draw.getAll().features
    const alive = new Set()

    features.forEach((feature) => {
      const measurement = measurementOf(feature)
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

      labelsRef.current.set(
        feature.id,
        new Marker({ element: measurementElement(measurement.text) })
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
  const refreshHasArea = useCallback(() => {
    const draw = drawRef.current
    if (!draw) {
      setHasArea(false)
      return
    }
    setHasArea(
      draw.getAll().features.some((feature) => feature?.geometry?.type === "Polygon"),
    )
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
      // Suprimir la tecla Supr propia de la librería: borra sin preguntar y sin
      // dejar rastro. El botón de la papelera hace lo mismo pero a la vista.
      keybindings: true,
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
        control.changeMode("simple_select")
        setMode("simple_select")
        refreshHasArea()
      }, 0)
    }

    const handleDelete = () => {
      syncMeasurements()
      refreshHasArea()
    }

    const handleModeChange = (event) => setMode(event.mode)

    mapInstance.on("draw.create", handleCreate)
    mapInstance.on("draw.update", syncMeasurements)
    mapInstance.on("draw.delete", handleDelete)
    // Mientras se arrastra un vértice, para que la medida se mueva con él.
    mapInstance.on("draw.render", syncMeasurements)
    mapInstance.on("draw.modechange", handleModeChange)

    return () => {
      mapInstance.off("draw.create", handleCreate)
      mapInstance.off("draw.update", syncMeasurements)
      mapInstance.off("draw.delete", handleDelete)
      mapInstance.off("draw.render", syncMeasurements)
      mapInstance.off("draw.modechange", handleModeChange)
      clearMeasurements()
      // El control se quita solo si el mapa sigue vivo: al desmontar la página,
      // MapLibre ya se destruyó y removeControl reventaría.
      if (mapInstance.getStyle()) {
        try {
          mapInstance.removeControl(draw)
        } catch {
          // El mapa ya se estaba destruyendo; no queda nada que quitar.
        }
      }
      drawRef.current = null
    }
  }, [mapInstance, syncMeasurements, clearMeasurements, refreshHasArea])

  const startMode = useCallback((nextMode) => {
    if (!drawRef.current) return
    drawRef.current.changeMode(nextMode)
    setMode(nextMode)
  }, [])

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
  }, [syncMeasurements, refreshHasArea])

  const clearDrawings = useCallback(() => {
    drawRef.current?.deleteAll()
    clearMeasurements()
    refreshHasArea()
  }, [clearMeasurements, refreshHasArea])

  /** Lo dibujado, en GeoJSON estándar. Es lo que consume la exportación. */
  const getDrawnFeatures = useCallback(
    () => drawRef.current?.getAll() ?? { type: "FeatureCollection", features: [] },
    [],
  )

  return {
    drawingColor,
    handleColorChange,
    showColorPicker,
    setShowColorPicker,
    mode,
    startMode,
    deleteSelected,
    clearDrawings,
    getDrawnFeatures,
    hasArea,
  }
}
