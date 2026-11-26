/**
 * El enlace que abre el visor donde lo dejó otra persona.
 *
 * En el sector la conversación es «mira este título», y hasta ahora la única
 * forma de decirlo era una captura o un número de expediente que el otro tenía
 * que volver a buscar. Con el enlace se abre el mismo sitio, con el mismo zoom,
 * el mismo giro y la misma inclinación —el 3D también—, y con las mismas capas
 * encendidas.
 *
 * **La posición la escribe MapLibre** con su opción `hash`, que mantiene en la
 * dirección `#vista=zoom/lat/lng/giro/inclinación` mientras el mapa se mueve. Se
 * le da nombre para que conviva con otros parámetros: MapLibre conserva los
 * ajenos al reescribir el suyo. De paso, recargar la página deja de mandar al
 * centro del país, que era lo que pasaba antes.
 *
 * **Las capas, no.** Un parámetro `capas` que siguiera en la dirección después
 * de abrir quedaría desfasado al primer interruptor, y un enlace copiado a mano
 * de la barra diría algo que ya no es. Por eso se lee una vez al abrir, se aplica
 * y se borra (`withoutSharedLayers`); el botón de compartir lo vuelve a poner con
 * lo que esté encendido en ese momento.
 *
 * Módulo puro: recibe textos y devuelve textos.
 */

/** Nombre del parámetro de la vista; es el que se le pasa a MapLibre. */
export const VIEW_HASH_KEY = "vista"

/** Nombre del parámetro de las capas encendidas. */
export const LAYERS_HASH_KEY = "capas"

const paramsDe = (hash) => new URLSearchParams(String(hash ?? "").replace(/^#/, ""))

/**
 * Vuelve a texto. `URLSearchParams` codifica las barras y las comas de la vista
 * —`12%2F6.2%2F-75.5`—, que funciona pero deja un enlace ilegible; MapLibre
 * escribe la suya sin codificar y aquí se hace igual. Las claves de capa son
 * letras, números y guiones, así que no hay nada que necesite escaparse.
 */
const textoDe = (params) => {
  const texto = decodeURIComponent(params.toString())
  return texto ? `#${texto}` : ""
}

/**
 * Las capas que pide un enlace, filtradas contra las que el visor conoce.
 *
 * Un enlace viejo o editado a mano puede nombrar capas que ya no existen; se
 * ignoran en vez de fallar. Devuelve `null` si el enlace no dice nada de capas,
 * que es distinto de decir «ninguna»: sin parámetro se respetan las preferencias
 * de quien abre, y con `capas=` vacío se apaga todo.
 *
 * @param {string} hash el `location.hash`
 * @param {Iterable<string>} knownKeys las claves de capa que existen
 * @returns {string[]|null}
 */
export const parseSharedLayers = (hash, knownKeys) => {
  const params = paramsDe(hash)
  if (!params.has(LAYERS_HASH_KEY)) return null
  const conocidas = new Set(knownKeys)
  const pedidas = (params.get(LAYERS_HASH_KEY) || "")
    .split(",")
    .map((clave) => clave.trim())
    .filter((clave) => conocidas.has(clave))
  return [...new Set(pedidas)]
}

/**
 * Aplica las capas de un enlace sobre el estado del panel.
 *
 * Solo toca el interruptor: el color, la opacidad y el orden siguen siendo los
 * de quien abre, que son preferencias suyas y no parte de lo que se comparte.
 */
export const applySharedLayers = (layers, sharedKeys) => {
  if (!sharedKeys) return layers
  const encendidas = new Set(sharedKeys)
  return Object.fromEntries(
    Object.entries(layers).map(([clave, estado]) => [clave, { ...estado, on: encendidas.has(clave) }]),
  )
}

/** El mismo hash sin el parámetro de capas, para limpiarlo tras aplicarlo. */
export const withoutSharedLayers = (hash) => {
  const params = paramsDe(hash)
  params.delete(LAYERS_HASH_KEY)
  return textoDe(params)
}

/**
 * El enlace para compartir: la dirección actual —que ya trae la vista, porque
 * la mantiene MapLibre— más las capas encendidas.
 *
 * @param {string} href `location.href`
 * @param {string[]} activeKeys claves de las capas encendidas
 */
export const buildShareUrl = (href, activeKeys) => {
  const url = new URL(href)
  const params = paramsDe(url.hash)
  params.delete(LAYERS_HASH_KEY)
  if (activeKeys.length > 0) params.set(LAYERS_HASH_KEY, activeKeys.join(","))
  url.hash = textoDe(params)
  return url.toString()
}
