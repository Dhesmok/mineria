import { layerFieldsFor, resetLayerFieldsCache } from "./layerFields"

const URL_CAPA = "https://anm/MapServer/3"

beforeEach(() => {
  resetLayerFieldsCache()
  jest.spyOn(console, "error").mockImplementation(() => {})
})

afterEach(() => jest.restoreAllMocks())

describe("layerFieldsFor", () => {
  it("devuelve los nombres que la capa declara", async () => {
    global.fetch = jest.fn(async () => ({
      ok: true,
      json: async () => ({ fields: [{ name: "TITULO_ESTADO" }, { name: "AREA_HA" }] }),
    }))

    expect([...(await layerFieldsFor(URL_CAPA))]).toEqual(["TITULO_ESTADO", "AREA_HA"])
  })

  it("pregunta una sola vez por capa", async () => {
    global.fetch = jest.fn(async () => ({
      ok: true,
      json: async () => ({ fields: [{ name: "ETAPA" }] }),
    }))

    await layerFieldsFor(URL_CAPA)
    await layerFieldsFor(URL_CAPA)

    expect(global.fetch).toHaveBeenCalledTimes(1)
  })

  it("comparte la petición en vuelo", async () => {
    global.fetch = jest.fn(async () => ({
      ok: true,
      json: async () => ({ fields: [{ name: "ETAPA" }] }),
    }))

    await Promise.all([layerFieldsFor(URL_CAPA), layerFieldsFor(URL_CAPA)])

    expect(global.fetch).toHaveBeenCalledTimes(1)
  })

  it("devuelve null si no se pudo preguntar, y no lo cachea", async () => {
    // Trampa nº 3: guardar un resultado incompleto deja la capa rota hasta
    // recargar la página. Y `null` no es «esta capa no tiene campos» sino «no se
    // sabe»; quien lo reciba tiene que decidir qué hacer sin esa información.
    global.fetch = jest.fn(async () => ({ ok: false, status: 503 }))
    expect(await layerFieldsFor(URL_CAPA)).toBeNull()

    global.fetch = jest.fn(async () => ({
      ok: true,
      json: async () => ({ fields: [{ name: "ETAPA" }] }),
    }))
    expect([...(await layerFieldsFor(URL_CAPA))]).toEqual(["ETAPA"])
  })

  it("trata el error con cuerpo 200 de ArcGIS como un fallo", async () => {
    // Trampa nº 2: `response.ok` es cierto y el cuerpo es un error. Sin esto se
    // habría leído como una capa sin campos, y todo filtro sobre ella habría
    // devuelto cero resultados sin ninguna pista de por qué.
    global.fetch = jest.fn(async () => ({
      ok: true,
      json: async () => ({ error: { code: 400, message: "Invalid URL" } }),
    }))

    expect(await layerFieldsFor(URL_CAPA)).toBeNull()
  })

  it("una respuesta sin campos es un fallo, no una capa vacía", async () => {
    global.fetch = jest.fn(async () => ({ ok: true, json: async () => ({}) }))
    expect(await layerFieldsFor(URL_CAPA)).toBeNull()
  })
})
