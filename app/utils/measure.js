import proj4 from "proj4"

import { crsById, SOURCE_CRS } from "./crs"

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

/**
 * Las dos definiciones salen de `crs.js`, no se escriben aquí.
 *
 * Estuvieron escritas a mano —las mismas dos cadenas de proj4, palabra por
 * palabra—, que es exactamente la duplicación que `crs.js` dice haber venido a
 * eliminar: «cada uno repetía la misma cadena de proj4… de ahí este módulo
 * único». El día que se corrija un parámetro del CTM-12 se corrige en un sitio,
 * y las áreas que enseña el visor no se quedan calculadas con el viejo.
 *
 * De paso se va un nombre que engañaba: lo que aquí se llamaba `WGS84` no era
 * WGS84 sino MAGNA-SIRGAS geográficas (EPSG:4686). Coinciden dentro de un metro
 * en Colombia, pero llamarle al uno por el nombre del otro es como acaban
 * mezclándose los sistemas.
 */
const MAGNA = crsById(SOURCE_CRS).proj
const CTM12 = crsById("9377").proj

/**
 * [lon, lat] geográficas → [este, norte] en metros.
 *
 * Se exporta para que el perfil longitudinal mida sus distancias con esta misma
 * proyección. Si midiera de otra forma, la longitud del perfil y la que enseña
 * la herramienta de medir para esa misma línea no coincidirían, y esa
 * discrepancia se lee como un error del visor —con razón—.
 */
export const toCtm12 = ([lon, lat] = []) => {
  if (!Number.isFinite(lon) || !Number.isFinite(lat)) return [NaN, NaN]
  try {
    return proj4(MAGNA, CTM12, [lon, lat])
  } catch {
    return [NaN, NaN]
  }
}

/**
 * Valida que un anillo tenga al menos 3 posiciones y que todas sean números finitos.
 */
const isRingValid = (ring) => {
  if (!Array.isArray(ring) || ring.length < 3) return false
  for (let i = 0; i < ring.length; i += 1) {
    const pt = ring[i]
    if (!Array.isArray(pt) || pt.length < 2) return false
    if (!Number.isFinite(pt[0]) || !Number.isFinite(pt[1])) return false
  }
  return true
}

/**
 * Área de un anillo por la fórmula del agrimensor (shoelace).
 *
 * Se toma el índice siguiente en módulo n, así que da igual si el anillo viene
 * cerrado (con el primer vértice repetido al final) o abierto: GeoJSON los cierra
 * y lo que dibuja el usuario a veces no.
 *
 * Devuelve área con signo: positiva o negativa según el sentido de giro, o null
 * si el anillo contiene coordenadas corruptas o inválidas.
 */
const signedRingArea = (ring) => {
  if (!isRingValid(ring)) return null

  const points = ring.map(toCtm12)
  for (let i = 0; i < points.length; i += 1) {
    if (!Number.isFinite(points[i][0]) || !Number.isFinite(points[i][1])) {
      return null
    }
  }

  const n = points.length
  let sum = 0
  for (let i = 0; i < n; i += 1) {
    const [x1, y1] = points[i]
    const [x2, y2] = points[(i + 1) % n]
    sum += x1 * y2 - x2 * y1
  }
  const area = sum / 2
  return Number.isFinite(area) ? area : null
}

/**
 * Área de un polígono: el contorno exterior menos sus huecos interiores.
 *
 * El anillo exterior es estrictamente el primer anillo (rings[0]). Si el primer
 * anillo no es válido o está corrupto, se devuelve 0 para evitar que un hueco
 * interior sea promovido accidentalmente como superficie exterior.
 *
 * Devuelve 0 seguro ante cualquier anillo corrupto o geometría degenerada donde
 * los huecos superen al contorno exterior.
 */
const polygonArea = (rings) => {
  if (!Array.isArray(rings) || rings.length === 0) return 0

  const [exteriorRing, ...holeRings] = rings
  if (!isRingValid(exteriorRing)) return 0

  const exteriorSigned = signedRingArea(exteriorRing)
  if (exteriorSigned === null) return 0
  const exteriorArea = Math.abs(exteriorSigned)
  if (!Number.isFinite(exteriorArea) || exteriorArea <= 0) return 0

  let holesArea = 0
  for (const hole of holeRings) {
    if (!isRingValid(hole)) return 0
    const holeSigned = signedRingArea(hole)
    if (holeSigned === null) return 0
    holesArea += Math.abs(holeSigned)
  }

  const netArea = exteriorArea - holesArea
  return Number.isFinite(netArea) && netArea > 0 ? netArea : 0
}

/** Área en metros cuadrados de una geometría GeoJSON. 0 si no es de área o es inválida. */
export const areaInSquareMeters = (geometry) => {
  if (!geometry || typeof geometry !== "object") return 0
  try {
    if (geometry.type === "Polygon") {
      return polygonArea(geometry.coordinates)
    }
    if (geometry.type === "MultiPolygon") {
      if (!Array.isArray(geometry.coordinates)) return 0
      let total = 0
      for (const rings of geometry.coordinates) {
        total += polygonArea(rings)
      }
      return Number.isFinite(total) && total > 0 ? total : 0
    }
  } catch {
    return 0
  }
  return 0
}

/** Hectáreas, que es la unidad en que se habla de títulos mineros. */
export const areaInHectares = (geometry) => {
  const m2 = areaInSquareMeters(geometry)
  return Number.isFinite(m2) && m2 > 0 ? m2 / 10000 : 0
}

const isLineValid = (coordinates) => {
  if (!Array.isArray(coordinates) || coordinates.length < 2) return false
  for (let i = 0; i < coordinates.length; i += 1) {
    const pt = coordinates[i]
    if (!Array.isArray(pt) || pt.length < 2) return false
    if (!Number.isFinite(pt[0]) || !Number.isFinite(pt[1])) return false
  }
  return true
}

const lineLength = (coordinates) => {
  if (!isLineValid(coordinates)) return 0

  const points = coordinates.map(toCtm12)
  for (let i = 0; i < points.length; i += 1) {
    if (!Number.isFinite(points[i][0]) || !Number.isFinite(points[i][1])) {
      return 0
    }
  }

  let total = 0
  for (let i = 1; i < points.length; i += 1) {
    const [x1, y1] = points[i - 1]
    const [x2, y2] = points[i]
    total += Math.hypot(x2 - x1, y2 - y1)
  }
  return Number.isFinite(total) && total > 0 ? total : 0
}

/** Longitud en metros de una geometría GeoJSON. 0 si no es lineal o es inválida. */
export const lengthInMeters = (geometry) => {
  if (!geometry || typeof geometry !== "object") return 0
  try {
    if (geometry.type === "LineString") {
      return lineLength(geometry.coordinates)
    }
    if (geometry.type === "MultiLineString") {
      if (!Array.isArray(geometry.coordinates)) return 0
      let total = 0
      for (const line of geometry.coordinates) {
        total += lineLength(line)
      }
      return Number.isFinite(total) && total > 0 ? total : 0
    }
  } catch {
    return 0
  }
  return 0
}
