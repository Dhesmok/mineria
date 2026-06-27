import { useState, useEffect } from "react"
import L from "leaflet"

export const useDrawControl = (mapRef, drawControlRef, drawnItemsRef) => {
  const [drawingColor, setDrawingColor] = useState("#f357a1")
  const [showColorPicker, setShowColorPicker] = useState(false)

  const handleColorChange = (newColor) => {
    setDrawingColor(newColor)
  }

  // Actualizar el control de dibujo cuando cambie el color
  useEffect(() => {
    if (mapRef.current && drawControlRef.current) {
      // Remover el control actual
      mapRef.current.removeControl(drawControlRef.current)

      // Crear un nuevo control con el color actualizado
      drawControlRef.current = new L.Control.Draw({
        position: "topright",
        draw: {
          polyline: {
            shapeOptions: {
              color: drawingColor,
              weight: 5,
            },
          },
          polygon: {
            allowIntersection: false,
            drawError: {
              color: "#e1e100",
              message: "<strong>¡Error!</strong> No se permiten polígonos que se intersecten.",
            },
            shapeOptions: {
              color: drawingColor,
            },
          },
          circle: {
            shapeOptions: {
              color: drawingColor,
            },
          },
          rectangle: {
            shapeOptions: {
              color: drawingColor,
            },
          },
          marker: {
            icon: new L.Icon({
              iconUrl: "https://unpkg.com/leaflet@1.7.1/dist/images/marker-icon.png",
              iconRetinaUrl: "https://unpkg.com/leaflet@1.7.1/dist/images/marker-icon-2x.png",
              shadowUrl: "https://unpkg.com/leaflet@1.7.1/dist/images/marker-shadow.png",
              iconSize: [25, 41],
              iconAnchor: [12, 41],
              popupAnchor: [1, -34],
              shadowSize: [41, 41],
            }),
          },
          circlemarker: false,
        },
        edit: {
          featureGroup: drawnItemsRef.current,
          remove: true,
        },
      })

      // Añadir el nuevo control al mapa
      mapRef.current.addControl(drawControlRef.current)
    }
  }, [drawingColor, mapRef, drawControlRef, drawnItemsRef])

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

  return { drawingColor, handleColorChange, showColorPicker, setShowColorPicker }
}
