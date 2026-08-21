import { useCallback, useEffect, useState } from "react"

import {
  ALL_BASEMAP_LAYERS,
  DEFAULT_BASEMAP,
  supportsLabelToggle,
  visibleBasemapLayers,
} from "../../utils/basemaps"

/**
 * El mapa de fondo y sus nombres.
 *
 * La versión Leaflet de este hook recorría el mapa buscando capas de teselas,
 * las quitaba y creaba una nueva. Aquí no hace falta: **todos los fondos están
 * declarados en el estilo** (ver `createBaseStyle`), así que cambiar de fondo es
 * apagar unas capas y encender otras. Nada más del mapa se toca, que es justo lo
 * que se necesita teniendo encima capas de la ANM, dibujos y búsquedas.
 *
 * **Elegir el fondo que ya está puesto quita o pone sus nombres.** Es un botón
 * que hace dos cosas según el contexto, en vez de dos botones, uno de los cuales
 * estaría apagado casi siempre. En los fondos que traen los nombres pintados
 * dentro de la tesela —OSM y OpenTopoMap— no hay nada que quitar, y el visor lo
 * dice en vez de ofrecer un interruptor que no haría nada.
 *
 * @param {Object} mapRef ref al mapa de MapLibre
 * @param {Object|null} mapInstance el mapa ya listo, o null mientras se crea
 */
export const useMapInitializationGL = (mapRef, mapInstance = null) => {
  const [basemap, setBasemap] = useState(DEFAULT_BASEMAP)
  const [showLabels, setShowLabels] = useState(true)

  /** Aplica al mapa el fondo y los nombres que digan el estado. */
  const applyBasemap = useCallback(
    (id, labels) => {
      const map = mapRef.current
      if (!map) return

      // El estilo se carga de forma asíncrona. Si alguien alcanza a pulsar antes
      // de que termine, las capas todavía no existen y setLayoutProperty lanza
      // una excepción que tumba el render de React.
      const visibles = new Set(visibleBasemapLayers(id, labels))
      ALL_BASEMAP_LAYERS.forEach((layerId) => {
        if (!map.getLayer(layerId)) return
        map.setLayoutProperty(layerId, "visibility", visibles.has(layerId) ? "visible" : "none")
      })
    },
    [mapRef],
  )

  /**
   * Elegir un fondo. Si es el que ya estaba puesto, alterna sus nombres.
   */
  const chooseBasemap = useCallback(
    (id) => {
      const mismoFondo = id === basemap
      const labels = mismoFondo && supportsLabelToggle(id) ? !showLabels : showLabels

      setBasemap(id)
      setShowLabels(labels)
      applyBasemap(id, labels)
    },
    [applyBasemap, basemap, showLabels],
  )

  // Al montar, el mapa todavía no existe: `applyBasemap` no encontraría ninguna
  // capa y se iría de vacío. Por eso el disparo va colgado de `mapInstance`, que
  // es lo que avisa de que el estilo ya está en pie.
  useEffect(() => {
    if (!mapInstance) return
    applyBasemap(basemap, showLabels)
    // Solo cuando aparece el mapa: a partir de ahí manda chooseBasemap.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [applyBasemap, mapInstance])

  return { basemap, showLabels, chooseBasemap }
}
