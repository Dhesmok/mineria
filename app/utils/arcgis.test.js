import {
  ArcgisError,
  ServiceUnavailableError,
  describeLayerFailure,
  fetchArcgisJson,
  toAnmFetchUrl,
} from "./arcgis"

describe("toAnmFetchUrl", () => {
  it("envuelve las URLs de annamineria.anm.gov.co y geo.anm.gov.co por /api/anm en navegador", () => {
    const u1 = "https://annamineria.anm.gov.co/annageo/rest/services/SIGM/TenureLayers/MapServer/3?f=json"
    const u2 = "https://geo.anm.gov.co/webgis/rest/services/ANM/ServiciosANM/MapServer/3?f=json"
    expect(toAnmFetchUrl(u1, true)).toBe(`/api/anm?url=${encodeURIComponent(u1)}`)
    expect(toAnmFetchUrl(u2, true)).toBe(`/api/anm?url=${encodeURIComponent(u2)}`)
  })

  it("deja intactas las URLs que no son de la ANM", () => {
    expect(toAnmFetchUrl("https://ejemplo/query", true)).toBe("https://ejemplo/query")
  })
})

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

describe("toAnmFetchUrl en modo fresco", () => {
  it("añade fresco=1 para que la CDN no sirva una copia vieja", () => {
    const u = "https://geo.anm.gov.co/webgis/rest/services/ANM/ServiciosANM/MapServer/3/query?f=json"
    expect(toAnmFetchUrl(u, true, true)).toBe(`/api/anm?url=${encodeURIComponent(u)}&fresco=1`)
  })
})

describe("un servicio caído no se confunde con un mapa vacío", () => {
  afterEach(() => jest.restoreAllMocks())

  it("sin red es ServiceUnavailableError", async () => {
    global.fetch = jest.fn(async () => {
      throw new TypeError("Failed to fetch")
    })
    await expect(fetchArcgisJson("https://ejemplo/query")).rejects.toBeInstanceOf(ServiceUnavailableError)
  })

  it("un 502 o 504 del intermediario también, con su explicación", async () => {
    global.fetch = jest.fn(async () => ({
      ok: false,
      status: 504,
      text: async () => "El servicio de la ANM tardó demasiado en responder.",
    }))
    const fallo = fetchArcgisJson("https://ejemplo/query")
    await expect(fallo).rejects.toBeInstanceOf(ServiceUnavailableError)
    await expect(fetchArcgisJson("https://ejemplo/query")).rejects.toThrow(/tardó demasiado/)
  })

  it("un 400 es un error normal, no una caída", async () => {
    global.fetch = jest.fn(async () => ({ ok: false, status: 400, text: async () => "" }))
    const error = await fetchArcgisJson("https://ejemplo/query").catch((e) => e)
    expect(error).not.toBeInstanceOf(ServiceUnavailableError)
  })

  it("abortar sigue siendo abortar", async () => {
    global.fetch = jest.fn(async () => {
      throw Object.assign(new Error("aborted"), { name: "AbortError" })
    })
    const error = await fetchArcgisJson("https://ejemplo/query").catch((e) => e)
    expect(error.name).toBe("AbortError")
  })

  it("no le pasa a fetch la opción fresh, que no entiende", async () => {
    global.fetch = jest.fn(async () => ({ ok: true, json: async () => ({}) }))
    await fetchArcgisJson("https://ejemplo/query", { fresh: true, signal: undefined })
    expect(global.fetch.mock.calls[0][1]).not.toHaveProperty("fresh")
  })

  it("el aviso dice que un mapa vacío no es una zona libre", () => {
    expect(describeLayerFailure(new ServiceUnavailableError("x"), "la ANM")).toMatch(
      /ANM no responde.*NO significa que la zona esté libre/,
    )
    expect(describeLayerFailure(new Error("campo raro"))).toMatch(/campo raro/)
  })
})
