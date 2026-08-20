import proj4 from "proj4"

/**
 * Áreas y distancias de lo que dibuja el usuario.
 *
 * **Se calcula en CTM-12 (EPSG:9377), no sobre la esfera.** Es la convención del
 * proyecto (ver CLAUDE.md) y no es un capricho: la tabla de coordenadas y la
 * exportación a SHP ya usan ese sistema, así que si el área en pantalla se
 * calculara de otra forma los números no cuadrarían entre sí, y tampoco con los
 * que publica la ANM.
 *
 * Conviene saber el matiz: una fórmula geodésica sobre el elipsoide sería algo
 * más exacta en términos absolutos. CTM-12 es una proyección plana y deforma un
 * poco al alejarse de su meridiano central (-73°), del orden de décimas de por
 * ciento en los extremos del país. Se prefiere igual, porque aquí vale más
 * coincidir con la cifra oficial que ser exacto por libre.
 *
 * Módulo puro: no sabe nada de mapas ni de MapLibre, y por eso se puede probar
 * contra cuadrados de tamaño conocido.
 */

const WGS84 = "+proj=longlat +ellps=GRS80 +towgs84=0,0,0,0,0,0,0 +no_defs"
const CTM12 =
  "+proj=tmerc +lat_0=4.0 +lon_0=-73.0 +k=0.9992 +x_0=5000000 +y_0=2000000 " +
  "+ellps=GRS80 +towgs84=0,0,0,0,0,0,0 +units=m +no_defs"

/** [lon, lat] geográficas → [este, norte] en metros. */
const toCtm12 = ([lon, lat]) => proj4(WGS84, CTM12, [lon, lat])

/**
 * Área de un anillo por la fórmula del agrimensor (shoelace).
 *
 * Se toma el índice siguiente en módulo n, así que da igual si el anillo viene
 * cerrado (con el primer vértice repetido al final) o abierto: GeoJSON los cierra
 * y lo que dibuja el usuario a veces no.
 *
 * Devuelve área con signo: positiva o negativa según el sentido de giro. Quien
 * llama decide qué hacer con el signo; aquí es lo que permite restar los huecos.
 */
const signedRingArea = (ring) => {
  const points = ring.map(toCtm12)
  const n = points.length
  if (n < 3) return 0

  let sum = 0
  for (let i = 0; i < n; i += 1) {
    const [x1, y1] = points[i]
    const [x2, y2] = points[(i + 1) % n]
    sum += x1 * y2 - x2 * y1
  }
  return sum / 2
}

/**
 * Área de un polígono: el contorno menos sus huecos.
 *
 * Se usan valores absolutos y una resta explícita en vez de fiarse del sentido
 * de giro de cada anillo. GeoJSON dice que los huecos van en sentido contrario
 * al contorno, pero no todo el mundo lo respeta, y un hueco con el giro
 * equivocado sumaría en lugar de restar: un título con un hueco saldría con más
 * área de la que tiene.
 */
const polygonArea = (rings) => {
  const usable = (Array.isArray(rings) ? rings : []).filter(
    (ring) => Array.isArray(ring) && ring.length >= 3,
  )
  if (usable.length === 0) return 0

  const [exterior, ...holes] = usable
  const holesArea = holes.reduce((total, hole) => total + Math.abs(signedRingArea(hole)), 0)

  // Nunca negativa: unos huecos mal formados que sumaran más que el contorno
  // darían un área negativa, que no significa nada.
  return Math.max(Math.abs(signedRingArea(exterior)) - holesArea, 0)
}

/** Área en metros cuadrados de una geometría GeoJSON. 0 si no es de área. */
export const areaInSquareMeters = (geometry) => {
  if (geometry?.type === "Polygon") {
    return polygonArea(geometry.coordinates)
  }
  if (geometry?.type === "MultiPolygon") {
    return (geometry.coordinates || []).reduce((total, rings) => total + polygonArea(rings), 0)
  }
  return 0
}

/** Hectáreas, que es la unidad en que se habla de títulos mineros. */
export const areaInHectares = (geometry) => areaInSquareMeters(geometry) / 10000

const lineLength = (coordinates) => {
  const points = (Array.isArray(coordinates) ? coordinates : []).map(toCtm12)

  let total = 0
  for (let i = 1; i < points.length; i += 1) {
    const [x1, y1] = points[i - 1]
    const [x2, y2] = points[i]
    total += Math.hypot(x2 - x1, y2 - y1)
  }
  return total
}

/** Longitud en metros de una geometría GeoJSON. 0 si no es lineal. */
export const lengthInMeters = (geometry) => {
  if (geometry?.type === "LineString") {
    return lineLength(geometry.coordinates)
  }
  if (geometry?.type === "MultiLineString") {
    return (geometry.coordinates || []).reduce((total, line) => total + lineLength(line), 0)
  }
  return 0
}
