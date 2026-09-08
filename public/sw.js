// Service Worker para Visor Geológico y Minero - PWA / Caching Offline

const CACHE_NAMES = {
  STATIC: "visor-static-v2",
  TILES: "visor-tiles-v2",
  DATA: "visor-data-v2",
}

const STATIC_ASSETS = [
  "/",
  "/manifest.json",
  "/favicon.ico",
  "/maplibre/maplibre-gl-worker.mjs",
  "/maplibre/maplibre-gl-shared.mjs",
  "/pdfjs/pdf.worker.min.mjs",
]

// Límite acotado para evitar saturación de memoria en móviles (Astra Contract)
const MAX_TILES_IN_SW = 700
const TARGET_TILES_IN_SW = 630

async function trimTileCache() {
  try {
    const cache = await caches.open(CACHE_NAMES.TILES)
    const keys = await cache.keys()
    if (keys.length > MAX_TILES_IN_SW) {
      const deleteCount = keys.length - TARGET_TILES_IN_SW
      const toDelete = keys.slice(0, deleteCount)
      await Promise.all(toDelete.map((k) => cache.delete(k)))
    }
  } catch (err) {
    console.warn("[SW] Error recortando caché de teselas:", err)
  }
}

self.addEventListener("message", (event) => {
  if (event.data && event.data.type === "CLEAR_TILE_CACHE") {
    caches.delete(CACHE_NAMES.TILES).then(() => {
      event.ports?.[0]?.postMessage({ success: true })
    })
  }
})

// Instalación: cachear recursos críticos de App Shell
self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAMES.STATIC).then((cache) => {
      return cache.addAll(STATIC_ASSETS).catch((err) => {
        console.warn("[SW] Advertencia al precachear assets estáticos:", err)
      })
    })
  )
  self.skipWaiting()
})

// Activación: limpieza de cachés antiguas
self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys.map((key) => {
          if (!Object.values(CACHE_NAMES).includes(key)) {
            return caches.delete(key)
          }
        })
      )
    )
  )
  self.clients.claim()
})

// Manejo de peticiones de red (Fetch)
self.addEventListener("fetch", (event) => {
  const url = new URL(event.request.url)

  // Ignorar peticiones que no sean GET
  if (event.request.method !== "GET") return

  // Las planchas geológicas en PDF son archivos pesados (30-60 MB) que deben transmitirse
  // directamente sin pasar por la caché del Service Worker ni clonarse en memoria,
  // evitando agotar cuotas de almacenamiento y bloqueos en dispositivos móviles.
  if (url.pathname.startsWith("/api/plancha")) return

  // 1. Teselas de mapa (raster, vector, DEM elevation) -> CacheFirst con fallback a red
  if (
    url.hostname.includes("tile") ||
    url.pathname.includes("/demTiles") ||
    url.pathname.endsWith(".pbf") ||
    url.pathname.endsWith(".png") ||
    url.pathname.endsWith(".jpg") ||
    url.pathname.endsWith(".webp")
  ) {
    event.respondWith(
      caches.open(CACHE_NAMES.TILES).then(async (cache) => {
        const cachedResponse = await cache.match(event.request)
        if (cachedResponse) return cachedResponse

        try {
          const networkResponse = await fetch(event.request)
          if (networkResponse && networkResponse.status === 200) {
            cache.put(event.request, networkResponse.clone())
            trimTileCache()
          }
          return networkResponse
        } catch {
          // Si está offline y no está en caché, responder respuesta vacía o fallback
          return cachedResponse || new Response("", { status: 504, statusText: "Offline" })
        }
      })
    )
    return
  }

  // 2. Servicios de datos ArcGIS REST (ANM, SGC, ANH) y API routes -> NetworkFirst con fallback a caché
  if (
    url.hostname.includes("anm.gov.co") ||
    url.hostname.includes("sgc.gov.co") ||
    url.pathname.startsWith("/api/")
  ) {
    event.respondWith(
      fetch(event.request)
        .then((networkResponse) => {
          if (networkResponse && networkResponse.status === 200) {
            const responseToCache = networkResponse.clone()
            caches.open(CACHE_NAMES.DATA).then((cache) => {
              cache.put(event.request, responseToCache)
            })
          }
          return networkResponse
        })
        .catch(() => {
          return caches.match(event.request).then((cachedResponse) => {
            return (
              cachedResponse ||
              new Response(
                JSON.stringify({ error: "Offline", offlineFallback: true, features: [] }),
                { headers: { "Content-Type": "application/json" } }
              )
            )
          })
        })
    )
    return
  }

  // 3. Peticiones de App Shell (JS, CSS, HTML, Workers) -> CacheFirst con actualización Stale-While-Revalidate
  event.respondWith(
    caches.match(event.request).then((cachedResponse) => {
      const fetchPromise = fetch(event.request)
        .then((networkResponse) => {
          if (networkResponse && networkResponse.status === 200) {
            caches.open(CACHE_NAMES.STATIC).then((cache) => {
              cache.put(event.request, networkResponse.clone())
            })
          }
          return networkResponse
        })
        .catch(() => cachedResponse)

      return cachedResponse || fetchPromise
    })
  )
})
