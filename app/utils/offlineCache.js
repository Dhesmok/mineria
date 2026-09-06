/**
 * Gestor de almacenamiento local (IndexedDB y CacheStorage) para soporte Offline.
 */

const DB_NAME = "visor-minero-offline-db"
const DB_VERSION = 1
const STORE_QUERIES = "queries"
const TILE_CACHE_NAME = "visor-tiles-v1"

let dbPromise = null

/**
 * Abre o inicializa la base de datos IndexedDB nativa.
 * @returns {Promise<IDBDatabase>}
 */
export const getDatabase = () => {
  if (typeof window === "undefined" || !("indexedDB" in window)) {
    return Promise.resolve(null)
  }

  if (dbPromise) return dbPromise

  dbPromise = new Promise((resolve, reject) => {
    try {
      const request = indexedDB.open(DB_NAME, DB_VERSION)

      request.onupgradeneeded = (event) => {
        const db = event.target.result
        if (!db.objectStoreNames.contains(STORE_QUERIES)) {
          db.createObjectStore(STORE_QUERIES, { keyPath: "key" })
        }
      }

      request.onsuccess = (event) => {
        resolve(event.target.result)
      }

      request.onerror = (event) => {
        console.warn("[OfflineCache] Error abriendo IndexedDB:", event.target.error)
        resolve(null)
      }
    } catch (err) {
      console.warn("[OfflineCache] Excepción en IndexedDB:", err)
      resolve(null)
    }
  })

  return dbPromise
}

/**
 * Almacena el resultado de una consulta de datos en IndexedDB.
 * @param {string} key
 * @param {any} data
 */
export const cacheQueryResponse = async (key, data) => {
  try {
    const db = await getDatabase()
    if (!db) return
    const tx = db.transaction(STORE_QUERIES, "readwrite")
    const store = tx.objectStore(STORE_QUERIES)
    store.put({ key, data, timestamp: Date.now() })
  } catch (err) {
    console.warn("[OfflineCache] Error guardando consulta en caché:", err)
  }
}

/**
 * Obtiene el resultado guardado de una consulta en IndexedDB.
 * @param {string} key
 * @returns {Promise<any|null>}
 */
export const getCachedQueryResponse = async (key) => {
  try {
    const db = await getDatabase()
    if (!db) return null
    return new Promise((resolve) => {
      const tx = db.transaction(STORE_QUERIES, "readonly")
      const store = tx.objectStore(STORE_QUERIES)
      const request = store.get(key)
      request.onsuccess = () => {
        resolve(request.result ? request.result.data : null)
      }
      request.onerror = () => resolve(null)
    })
  } catch (err) {
    console.warn("[OfflineCache] Error leyendo consulta de caché:", err)
    return null
  }
}

/**
 * Guarda una tesela de mapa o DEM en CacheStorage.
 * @param {string} url
 * @param {Response} response
 */
export const cacheTile = async (url, response) => {
  if (typeof window === "undefined" || !("caches" in window)) return
  try {
    const cache = await caches.open(TILE_CACHE_NAME)
    await cache.put(url, response.clone())
  } catch (err) {
    console.warn("[OfflineCache] Error guardando tesela:", err)
  }
}

/**
 * Intenta recuperar una tesela guardada en CacheStorage.
 * @param {string} url
 * @returns {Promise<Response|null>}
 */
export const getCachedTile = async (url) => {
  if (typeof window === "undefined" || !("caches" in window)) return null
  try {
    const cache = await caches.open(TILE_CACHE_NAME)
    const match = await cache.match(url)
    return match || null
  } catch (err) {
    console.warn("[OfflineCache] Error leyendo tesela de caché:", err)
    return null
  }
}
