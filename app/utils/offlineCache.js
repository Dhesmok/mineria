/**
 * Gestor de almacenamiento local (IndexedDB y CacheStorage) para soporte Offline.
 * Implementa política estricta de desalojo LRU (Least Recently Used) y límites de cuota
 * para evitar el llenado de memoria en dispositivos móviles.
 */

const DB_NAME = "visor-minero-offline-db"
const DB_VERSION = 2
const STORE_QUERIES = "queries"
const STORE_TILES_META = "tiles_meta"
export const TILE_CACHE_NAME = "visor-tiles-v1"

// Presupuesto acotado de almacenamiento para mapas y DEM (Astra Contract)
export const MAX_CACHE_ENTRIES = 700
export const MAX_CACHE_BYTES = 60 * 1024 * 1024 // 60 MiB
export const TARGET_CACHE_ENTRIES = 630
export const TARGET_CACHE_BYTES = 54 * 1024 * 1024 // 54 MiB

let dbPromise = null

/**
 * Abre o inicializa la base de datos IndexedDB nativa.
 * @returns {Promise<IDBDatabase|null>}
 */
export const getDatabase = () => {
  if (typeof window === "undefined" || !("indexedDB" in window)) {
    return Promise.resolve(null)
  }

  if (dbPromise) return dbPromise

  dbPromise = new Promise((resolve) => {
    try {
      const request = indexedDB.open(DB_NAME, DB_VERSION)

      request.onupgradeneeded = (event) => {
        const db = event.target.result
        if (!db.objectStoreNames.contains(STORE_QUERIES)) {
          db.createObjectStore(STORE_QUERIES, { keyPath: "key" })
        }
        if (!db.objectStoreNames.contains(STORE_TILES_META)) {
          const tileStore = db.createObjectStore(STORE_TILES_META, { keyPath: "url" })
          tileStore.createIndex("lastAccessAt", "lastAccessAt", { unique: false })
        }
      }

      request.onsuccess = (event) => {
        resolve(event.target.result)
      }

      request.onerror = (event) => {
        console.warn("[OfflineCache] Error abriendo IndexedDB:", event.target?.error)
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
 * Desaloja entradas antiguas según política LRU si se sobrepasan los umbrales.
 */
export const pruneLruCache = async () => {
  if (typeof window === "undefined" || !("caches" in window)) return
  try {
    const db = await getDatabase()
    if (!db || !db.objectStoreNames.contains(STORE_TILES_META)) return

    const entries = await new Promise((resolve) => {
      const tx = db.transaction(STORE_TILES_META, "readonly")
      const store = tx.objectStore(STORE_TILES_META)
      const request = store.getAll()
      request.onsuccess = () => resolve(request.result || [])
      request.onerror = () => resolve([])
    })

    let totalBytes = entries.reduce((acc, e) => acc + (e.sizeBytes || 0), 0)
    let totalCount = entries.length

    if (totalCount <= MAX_CACHE_ENTRIES && totalBytes <= MAX_CACHE_BYTES) {
      return
    }

    // Ordenar de más antiguo a más reciente (menor lastAccessAt primero)
    entries.sort((a, b) => (a.lastAccessAt || 0) - (b.lastAccessAt || 0))

    const cache = await caches.open(TILE_CACHE_NAME)
    const toDelete = []

    for (const entry of entries) {
      if (totalCount <= TARGET_CACHE_ENTRIES && totalBytes <= TARGET_CACHE_BYTES) {
        break
      }
      toDelete.push(entry.url)
      totalCount -= 1
      totalBytes -= (entry.sizeBytes || 0)
    }

    if (toDelete.length > 0) {
      const tx = db.transaction(STORE_TILES_META, "readwrite")
      const store = tx.objectStore(STORE_TILES_META)
      for (const url of toDelete) {
        store.delete(url)
        cache.delete(url).catch(() => {})
      }
    }
  } catch (err) {
    console.warn("[OfflineCache] Error ejecutando desalojo LRU:", err)
  }
}

/**
 * Guarda una tesela de mapa o DEM en CacheStorage bajo control de cuota LRU.
 * @param {string} url
 * @param {Response} response
 */
export const cacheTile = async (url, response) => {
  if (typeof window === "undefined" || !("caches" in window)) return
  try {
    const clone = response.clone()
    let sizeBytes = 32768 // Estimación base 32 KB si no se puede leer el buffer
    try {
      if (typeof clone.arrayBuffer === "function") {
        const buf = await clone.arrayBuffer()
        if (buf && buf.byteLength) sizeBytes = buf.byteLength
      }
    } catch {
      // Usar tamaño estimado
    }

    // Si una sola respuesta supera el presupuesto total, descartar almacenamiento
    if (sizeBytes > MAX_CACHE_BYTES) {
      return
    }

    const cache = await caches.open(TILE_CACHE_NAME)
    await cache.put(url, response.clone())

    const db = await getDatabase()
    if (db && db.objectStoreNames.contains(STORE_TILES_META)) {
      const tx = db.transaction(STORE_TILES_META, "readwrite")
      const store = tx.objectStore(STORE_TILES_META)
      store.put({
        url,
        sizeBytes,
        lastAccessAt: Date.now(),
        createdAt: Date.now(),
      })
    }

    // Ejecutar verificación y desalojo LRU en segundo plano
    pruneLruCache()
  } catch (err) {
    console.warn("[OfflineCache] Error guardando tesela:", err)
  }
}

/**
 * Intenta recuperar una tesela guardada en CacheStorage y actualiza lastAccessAt.
 * @param {string} url
 * @returns {Promise<Response|null>}
 */
export const getCachedTile = async (url) => {
  if (typeof window === "undefined" || !("caches" in window)) return null
  try {
    const cache = await caches.open(TILE_CACHE_NAME)
    const match = await cache.match(url)
    if (match) {
      // Actualizar timestamp de acceso para LRU
      getDatabase().then((db) => {
        if (!db || !db.objectStoreNames.contains(STORE_TILES_META)) return
        const tx = db.transaction(STORE_TILES_META, "readwrite")
        const store = tx.objectStore(STORE_TILES_META)
        const getReq = store.get(url)
        getReq.onsuccess = () => {
          if (getReq.result) {
            getReq.result.lastAccessAt = Date.now()
            store.put(getReq.result)
          }
        }
      }).catch(() => {})
      return match
    }
    return null
  } catch (err) {
    console.warn("[OfflineCache] Error leyendo tesela de caché:", err)
    return null
  }
}

/**
 * Consulta el estado y tamaño del almacenamiento utilizado y la cuota.
 */
export const getStorageStatus = async () => {
  const status = {
    supported: false,
    originUsageBytes: null,
    originQuotaBytes: null,
    managedCacheBytes: 0,
    managedCacheEntries: 0,
  }

  if (typeof window === "undefined") return status

  // 1. Uso global del origen vía navigator.storage.estimate()
  if (typeof navigator !== "undefined" && navigator.storage && navigator.storage.estimate) {
    try {
      const estimate = await navigator.storage.estimate()
      status.supported = true
      status.originUsageBytes = estimate.usage ?? null
      status.originQuotaBytes = estimate.quota ?? null
    } catch {
      // Dejar como null
    }
  }

  // 2. Conteo de caché gestionada
  try {
    const db = await getDatabase()
    if (db && db.objectStoreNames.contains(STORE_TILES_META)) {
      const entries = await new Promise((resolve) => {
        const tx = db.transaction(STORE_TILES_META, "readonly")
        const store = tx.objectStore(STORE_TILES_META)
        const req = store.getAll()
        req.onsuccess = () => resolve(req.result || [])
        req.onerror = () => resolve([])
      })
      status.managedCacheEntries = entries.length
      status.managedCacheBytes = entries.reduce((acc, e) => acc + (e.sizeBytes || 0), 0)
    } else if ("caches" in window) {
      const cache = await caches.open(TILE_CACHE_NAME)
      const keys = await cache.keys()
      status.managedCacheEntries = keys.length
      status.managedCacheBytes = keys.length * 32768 // Estimación
    }
  } catch {
    // Estimación resiliente
  }

  return status
}

/**
 * Libera exclusivamente la memoria de mapas y DEM descargados temporalmente.
 * NO borra preferencias, ni datos del usuario, ni el shell de la aplicación.
 */
export const clearManagedTileCache = async () => {
  if (typeof window === "undefined") return { success: false }
  try {
    // 1. Borrar CacheStorage de teselas
    if ("caches" in window) {
      await caches.delete(TILE_CACHE_NAME)
    }

    // 2. Limpiar metadatos de teselas en IndexedDB
    const db = await getDatabase()
    if (db && db.objectStoreNames.contains(STORE_TILES_META)) {
      const tx = db.transaction(STORE_TILES_META, "readwrite")
      const store = tx.objectStore(STORE_TILES_META)
      store.clear()
    }

    return { success: true }
  } catch (err) {
    console.warn("[OfflineCache] Error liberando caché gestionada:", err)
    return { success: false, error: err.message }
  }
}
