import { useCallback, useEffect, useRef, useState } from "react"
import { HILLSHADE_LAYER_ID, TERRAIN_SOURCE_ID } from "../../utils/mapStyles"

/**
 * Terreno 3D y sombreado del relieve.
 *
 * Son dos cosas distintas que comparten el mismo modelo de elevación:
 *
 * - **Relieve** (hillshade) sombrea las laderas sobre el mapa plano. Sirve para
 *   leer la topografía sin inclinar nada, que es como se mira un mapa la mayor
 *   parte del tiempo.
 * - **3D** inclina la cámara y levanta el terreno de verdad.
 *
 * Van separados porque responden a necesidades distintas, pero encender el 3D
 * enciende el relieve: en vista inclinada, sin sombras, un cerro y un valle se
 * parecen demasiado.
 */

/** Inclinación de la cámara al entrar en 3D. Ni plano ni tan rasante que se pierda el norte. */
const PITCH_3D = 60
const EXAGGERATION_DEFAULT = 1.5
export const EXAGGERATION_MIN = 0.5
export const EXAGGERATION_MAX = 3

/**
 * El cielo. Sin él, al inclinar la cámara el horizonte queda cortado en seco
 * contra el fondo de la página y el relieve parece flotar en el vacío.
 */
const SKY = {
  "sky-color": "#8fc3f2",
  "horizon-color": "#dfeaf5",
  "fog-color": "#e8eef4",
  "horizon-fog-blend": 0.6,
  "fog-ground-blend": 0.1,
}

export const useTerrainGL = (mapRef, mapInstance) => {
  const [is3D, setIs3D] = useState(false)
  const [showHillshade, setShowHillshade] = useState(false)
  const [exaggeration, setExaggeration] = useState(EXAGGERATION_DEFAULT)

  // La exageración se lee dentro de callbacks creados una sola vez.
  const exaggerationRef = useRef(exaggeration)
  exaggerationRef.current = exaggeration

  const setHillshadeVisible = useCallback(
    (visible) => {
      const map = mapRef.current
      if (!map?.getLayer(HILLSHADE_LAYER_ID)) return
      map.setLayoutProperty(HILLSHADE_LAYER_ID, "visibility", visible ? "visible" : "none")
    },
    [mapRef],
  )

  const toggleHillshade = useCallback(() => {
    setShowHillshade((current) => {
      const next = !current
      setHillshadeVisible(next)
      return next
    })
  }, [setHillshadeVisible])

  const toggle3D = useCallback(() => {
    const map = mapRef.current
    if (!map) return

    setIs3D((current) => {
      const next = !current

      if (next) {
        map.setTerrain({ source: TERRAIN_SOURCE_ID, exaggeration: exaggerationRef.current })
        map.setSky(SKY)
        map.easeTo({ pitch: PITCH_3D, duration: 700 })
        // El relieve se enciende con el 3D: inclinado y sin sombras, un cerro y
        // un valle se distinguen mal.
        setHillshadeVisible(true)
        setShowHillshade(true)
      } else {
        // `null` y no `undefined`: con undefined, MapLibre entiende "no me
        // digas nada" y deja el terreno puesto.
        map.setTerrain(null)
        map.setSky(undefined)
        map.easeTo({ pitch: 0, bearing: 0, duration: 700 })
        // El relieve se queda encendido a propósito: sigue siendo útil en
        // plano, y apagarlo de golpe al volver a 2D se siente como si el mapa
        // hubiera perdido información.
      }

      return next
    })
  }, [mapRef, setHillshadeVisible])

  const changeExaggeration = useCallback(
    (value) => {
      setExaggeration(value)
      const map = mapRef.current
      // Solo tiene efecto con el terreno puesto. Sin la comprobación,
      // setTerrain lo encendería desde el slider, que no es lo que nadie espera
      // al mover una barra.
      if (map?.getTerrain()) {
        map.setTerrain({ source: TERRAIN_SOURCE_ID, exaggeration: value })
      }
    },
    [mapRef],
  )

  /**
   * Altura del terreno en un punto, **en metros de verdad**.
   *
   * Existe por una trampa que costaría cara: `queryTerrainElevation` de MapLibre
   * no devuelve la altura del dato, sino la altura *ya multiplicada por la
   * exageración*. Con el slider en 3×, un cerro de 1.880 m se reporta como
   * 5.639 m. Nada avisa; el número simplemente sale mal.
   *
   * Cualquier código que lea alturas —el recorte de DEM de la Fase 5, un rótulo
   * de cota, un perfil topográfico— tiene que pasar por aquí y no por MapLibre
   * directamente. De ahí también el aviso bajo el slider: la exageración es un
   * efecto visual y no cambia ningún dato.
   *
   * Recordatorio aparte, ya anotado en CLAUDE.md: las alturas de los DEM
   * globales son elipsoidales. Para cotas ortométricas hay que aplicar geoide.
   *
   * @returns {number|null} metros, o null si no hay terreno o el dato no ha
   *   llegado todavía
   */
  const elevationAt = useCallback(
    (lngLat) => {
      const map = mapRef.current
      const terrain = map?.getTerrain()
      if (!terrain) return null

      const exaggerated = map.queryTerrainElevation(lngLat)
      if (exaggerated === null || exaggerated === undefined) return null

      const factor = terrain.exaggeration ?? 1
      return factor === 0 ? 0 : exaggerated / factor
    },
    [mapRef],
  )

  // Al desmontar hay que quitar el terreno: si no, MapLibre intenta seguir
  // dibujándolo mientras el mapa se destruye.
  useEffect(() => {
    if (!mapInstance) return
    return () => {
      try {
        if (mapInstance.getTerrain()) mapInstance.setTerrain(null)
      } catch {
        // El mapa ya se estaba destruyendo; no queda terreno que quitar.
      }
    }
  }, [mapInstance])

  return {
    elevationAt,
    is3D,
    toggle3D,
    showHillshade,
    toggleHillshade,
    exaggeration,
    changeExaggeration,
  }
}
