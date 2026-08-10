import { ArcgisError, fetchArcgisJson } from "./arcgis"

describe("fetchArcgisJson", () => {
  afterEach(() => {
    jest.restoreAllMocks()
  })

  it("devuelve el cuerpo cuando la respuesta es válida", async () => {
    global.fetch = jest.fn(async () => ({ ok: true, json: async () => ({ features: [1] }) }))

    await expect(fetchArcgisJson("https://ejemplo/query")).resolves.toEqual({ features: [1] })
  })

  it("lanza cuando ArcGIS devuelve un error con HTTP 200", async () => {
    // Este es el caso que hacía pasar un fallo real por "no se encontró el expediente":
    // response.ok es true y data.features queda undefined.
    global.fetch = jest.fn(async () => ({
      ok: true,
      json: async () => ({ error: { code: 400, message: "Unable to complete operation." } }),
    }))

    await expect(fetchArcgisJson("https://ejemplo/query")).rejects.toThrow("Unable to complete operation.")
    await expect(fetchArcgisJson("https://ejemplo/query")).rejects.toBeInstanceOf(ArcgisError)
  })

  it("usa details cuando el error no trae message", async () => {
    global.fetch = jest.fn(async () => ({
      ok: true,
      json: async () => ({ error: { code: 400, details: ["Invalid field: CODIGO_EXPEDIENTE"] } }),
    }))

    await expect(fetchArcgisJson("https://ejemplo/query")).rejects.toThrow("Invalid field: CODIGO_EXPEDIENTE")
  })

  it("lanza en respuestas HTTP de error", async () => {
    global.fetch = jest.fn(async () => ({ ok: false, status: 503, json: async () => ({}) }))

    await expect(fetchArcgisJson("https://ejemplo/query")).rejects.toThrow("estado 503")
  })

  it("propaga el AbortError sin envolverlo", async () => {
    const abort = Object.assign(new Error("aborted"), { name: "AbortError" })
    global.fetch = jest.fn(async () => {
      throw abort
    })

    await expect(fetchArcgisJson("https://ejemplo/query")).rejects.toBe(abort)
  })
})
