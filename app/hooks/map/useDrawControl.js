import { useState, useEffect, useRef } from "react"
import L from "leaflet"
import { createDrawOptions, DEFAULT_DRAWING_COLOR } from "../../utils/drawOptions"

export const useDrawControl = (mapRef, mapInstance, drawControlRef, drawnItemsRef, measureControlRef) => {
  const [drawingColor, setDrawingColor] = useState(DEFAULT_DRAWING_COLOR)
  const [showColorPicker, setShowColorPicker] = useState(false)

  // Las herramientas de medición se crean una sola vez, dentro del efecto de
  // inicialización del mapa, y capturaban el color del primer render: cambiarlo en el
  // selector no las afectaba. Con un ref siempre leen el valor actual.
  const drawingColorRef = useRef(drawingColor)

  useEffect(() => {
    drawingColorRef.current = drawingColor
  }, [drawingColor])

  const handleColorChange = (newColor) => {
    setDrawingColor(newColor)
  }

  // Leaflet.Draw copia las shapeOptions al construir cada manejador, así que cambiar
  // el color obliga a recrear el control.
  useEffect(() => {
    if (!mapInstance || !drawnItemsRef.current) return

    const map = mapInstance

    if (drawControlRef.current) {
      map.removeControl(drawControlRef.current)
    }
    // Los controles se apilan en el orden en que se añaden. Recreando solo el de
    // dibujo, este saltaba por debajo del de medición cada vez que se cambiaba el
    // color; re-añadir el de medición después conserva el orden de la barra.
    if (measureControlRef?.current) {
      map.removeControl(measureControlRef.current)
    }

    drawControlRef.current = new L.Control.Draw(createDrawOptions(drawingColor, drawnItemsRef.current))
    map.addControl(drawControlRef.current)

    if (measureControlRef?.current) {
      map.addControl(measureControlRef.current)
    }
  }, [drawingColor, mapInstance, drawControlRef, drawnItemsRef, measureControlRef])

  // Cerrar el selector de colores cuando se hace clic fuera de él
  useEffect(() => {
    if (!showColorPicker) return

    const handleClickOutside = (event) => {
      const colorPickerElements = document.querySelectorAll('[aria-label^="Color"]')
      let isColorPickerClick = false

      colorPickerElements.forEach((element) => {
        if (element.contains(event.target)) {
          isColorPickerClick = true
        }
      })

      if (!isColorPickerClick) {
        setShowColorPicker(false)
      }
    }

    document.addEventListener("mousedown", handleClickOutside)
    return () => {
      document.removeEventListener("mousedown", handleClickOutside)
    }
  }, [showColorPicker])

  return { drawingColor, drawingColorRef, handleColorChange, showColorPicker, setShowColorPicker }
}
