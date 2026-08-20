import { crsById, toGeographic } from "./crs"

/**
 * Entender una coordenada escrita a mano.
 *
 * Existe porque el visor solo dejaba marcar puntos con el ratón, y muchas veces
 * la coordenada viene escrita: en una resolución, en un correo, en la libreta de
 * campo. El problema es que la misma coordenada se escribe de maneras muy
 * distintas según de dónde salga, y todas son legítimas:
 *
 *     6.2308, -75.5906          decimales con punto
 *     6,2308  -75,5906          decimales con coma, que es lo normal en español
 *     6,2308, -75,5906          las dos cosas a la vez
 *     6°13'50.9"N 75°35'26.2"W  grados, minutos y segundos
 *     1180000 1043000           metros, en un sistema plano
 *
 * La coma es el caso incómodo: en español separa los decimales, pero en la
 * mayoría de los sitios de donde se copia una coordenada separa los dos números.
 * No se puede decidir mirando una coma aislada, así que se decide mirando la
 * cadena entera: primero se intenta partir por espacios, que nunca son
 * ambiguos, y solo si no hay espacios se recurre a las comas.
 *
 * Módulo puro: devuelve números o un mensaje de error, y no toca el mapa.
 */

// Colombia continental e insular, con holgura. No sirve para rechazar nada
// —alguien puede querer mirar la frontera con Panamá o un punto en el mar—,
// solo para avisar de lo que casi siempre es un error de tecleo: haber
// intercambiado los dos números.
const COLOMBIA_BOUNDS = { minLat: -4.5, maxLat: 16, minLon: -82.5, maxLon: -66 }

const DMS_PATTERN =
  /(-?\d+(?:[.,]\d+)?)\s*[°º]\s*(?:(\d+(?:[.,]\d+)?)\s*['′’]\s*)?(?:(\d+(?:[.,]\d+)?)\s*(?:["″”]|'')?\s*)?([NSEWO])?/gi

const toNumber = (text) => {
  const value = Number.parseFloat(String(text).replace(",", "."))
  return Number.isFinite(value) ? value : null
}

/** El signo que impone la letra del rumbo. Sur y Oeste (y "O", en español) restan. */
const signOfHemisphere = (letter) => {
  const upper = (letter || "").toUpperCase()
  return upper === "S" || upper === "W" || upper === "O" ? -1 : 1
}

/**
 * Grados, minutos y segundos → grados decimales.
 *
 * El signo puede venir por la letra del rumbo o por un menos delante; si vienen
 * los dos, manda la letra, porque escribir "-75°W" es querer decir oeste y no
 * "menos oeste".
 */
const dmsToDegrees = ({ degrees, minutes, seconds, hemisphere }) => {
  const magnitude = Math.abs(degrees) + (minutes ?? 0) / 60 + (seconds ?? 0) / 3600
  const sign = hemisphere ? signOfHemisphere(hemisphere) : Math.sign(degrees) || 1
  return magnitude * sign
}

const parseDms = (text) => {
  const matches = [...text.matchAll(DMS_PATTERN)]
  if (matches.length !== 2) return null

  const parts = matches.map((match) => ({
    degrees: toNumber(match[1]),
    minutes: match[2] === undefined ? null : toNumber(match[2]),
    seconds: match[3] === undefined ? null : toNumber(match[3]),
    hemisphere: match[4] ?? null,
  }))

  if (parts.some((part) => part.degrees === null)) return null

  const values = parts.map(dmsToDegrees)

  // Si vienen las letras, ellas dicen cuál es cuál: es lo único que permite
  // aceptar "75°W 6°N" escrito al revés sin adivinar.
  const letters = parts.map((part) => (part.hemisphere || "").toUpperCase())
  const latIndex = letters.findIndex((letter) => letter === "N" || letter === "S")
  const lonIndex = letters.findIndex((letter) => letter === "E" || letter === "W" || letter === "O")
  if (latIndex >= 0 && lonIndex >= 0 && latIndex !== lonIndex) {
    return { first: values[latIndex], second: values[lonIndex] }
  }

  return { first: values[0], second: values[1] }
}

/**
 * Los dos números de la cadena, en el orden en que están escritos.
 *
 * El orden de partido importa: por espacios primero, porque un espacio separa
 * dos números sin discusión posible, y solo entonces por comas.
 */
const parseNumbers = (text) => {
  const bySpace = text
    .split(/[\s;]+/)
    .map((token) => token.replace(/,$/, ""))
    .filter(Boolean)

  if (bySpace.length === 2) {
    const values = bySpace.map(toNumber)
    return values.every((value) => value !== null) ? { first: values[0], second: values[1] } : null
  }

  const byComma = text.split(",").map((token) => token.trim()).filter(Boolean)

  // Dos trozos: la coma separaba los números y los decimales van con punto.
  if (byComma.length === 2) {
    const values = byComma.map(toNumber)
    return values.every((value) => value !== null) ? { first: values[0], second: values[1] } : null
  }

  // Cuatro trozos: las comas eran decimales y falta saber dónde partía el par.
  // "6,2308,-75,5906" se rearma como 6,2308 y -75,5906.
  if (byComma.length === 4) {
    const first = toNumber(`${byComma[0]}.${byComma[1]}`)
    const second = toNumber(`${byComma[2]}.${byComma[3]}`)
    return first !== null && second !== null ? { first, second } : null
  }

  return null
}

const isInsideColombia = (lon, lat) =>
  lat >= COLOMBIA_BOUNDS.minLat &&
  lat <= COLOMBIA_BOUNDS.maxLat &&
  lon >= COLOMBIA_BOUNDS.minLon &&
  lon <= COLOMBIA_BOUNDS.maxLon

/**
 * Convierte lo escrito en un punto del mapa.
 *
 * El orden de los dos números es el que enseña la tabla de coordenadas para ese
 * sistema: latitud y longitud en los geográficos, norte y este en los planos.
 *
 * @param {string} text lo que escribió el usuario
 * @param {string} crsId el sistema en el que lo escribió (ver utils/crs.js)
 * @returns {{lon: number, lat: number, outsideColombia: boolean} | {error: string}}
 */
export const parseCoordinateInput = (text, crsId) => {
  const clean = String(text ?? "").trim()
  if (!clean) return { error: "Escribe una coordenada." }

  const crs = crsById(crsId)
  const pair = (!crs.projected && parseDms(clean)) || parseNumbers(clean)

  if (!pair) {
    return {
      error: crs.projected
        ? "No entendí la coordenada. Escribe el norte y el este separados por un espacio."
        : "No entendí la coordenada. Escribe la latitud y la longitud separadas por un espacio.",
    }
  }

  // El par se escribe siempre con la ordenada primero —latitud arriba de
  // longitud, norte arriba de este— y proj4 espera lo contrario, [x, y]. Por eso
  // se invierte en los dos casos.
  const [lon, lat] = toGeographic([pair.second, pair.first], crs.id)

  if (!Number.isFinite(lon) || !Number.isFinite(lat)) {
    return { error: "Esa coordenada no se pudo convertir a un punto del mapa." }
  }

  if (Math.abs(lat) > 90 || Math.abs(lon) > 180) {
    return { error: "Esa coordenada queda fuera del planeta. Revisa el sistema elegido." }
  }

  return { lon, lat, outsideColombia: !isInsideColombia(lon, lat) }
}
