import {
  anmCacheKey,
  anmCacheSize,
  boundsCacheKey,
  clearAnmCache,
  getFromAnmCache,
  saveToAnmCache,
} from "./anmCache"

describe("anmCache", () => {
  beforeEach(() => {
    clearAnmCache()
  })

  it("genera claves de bounds formateadas y estables", () => {
    expect(boundsCacheKey(null)).toBe("global")
    expect(
      boundsCacheKey({
        west: -75.123456,
        south: 6.123456,
        east: -74.987654,
        north: 6.987654,
      }),
    ).toBe("-75.1235,6.1235,-74.9877,6.9877")
  })

  it("genera clave de consulta combinando url, where y bounds", () => {
    const key = anmCacheKey("https://example.com/arcgis/3", { west: -75.5, south: 6.2, east: -75.4, north: 6.3 }, "TITULO_ESTADO='VIGENTE'")
    expect(key).toContain("https://example.com/arcgis/3")
    expect(key).toContain("TITULO_ESTADO='VIGENTE'")
    expect(key).toContain("-75.5000,6.2000,-75.4000,6.3000")
  })

  it("almacena y recupera datos en memoria", () => {
    const key = "test-key"
    const data = { featureCollection: { type: "FeatureCollection", features: [] }, truncated: false }

    saveToAnmCache(key, data)
    expect(anmCacheSize()).toBe(1)
    expect(getFromAnmCache(key)).toBe(data)
  })

  it("devuelve null si la clave no existe", () => {
    expect(getFromAnmCache("inexistente")).toBeNull()
  })

  it("respeta el límite máximo de entradas (LRU) desalojando la más antigua", () => {
    for (let i = 0; i < 70; i++) {
      saveToAnmCache(`key-${i}`, { id: i })
    }

    expect(anmCacheSize()).toBe(64)
    // Las primeras 6 entradas deben haber sido desalojadas
    expect(getFromAnmCache("key-0")).toBeNull()
    expect(getFromAnmCache("key-5")).toBeNull()
    // Las entradas recientes deben existir
    expect(getFromAnmCache("key-69")).toEqual({ id: 69 })
  })

  it("permite limpiar la caché", () => {
    saveToAnmCache("key-1", { data: 1 })
    saveToAnmCache("key-2", { data: 2 })
    expect(anmCacheSize()).toBe(2)

    clearAnmCache()
    expect(anmCacheSize()).toBe(0)
    expect(getFromAnmCache("key-1")).toBeNull()
  })
})
