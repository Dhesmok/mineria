/**
 * @jest-environment node
 */
import { GET } from "./route"

describe("/api/anm route", () => {
  afterEach(() => {
    jest.restoreAllMocks()
  })

  it("rechaza si falta el parámetro url", async () => {
    const req = new Request("http://localhost:3000/api/anm")
    const res = await GET(req)
    expect(res.status).toBe(400)
  })

  it("rechaza dominios que no sean de la ANM", async () => {
    const req = new Request(
      "http://localhost:3000/api/anm?url=" + encodeURIComponent("https://evil.com/MapServer/0?f=json"),
    )
    const res = await GET(req)
    expect(res.status).toBe(400)
  })

  it("rechaza rutas que no pertenezcan a los servicios ArcGIS permitidos", async () => {
    const req = new Request(
      "http://localhost:3000/api/anm?url=" +
        encodeURIComponent("https://annamineria.anm.gov.co/admin/login"),
    )
    const res = await GET(req)
    expect(res.status).toBe(400)
  })

  it("reenvía peticiones válidas a annamineria.anm.gov.co", async () => {
    const target =
      "https://annamineria.anm.gov.co/annageo/rest/services/SIGM/TenureLayers/MapServer/3?f=json"
    global.fetch = jest.fn(async () => ({
      ok: true,
      status: 200,
      headers: new Headers({ "content-type": "application/json;charset=UTF-8" }),
      body: JSON.stringify({ id: 3, name: "Solicitud Vigente" }),
    }))

    const req = new Request("http://localhost:3000/api/anm?url=" + encodeURIComponent(target))
    const res = await GET(req)

    expect(res.status).toBe(200)
    expect(global.fetch).toHaveBeenCalledWith(
      target,
      expect.objectContaining({ signal: expect.any(AbortSignal) }),
    )
    const json = await res.json()
    expect(json).toEqual({ id: 3, name: "Solicitud Vigente" })
  })

  it("reenvía peticiones válidas a geo.anm.gov.co", async () => {
    const target =
      "https://geo.anm.gov.co/webgis/rest/services/ANM/ServiciosANM/MapServer/3/query?where=1%3D1&f=json"
    global.fetch = jest.fn(async () => ({
      ok: true,
      status: 200,
      headers: new Headers({ "content-type": "application/geo+json;charset=UTF-8" }),
      body: JSON.stringify({ type: "FeatureCollection", features: [] }),
    }))

    const req = new Request("http://localhost:3000/api/anm?url=" + encodeURIComponent(target))
    const res = await GET(req)

    expect(res.status).toBe(200)
    const json = await res.json()
    expect(json).toEqual({ type: "FeatureCollection", features: [] })
  })
})
