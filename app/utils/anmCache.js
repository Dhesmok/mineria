/**
 * Caché espacial LRU (Least Recently Used) en memoria para consultas a la ANM.
 *
 * Cada consulta a la ANM tarda entre 500 ms y 3 s en los servidores estatales.
 * Al hacer rebote de zoom o volver a una vista anterior (ej. fitBounds tras una
 * búsqueda), volver a consultar la misma vista responde de inmediato.
 *
 * ## Límites de memoria y seguridad (móviles)
 *
 * - **Tope de 12 entradas:** Con cuatro capas activas de la ANM, 12 entradas cubren
 *   las últimas tres vistas completas (unos 10–25 MB en el heap). En teléfonos
 *   móviles esto evita saturar la memoria RAM con cientos de miles de vértices.
 * - **Caducidad (TTL de 5 minutos):** En un visor minero, garantizar frescura del
 *   estado legal es crítico («¿está libre esta área?»). Tras 5 minutos los datos
 *   caducan y se vuelven a pedir al servidor.
 * - **Bypass en descargas:** La ruta de exportación de ZIPs (`bboxDownload.js`)
 *   omite la caché explícitamente (`skipCache: true`) para garantizar que los
 *   archivos descargados siempre contengan datos en vivo.
 */

export const MAX_CACHE_ENTRIES = 12
export const CACHE_TTL_MS = 5 * 60 * 1000 // 5 minutos

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
 * Obtiene un resultado cacheado si existe y no ha caducado, marcándolo como recién usado.
 */
export const getFromAnmCache = (key, now = Date.now()) => {
  if (!cache.has(key)) return null

  const entry = cache.get(key)
  if (now - entry.timestamp > CACHE_TTL_MS) {
    cache.delete(key)
    return null
  }

  // Re-insertar al final para mantener el orden LRU
  cache.delete(key)
  cache.set(key, entry)
  return entry.data
}

/**
 * Guarda un resultado en la caché, desalojando la entrada más antigua si se supera el tope.
 */
export const saveToAnmCache = (key, data, now = Date.now()) => {
  if (cache.has(key)) {
    cache.delete(key)
  } else if (cache.size >= MAX_CACHE_ENTRIES) {
    const oldestKey = cache.keys().next().value
    cache.delete(oldestKey)
  }
  cache.set(key, { data, timestamp: now })
}

/**
 * Vacía la caché por completo.
 */
export const clearAnmCache = () => {
  cache.clear()
}

/**
 * Devuelve el número de elementos en la caché actualmente.
 */
export const anmCacheSize = () => cache.size
