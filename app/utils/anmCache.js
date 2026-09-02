/**
 * Caché espacial LRU (Least Recently Used) en memoria para consultas a la ANM.
 *
 * Cada consulta a la ANM tarda entre 500 ms y 3 s en los servidores estatales.
 * Al mover el mapa o hacer zoom, volver a ver un sector visitado hace segundos
 * no debe volver a salir a internet.
 *
 * Se guarda una cantidad acotada (máx 64 peticiones) para no saturar memoria.
 */

const MAX_CACHE_ENTRIES = 64

/** Almacenamiento LRU usando Map (conserva orden de inserción). */
const cache = new Map()

/**
 * Normaliza una clave de recuadro geográfico.
 * Redondea a 4 decimales (~11 metros) para tolerar micro-variaciones de encuadre.
 */
export const boundsCacheKey = (bounds) => {
  if (!bounds) return "global"
  const w = Number(bounds.west).toFixed(4)
  const s = Number(bounds.south).toFixed(4)
  const e = Number(bounds.east).toFixed(4)
  const n = Number(bounds.north).toFixed(4)
  return `${w},${s},${e},${n}`
}

/**
 * Construye la clave única de caché para una petición de capa.
 */
export const anmCacheKey = (layerUrl, bounds, where = null) =>
  `${layerUrl}|${where || ""}|${boundsCacheKey(bounds)}`

/**
 * Obtiene un resultado cacheado si existe, marcándolo como recién usado.
 */
export const getFromAnmCache = (key) => {
  if (!cache.has(key)) return null
  const value = cache.get(key)
  // Re-insertar al final para mantener el orden LRU
  cache.delete(key)
  cache.set(key, value)
  return value
}

/**
 * Guarda un resultado en la caché, desalojando la entrada más antigua si se supera el tope.
 */
export const saveToAnmCache = (key, result) => {
  if (cache.has(key)) {
    cache.delete(key)
  } else if (cache.size >= MAX_CACHE_ENTRIES) {
    const oldestKey = cache.keys().next().value
    cache.delete(oldestKey)
  }
  cache.set(key, result)
}

/**
 * Vacía la caché por completo (útil en pruebas o forzado de recarga).
 */
export const clearAnmCache = () => {
  cache.clear()
}

/**
 * Devuelve el número de elementos en la caché actualmente.
 */
export const anmCacheSize = () => cache.size
