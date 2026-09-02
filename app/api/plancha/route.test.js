/**
 * @jest-environment node
 */
import { GET, maxDuration } from "./route"

/**
 * La ruta que trae el PDF de una plancha.
 *
 * Lo que se comprueba aquí no es que el archivo llegue —eso depende del gestor
 * documental del SGC, que este entorno no alcanza— sino las tres decisiones que
 * ya han fallado una vez cada una: cuánto puede durar la función, que se pida
 * cifrado y se baje a claro solo si hace falta, y que un fallo del SGC llegue al
 * visor con su motivo en vez de disfrazado.
 *
 * Qué direcciones se aceptan se prueba aparte, en `utils/planchaUrl.test.js`.
 */

const PDF = "http://recordcenter.sgc.gov.co/B4/1301/0101242461300002.pdf"
const pedir = (url = PDF) =>
  GET(new Request(`https://visor.test/api/plancha?url=${encodeURIComponent(url)}`))

/** Una respuesta como la que daría el gestor documental. */
const documento = () =>
  Promise.resolve({
    ok: true,
    status: 200,
    body: "%PDF-1.4",
    headers: new Headers({ "content-type": "application/pdf" }),
  })

afterEach(() => {
  jest.restoreAllMocks()
})

describe("cuánto puede durar", () => {
  it("declara un tope holgado a la plataforma", () => {
    // **Esto es lo que hacía fallar unas planchas sí y otras no.** Sin
    // declararlo, Vercel corta la función a los diez segundos y una hoja de
    // diecisiete megas traída de un servidor lento muere a mitad de la descarga.
    // La prueba está para que nadie lo quite creyendo que no hace nada.
    expect(maxDuration).toBeGreaterThanOrEqual(30)
  })
})

describe("cifrado primero, claro después", () => {
  it("pide en https aunque la ficha del SGC dé la dirección en http", async () => {
    global.fetch = jest.fn(() => documento())
    await pedir()
    expect(global.fetch).toHaveBeenCalledTimes(1)
    expect(global.fetch.mock.calls[0][0]).toMatch(/^https:\/\/recordcenter\.sgc\.gov\.co\//)
  })

  it("baja a http si el intento cifrado no llega a haber respuesta", async () => {
    // El caso real: el gestor documental publica en http pelado y puede no
    // atender en el 443.
    global.fetch = jest
      .fn()
      .mockRejectedValueOnce(new TypeError("fetch failed"))
      .mockImplementation(() => documento())
    const r = await pedir()
    expect(r.status).toBe(200)
    expect(global.fetch.mock.calls[1][0]).toMatch(/^http:\/\//)
  })

  it("y también si contesta cifrado pero con un error", async () => {
    global.fetch = jest
      .fn()
      .mockResolvedValueOnce({ ok: false, status: 404, headers: new Headers() })
      .mockImplementation(() => documento())
    const r = await pedir()
    expect(r.status).toBe(200)
    expect(global.fetch.mock.calls[1][0]).toMatch(/^http:\/\//)
  })
})

describe("qué se le dice al visor cuando falla", () => {
  it("el estado del SGC, y no un fallo genérico", async () => {
    global.fetch = jest.fn(() =>
      Promise.resolve({ ok: false, status: 404, headers: new Headers() }),
    )
    const r = await pedir()
    expect(r.status).toBe(502)
    expect(await r.text()).toContain("404")
  })

  it("una página de error del gestor documental no es un PDF", async () => {
    // Es lo que devuelve cuando el documento no existe: un 200 con HTML dentro,
    // que sin esta comprobación llegaría al navegador como si fuera la plancha.
    global.fetch = jest.fn(() =>
      Promise.resolve({
        ok: true,
        status: 200,
        body: "<html>",
        headers: new Headers({ "content-type": "text/html" }),
      }),
    )
    const r = await pedir()
    expect(r.status).toBe(502)
    expect(await r.text()).toMatch(/no devolvió un PDF/i)
  })

  it("distingue tardar de no poder hablar", async () => {
    global.fetch = jest.fn(() => {
      const fallo = new Error("abortado")
      fallo.name = "AbortError"
      return Promise.reject(fallo)
    })
    const r = await pedir()
    expect(r.status).toBe(504)
    expect(await r.text()).toMatch(/tardó/i)
  })

  it("una dirección que no es del Estado no sale de aquí", async () => {
    global.fetch = jest.fn(() => documento())
    const r = await pedir("https://ejemplo.com/plancha.pdf")
    expect(r.status).toBe(400)
    expect(global.fetch).not.toHaveBeenCalled()
  })
})
