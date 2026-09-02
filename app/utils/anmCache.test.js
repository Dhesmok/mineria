import {
  anmCacheKey,
  anmCacheSize,
  boundsCacheKey,
  CACHE_TTL_MS,
  clearAnmCache,
  getFromAnmCache,
  MAX_CACHE_ENTRIES,
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
    const key = anmCacheKey(
      "https://example.com/arcgis/3",
      { west: -75.5, south: 6.2, east: -75.4, north: 6.3 },
      "TITULO_ESTADO='VIGENTE'",
    )
    expect(key).toContain("https://example.com/arcgis/3")
    expect(key).toContain("TITULO_ESTADO='VIGENTE'")
    expect(key).toContain("-75.5000,6.2000,-75.4000,6.3000")
  })

  it("almacena y recupera datos en memoria antes de que caduque el TTL", () => {
    const key = "test-key"
    const data = { featureCollection: { type: "FeatureCollection", features: [] }, truncated: false }
    const t0 = 1000000

    saveToAnmCache(key, data, t0)
    expect(anmCacheSize()).toBe(1)
    expect(getFromAnmCache(key, t0 + 1000)).toBe(data)
  })

  it("invalida la entrada cuando supera el TTL de 5 minutos", () => {
    const key = "test-expired"
    const data = { ok: true }
    const t0 = 1000000

    saveToAnmCache(key, data, t0)
    // 5 minutos y 1 milisegundo después
    const tExpirado = t0 + CACHE_TTL_MS + 1
    expect(getFromAnmCache(key, tExpirado)).toBeNull()
    expect(anmCacheSize()).toBe(0)
  })

  it("devuelve null si la clave no existe", () => {
    expect(getFromAnmCache("inexistente")).toBeNull()
  })

  it(`respeta el límite de ${MAX_CACHE_ENTRIES} entradas (LRU) desalojando la más antigua`, () => {
    for (let i = 0; i < 20; i++) {
      saveToAnmCache(`key-${i}`, { id: i }, 1000)
    }

    expect(anmCacheSize()).toBe(MAX_CACHE_ENTRIES)
    // Las primeras 8 entradas deben haber sido desalojadas
    expect(getFromAnmCache("key-0", 1000)).toBeNull()
    expect(getFromAnmCache("key-7", 1000)).toBeNull()
    // Las 12 entradas recientes deben existir
    expect(getFromAnmCache("key-19", 1000)).toEqual({ id: 19 })
  })

  it("permite limpiar la caché", () => {
    saveToAnmCache("key-1", { data: 1 }, 1000)
    saveToAnmCache("key-2", { data: 2 }, 1000)
    expect(anmCacheSize()).toBe(2)

    clearAnmCache()
    expect(anmCacheSize()).toBe(0)
    expect(getFromAnmCache("key-1", 1000)).toBeNull()
  })
})
