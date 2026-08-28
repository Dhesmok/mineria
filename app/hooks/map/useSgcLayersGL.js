import { useEffect } from "react"

import { SGC_LAYERS, sgcLayerId } from "../../utils/sgcLayers"

/**
 * Las capas de geología del SGC sobre el mapa.
 *
 * Comparado con `useMapLayersGL`, esto es diminuto, y esa es justamente la
 * ventaja de traerlas como imagen: no hay que consultar el servicio por recuadro,
 * ni convertir geometrías, ni decidir cuándo hay demasiadas features, ni volver a
 * pedir nada al mover el mapa. MapLibre pide las teselas que le faltan y ya. Aquí
 * solo se enciende, se apaga y se gradúa la opacidad.
 *
 * El orden de pintado **no está aquí**: lo lleva `useMapLayersGL`, que ya
 * recorría la lista del panel para las capas de la ANM. Tenerlo en dos sitios
 * sería tener dos opiniones sobre qué va encima de qué.
 */
export const useSgcLayersGL = (mapRef, mapInstance, layerState) => {
  useEffect(() => {
    const map = mapRef.current
    if (!map) return

    SGC_LAYERS.forEach(({ key }) => {
      const id = sgcLayerId(key)
      if (!map.getLayer(id)) return

      const estado = layerState?.[key]
      const encendida = Boolean(estado?.on)

      map.setLayoutProperty(id, "visibility", encendida ? "visible" : "none")
      // La opacidad se aplica siempre, encendida o no: si solo se aplicara al
      // encenderla, volver a prenderla después de haber movido el deslizador la
      // sacaría con la opacidad vieja durante un instante.
      map.setPaintProperty(id, "raster-opacity", estado?.opacity ?? 0.6)
    })
  }, [mapInstance, layerState, mapRef])
}
