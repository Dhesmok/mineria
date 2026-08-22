import { useCallback, useEffect, useRef, useState } from "react"

/**
 * Perfil topográfico sobre una línea dibujada en el mapa.
 *
 * El usuario traza una línea (con la herramienta de dibujo que ya existe),
 * este hook muestrea alturas a lo largo de ella y devuelve un array de puntos
 * {distanceM, elevationM} para pintar como gráfico.
 *
 * **Cómo funciona:**
 *
 * 1. Se recibe una LineString de GeoJSON (la del control de dibujo).
 * 2. Se calcula la longitud total con haversine.
 * 3. Se generan puntos equidistantes (paso configurable).
 * 4. Para cada punto se consulta map.queryTerrainElevation().
 * 5. Se divide por la exageración para obtener metros reales (misma trampa que
 *    ya documentaron en useTerrainGL.js).
 *
 * **Por qué no usa sampleGrid ni Horn:** aquí no interesa la pendiente local,
 * sino la forma general del terreno a lo largo del recorrido. La rejilla 3×3
 * sería desperdiciar consultas sin aportar nada al gráfico.
 */

/** Distancia entre muestras, en metros. Con DEM de ~30 m, muestrear más fino es ruido. */
const SAMPLE_SPACING_M = 30

/** Radio terrestre medio, en metros. */
const EARTH_RADIUS_M = 6371000

/**
 * Distancia haversine entre dos [lon, lat], en metros.
 *
 * Haversine y no euclidiana: a esta escala las proyecciones planas introducen
 * error suficiente para que la distancia total del perfil salga mal.
 */
export const haversineM = ([lonA, latA], [lonB, latB]) => {
  const toRad = Math.PI / 180
  const dLat = (latB - latA) * toRad
  const dLon = (lonB - lonA) * toRad
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(latA * toRad) * Math.cos(latB * toRad) * Math.sin(dLon / 2) ** 2
  return EARTH_RADIUS_M * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
}

/**
 * Puntos equidistantes a lo largo de una LineString.
 *
 * Recorre los segmentos acumulando distancia; cuando supera el paso, interpola
 * linealmente dentro del segmento y sigue desde ahí. Así la separación real
 * entre muestras es constante, no proporcional al largo de cada segmento.
 */
export const interpolateAlong = (coordinates, spacingM) => {
  if (!Array.isArray(coordinates) || coordinates.length < 2) return []

  const puntos = []
  let restante = spacingM

  for (let i = 1; i < coordinates.length; i++) {
    const desde = coordinates[i - 1]
    const hasta = coordinates[i]
    const segmento = haversineM(desde, hasta)

    // Si el segmento es más corto que lo que falta para la siguiente muestra,
    // simplemente avanza: no vale la pena interpolar dentro de él.
    if (segmento < restante) {
      restante -= segmento
      continue
    }

    const pasos = Math.floor((segmento + restante) / spacingM)
    const fraccionInicial = restante / segmento

    for (let p = 0; p < pasos; p++) {
      const t = fraccionInicial + (p * (1 - fraccionInicial)) / pasos
      puntos.push([desde[0] + (hasta[0] - desde[0]) * t, desde[1] + (hasta[1] - desde[1]) * t])
    }
    restante = ((segmento + restante) % spacingM)
    if (Number.isNaN(restante)) restante = 0
    // Ajuste: restante debería ser el residuo de dividir el segmento por el paso.
    restante = segmento % spacingM
  }

  return puntos
}

export const useTerrainProfileGL = (mapRef, { setTerrainForQuery }) => {
  /** Array de { distanceM, elevationM } o null si no hay línea activa. */
  const [profile, setProfile] = useState(null)
  /** Motivo legible si algo impide calcularlo. */
  const [unavailable, setUnavailable] = useState(null)

  const profileRef = useRef(profile)
  profileRef.current = profile

  /**
   * Calcula el perfil a partir de una LineString de GeoJSON.
   *
   * Devuelve true si pudo calcularse, false si hubo algún impedimento
   * (que queda explicado en `unavailable`).
   */
  const computeProfile = useCallback(
    (lineStringFeature) => {
      const map = mapRef.current
      if (!map) {
        setUnavailable("El mapa todavía no está listo.")
        return false
      }

      const geometry = lineStringFeature?.geometry
      if (!geometry || geometry.type !== "LineString" || !Array.isArray(geometry.coordinates)) {
        setUnavailable("La figura seleccionada no es una línea.")
        return false
      }

      if (!map.getTerrain()) {
        setUnavailable("El modelo de elevación todavía no está listo.")
        return false
      }

      const coordenadas = geometry.coordinates.filter(
        ([lon, lat]) =>
          Number.isFinite(lon) && Number.isFinite(lat) && Math.abs(lon) <= 180 && Math.abs(lat) <= 90,
      )
      if (coordenadas.length < 2) {
        setUnavailable("La línea necesita al menos dos vértices.")
        return false
      }

      // Necesitamos el terreno puesto para poder consultar alturas.
      // Lo activamos temporalmente si no estaba.
      setTerrainForQuery(true)

      const exageracion = map.getTerrain()?.exaggeration ?? 1
      const muestras = interpolateAlong(coordenadas, SAMPLE_SPACING_M)

      if (muestras.length === 0) {
        setUnavailable("No hay suficientes puntos en la línea.")
        return false
      }

      // Consulta de altura por muestra. queryTerrainElevation devuelve la altura
      // multiplicada por la exageración — misma trampa que ya documentaron.
      const resultado = []
      let distanciaAcumulada = 0
      let anterior = null

      for (const punto of muestras) {
        if (anterior !== null) {
          distanciaAcumulada += haversineM(anterior, punto)
        }
        anterior = punto

        const cruda = map.queryTerrainElevation({ lng: punto[0], lat: punto[1] })
        const altura = cruda === null || cruda === undefined ? NaN : cruda / (exageracion || 1)

        resultado.push({
          distanceM: distanciaAcumulada,
          elevationM: altura,
          lngLat: punto,
        })
      }

      const validas = resultado.filter((r) => Number.isFinite(r.elevationM))
      if (validas.length === 0) {
        setUnavailable("Las teselas de elevación no han llegado a esa zona.")
        return false
      }

      setUnavailable(null)
      setProfile(resultado)
      return true
    },
    [mapRef, setTerrainForQuery],
  )

  const clearProfile = useCallback(() => {
    setProfile(null)
    setUnavailable(null)
  }, [])

  // Al desmontar limpiamos el estado.
  useEffect(() => clearProfile, [clearProfile])

  return { profile, unavailable, computeProfile, clearProfile }
}
