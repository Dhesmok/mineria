/**
 * @jest-environment node
 */
import { GET } from "./route"
import { SGC_LAYERS } from "../../utils/sgcLayers"

/**
 * La ruta que hace de intermediaria con el SGC.
 *
 * Lo que se comprueba aquí no es que las imágenes lleguen —eso depende de un
 * servidor del Estado que este entorno no puede alcanzar— sino que la ruta no se
 * pueda usar para otra cosa, y que un fallo del SGC no se disfrace de éxito.
 */

const pedir = (query) => GET(new Request(`https://visor.test/api/sgc?${query}`))

const RECUADRO = "-8400000,600000,-8300000,700000"

/** Una respuesta como la que daría el SGC. */
const imagen = (tipo = "image/png") =>
  Promise.resolve({ ok: true, status: 200, body: "PNG", headers: new Headers({ "content-type": tipo }) })

beforeEach(() => {
  global.fetch = jest.fn(() => imagen())
})

describe("qué acepta", () => {
  it("sirve una capa del catálogo", async () => {
    const r = await pedir(`capa=geologiaNacional&bbox=${RECUADRO}`)
    expect(r.status).toBe(200)
    expect(r.headers.get("content-type")).toBe("image/png")
  })

  it("y pide al SGC la dirección del catálogo, no la que llegue de fuera", async () => {
    await pedir(`capa=geologiaNacional&bbox=${RECUADRO}`)
    const pedida = global.fetch.mock.calls[0][0]
    expect(pedida).toContain(SGC_LAYERS[0].service)
    expect(pedida).toContain(`bbox=${RECUADRO}`)
  })

  it("rechaza una capa que no está en el catálogo", async () => {
    // **Es lo que impide que esto sea un proxy abierto.** Sin esta puerta,
    // cualquiera podría pedir lo que quisiera desde el dominio del visor, y el
    // tráfico saldría con nuestro nombre.
    expect((await pedir(`capa=otra&bbox=${RECUADRO}`)).status).toBe(400)
    expect((await pedir(`bbox=${RECUADRO}`)).status).toBe(400)
  })

  it("no deja colar una dirección disfrazada de clave", async () => {
    const r = await pedir(`capa=${encodeURIComponent("https://otro.sitio/x")}&bbox=${RECUADRO}`)
    expect(r.status).toBe(400)
    expect(global.fetch).not.toHaveBeenCalled()
  })

  it("rechaza cualquier recuadro que no sean cuatro números", async () => {
    // Lo que llegue aquí se concatena en una dirección que sale de nuestro
    // servidor. Ahí no puede entrar nada más que números.
    const malos = ["", "1,2,3", "1,2,3,4,5", "a,b,c,d", "1,2,3,&layers=show:1", "1,2,3,4;drop"]
    for (const bbox of malos) {
      expect((await pedir(`capa=planchas&bbox=${encodeURIComponent(bbox)}`)).status).toBe(400)
    }
    expect(global.fetch).not.toHaveBeenCalled()
  })

  it("acepta recuadros con decimales y negativos, que es lo que manda MapLibre", async () => {
    const r = await pedir("capa=planchas&bbox=-8400000.5,600000.25,-8300000,700000")
    expect(r.status).toBe(200)
  })
})

describe("cuando el SGC falla", () => {
  it("un error del servicio no se disfraza de imagen", async () => {
    global.fetch = jest.fn(() =>
      Promise.resolve({ ok: false, status: 500, headers: new Headers() }),
    )
    expect((await pedir(`capa=planchas&bbox=${RECUADRO}`)).status).toBe(502)
  })

  it("un JSON de error con código 200 tampoco", async () => {
    // **ArcGIS responde 200 con un cuerpo de error**: es la trampa nº 2 del
    // proyecto, la misma que ya costó una tanda con la ANM. Sin mirar el tipo de
    // contenido, MapLibre recibiría un JSON donde espera un PNG.
    global.fetch = jest.fn(() => imagen("application/json"))
    expect((await pedir(`capa=planchas&bbox=${RECUADRO}`)).status).toBe(502)
  })

  it("y si tarda demasiado, se corta", async () => {
    global.fetch = jest.fn(() => Promise.reject(Object.assign(new Error("x"), { name: "AbortError" })))
    expect((await pedir(`capa=planchas&bbox=${RECUADRO}`)).status).toBe(504)
  })
})

describe("caché", () => {
  it("deja que la red de distribución guarde la tesela mucho tiempo", async () => {
    // Un mapa geológico no cambia de una semana a otra, y el servidor del SGC es
    // público y lento: cada tesela que sirva la caché es una que no tiene que
    // dibujar él.
    const cache = (await pedir(`capa=planchas&bbox=${RECUADRO}`)).headers.get("cache-control")
    expect(cache).toContain("s-maxage=604800")
    expect(cache).toContain("stale-while-revalidate")
  })
})
