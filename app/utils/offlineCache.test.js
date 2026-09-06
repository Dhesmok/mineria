import {
  cacheQueryResponse,
  getCachedQueryResponse,
  cacheTile,
  getCachedTile,
  getStorageStatus,
  clearManagedTileCache,
  MAX_CACHE_ENTRIES,
  MAX_CACHE_BYTES,
  TARGET_CACHE_ENTRIES,
  TARGET_CACHE_BYTES,
} from "./offlineCache"

describe("offlineCache", () => {
  it("define límites estrictos de cuota y desalojo según contrato de arquitectura", () => {
    expect(MAX_CACHE_ENTRIES).toBe(700)
    expect(MAX_CACHE_BYTES).toBe(60 * 1024 * 1024)
    expect(TARGET_CACHE_ENTRIES).toBe(630)
    expect(TARGET_CACHE_BYTES).toBe(54 * 1024 * 1024)
  })

  it("se maneja sin fallos si indexedDB / window no están disponibles o devuelven nulo", async () => {
    await expect(cacheQueryResponse("test-key", { foo: "bar" })).resolves.not.toThrow()
    const result = await getCachedQueryResponse("test-key")
    expect(result).toBeNull()
  })

  it("se maneja sin fallos al interactuar con cacheTile / getCachedTile", async () => {
    const mockResponse = { clone: () => ({ arrayBuffer: async () => new ArrayBuffer(1024) }) }
    await expect(cacheTile("https://example.com/tile.png", mockResponse)).resolves.not.toThrow()
    const tile = await getCachedTile("https://example.com/tile.png")
    expect(tile).toBeNull()
  })

  it("getStorageStatus devuelve estructura consistente ante entorno sin navegador nativo", async () => {
    const status = await getStorageStatus()
    expect(status).toHaveProperty("supported")
    expect(status).toHaveProperty("managedCacheBytes")
    expect(status).toHaveProperty("managedCacheEntries")
  })

  it("clearManagedTileCache se ejecuta de manera segura", async () => {
    const res = await clearManagedTileCache()
    expect(res).toHaveProperty("success")
  })
})
