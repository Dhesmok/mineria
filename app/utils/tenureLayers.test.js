import { findTenureLayerNumbers, resetTenureLayerCache, tenureLayerUrl } from "./tenureLayers"

const layerMetadata = { 3: "Título Vigente", 4: "Solicitud Vigente" }

const respondWithMetadata = () =>
  jest.fn(async (url) => {
    const index = Number(String(url).match(/MapServer\/(\d+)\?/)[1])
    return { ok: true, json: async () => ({ name: layerMetadata[index] ?? `Otra capa ${index}` }) }
  })

describe("findTenureLayerNumbers", () => {
  beforeEach(() => {
    resetTenureLayerCache()
    jest.spyOn(console, "error").mockImplementation(() => {})
  })

  afterEach(() => {
    jest.restoreAllMocks()
  })

  it("descubre el índice de cada capa", async () => {
    global.fetch = respondWithMetadata()

    await expect(findTenureLayerNumbers()).resolves.toEqual({
      "Título Vigente": 3,
      "Solicitud Vigente": 4,
    })
  })

  it("reutiliza la caché en llamadas posteriores", async () => {
    global.fetch = respondWithMetadata()

    await findTenureLayerNumbers()
    const callsAfterFirst = global.fetch.mock.calls.length
    await findTenureLayerNumbers()

    expect(global.fetch.mock.calls.length).toBe(callsAfterFirst)
  })

  it("comparte la consulta en vuelo entre llamadas concurrentes", async () => {
    // Antes cada llamada concurrente repetía las seis peticiones de metadatos.
    global.fetch = respondWithMetadata()

    await Promise.all([findTenureLayerNumbers(), findTenureLayerNumbers(), findTenureLayerNumbers()])

    expect(global.fetch).toHaveBeenCalledTimes(6)
  })

  it("no cachea un resultado incompleto", async () => {
    // Regresión: si fallaban todas las peticiones se guardaba {} para siempre y las
    // capas quedaban rotas hasta recargar la página.
    global.fetch = jest.fn(async () => {
      throw new Error("Network error")
    })

    await expect(findTenureLayerNumbers()).resolves.toEqual({})

    global.fetch = respondWithMetadata()
    await expect(findTenureLayerNumbers()).resolves.toEqual({
      "Título Vigente": 3,
      "Solicitud Vigente": 4,
    })
  })

  it("tolera que una sola capa falle", async () => {
    global.fetch = jest.fn(async (url) => {
      const index = Number(String(url).match(/MapServer\/(\d+)\?/)[1])
      if (index === 4) throw new Error("Network error")
      return { ok: true, json: async () => ({ name: layerMetadata[index] ?? `Otra capa ${index}` }) }
    })

    await expect(findTenureLayerNumbers()).resolves.toEqual({ "Título Vigente": 3 })
  })
})

describe("tenureLayerUrl", () => {
  it("construye la URL de la capa", () => {
    expect(tenureLayerUrl(3)).toBe(
      "https://annamineria.anm.gov.co/annageo/rest/services/SIGM/TenureLayers/MapServer/3",
    )
  })
})
