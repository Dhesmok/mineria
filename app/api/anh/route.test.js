/**
 * @jest-environment node
 */
import { GET } from "./route"
import { ANH_LAYERS } from "../../utils/anhLayers"

const pedir = (query) => GET(new Request(`https://visor.test/api/anh?${query}`))

const RECUADRO = "-75,4,-73,5"

const imagen = (tipo = "image/png") =>
  Promise.resolve({ ok: true, status: 200, body: "PNG", headers: new Headers({ "content-type": tipo }) })

beforeEach(() => {
  global.fetch = jest.fn(() => imagen())
})

describe("ruta /api/anh", () => {
  it("sirve una capa válida de la ANH", async () => {
    const r = await pedir(`capa=tierras&bbox=${RECUADRO}&tam=800,600`)
    expect(r.status).toBe(200)
    expect(r.headers.get("content-type")).toBe("image/png")
  })

  it("llama al MapServer de la ANH con bboxSR=4686", async () => {
    await pedir(`capa=tierras&bbox=${RECUADRO}&tam=800,600`)
    const pedida = global.fetch.mock.calls[0][0]
    expect(pedida).toContain(ANH_LAYERS[0].service)
    expect(pedida).toContain("bboxSR=4686")
    expect(pedida).toContain(`bbox=${RECUADRO}`)
  })

  it("rechaza capas desconocidas o vacías", async () => {
    expect((await pedir(`capa=desconocida&bbox=${RECUADRO}&tam=800,600`)).status).toBe(400)
    expect((await pedir(`bbox=${RECUADRO}&tam=800,600`)).status).toBe(400)
  })

  it("rechaza recuadros inválidos", async () => {
    expect((await pedir(`capa=tierras&bbox=invalido&tam=800,600`)).status).toBe(400)
  })

  it("devuelve 502 cuando la ANH falla", async () => {
    global.fetch = jest.fn(() => Promise.resolve({ ok: false, status: 500, headers: new Headers() }))
    expect((await pedir(`capa=tierras&bbox=${RECUADRO}&tam=800,600`)).status).toBe(502)
  })

  it("devuelve 504 ante timeout", async () => {
    global.fetch = jest.fn(() => Promise.reject(Object.assign(new Error("Timeout"), { name: "AbortError" })))
    expect((await pedir(`capa=tierras&bbox=${RECUADRO}&tam=800,600`)).status).toBe(504)
  })
})
