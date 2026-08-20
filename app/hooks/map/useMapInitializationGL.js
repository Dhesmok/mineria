import { useState, useCallback } from "react"
import { BASE_LAYERS } from "../../utils/mapStyles"

/**
 * Alterna entre mapa y satélite en MapLibre.
 *
 * La versión Leaflet de este hook recorría el mapa buscando capas de teselas,
 * las quitaba y creaba una nueva. Aquí no hace falta: las dos capas base ya
 * están declaradas en el estilo (ver `createBaseStyle`), así que alternar es
 * prender una y apagar la otra. Nada más del mapa se toca, que es justo lo que
 * se necesita cuando encima haya capas de la ANM, dibujos y resultados de
 * búsqueda.
 *
 * @param {Object} mapRef ref al mapa de MapLibre
 */
export const useMapInitializationGL = (mapRef) => {
  const [baseLayer, setBaseLayer] = useState("osm")

  const toggleBaseLayer = useCallback(() => {
    const map = mapRef.current
    if (!map) return

    // El estilo se carga de forma asíncrona. Si alguien alcanza a pulsar el
    // botón antes de que termine, las capas todavía no existen y
    // setLayoutProperty lanza una excepción que tumba el render de React.
    if (!map.getLayer(BASE_LAYERS.osm) || !map.getLayer(BASE_LAYERS.satellite)) return

    const next = baseLayer === "osm" ? "satellite" : "osm"

    map.setLayoutProperty(BASE_LAYERS.osm, "visibility", next === "osm" ? "visible" : "none")
    map.setLayoutProperty(
      BASE_LAYERS.satellite,
      "visibility",
      next === "satellite" ? "visible" : "none",
    )

    setBaseLayer(next)
  }, [baseLayer, mapRef])

  return { baseLayer, toggleBaseLayer }
}
