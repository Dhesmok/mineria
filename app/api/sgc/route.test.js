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
    const r = await pedir(`capa=geologiaNacional&bbox=${RECUADRO}&tam=800,600`)
    expect(r.status).toBe(200)
    expect(r.headers.get("content-type")).toBe("image/png")
  })

  it("y pide al SGC la dirección del catálogo, no la que llegue de fuera", async () => {
    await pedir(`capa=geologiaNacional&bbox=${RECUADRO}&tam=800,600`)
    const pedida = global.fetch.mock.calls[0][0]
    expect(pedida).toContain(SGC_LAYERS[0].service)
    expect(pedida).toContain(`bbox=${RECUADRO}`)
  })

  it("rechaza una capa que no está en el catálogo", async () => {
    // **Es lo que impide que esto sea un proxy abierto.** Sin esta puerta,
    // cualquiera podría pedir lo que quisiera desde el dominio del visor, y el
    // tráfico saldría con nuestro nombre.
    expect((await pedir(`capa=otra&bbox=${RECUADRO}&tam=800,600`)).status).toBe(400)
    expect((await pedir(`bbox=${RECUADRO}&tam=800,600`)).status).toBe(400)
  })

  it("no deja colar una dirección disfrazada de clave", async () => {
    const r = await pedir(`capa=${encodeURIComponent("https://otro.sitio/x")}&bbox=${RECUADRO}&tam=800,600`)
    expect(r.status).toBe(400)
    expect(global.fetch).not.toHaveBeenCalled()
  })

  it("rechaza cualquier recuadro que no sean cuatro números", async () => {
    // Lo que llegue aquí se concatena en una dirección que sale de nuestro
    // servidor. Ahí no puede entrar nada más que números.
    const malos = ["", "1,2,3", "1,2,3,4,5", "a,b,c,d", "1,2,3,&layers=show:1", "1,2,3,4;drop"]
    for (const bbox of malos) {
      expect((await pedir(`capa=planchas&bbox=${encodeURIComponent(bbox)}&tam=800,600`)).status).toBe(400)
    }
    expect(global.fetch).not.toHaveBeenCalled()
  })

  it("acepta recuadros con decimales y negativos, que es lo que manda MapLibre", async () => {
    const r = await pedir("capa=planchas&bbox=-8400000.5,600000.25,-8300000,700000&tam=800,600")
    expect(r.status).toBe(200)
  })
})

describe("cuando el SGC falla", () => {
  it("un error del servicio no se disfraza de imagen", async () => {
    global.fetch = jest.fn(() =>
      Promise.resolve({ ok: false, status: 500, headers: new Headers() }),
    )
    expect((await pedir(`capa=planchas&bbox=${RECUADRO}&tam=800,600`)).status).toBe(502)
  })

  it("un JSON de error con código 200 tampoco", async () => {
    // **ArcGIS responde 200 con un cuerpo de error**: es la trampa nº 2 del
    // proyecto, la misma que ya costó una tanda con la ANM. Sin mirar el tipo de
    // contenido, MapLibre recibiría un JSON donde espera un PNG.
    global.fetch = jest.fn(() => imagen("application/json"))
    expect((await pedir(`capa=planchas&bbox=${RECUADRO}&tam=800,600`)).status).toBe(502)
  })

  it("y si tarda demasiado, se corta", async () => {
    global.fetch = jest.fn(() => Promise.reject(Object.assign(new Error("x"), { name: "AbortError" })))
    expect((await pedir(`capa=planchas&bbox=${RECUADRO}&tam=800,600`)).status).toBe(504)
  })
})

describe("caché", () => {
  it("deja que la red de distribución guarde la tesela mucho tiempo", async () => {
    // Un mapa geológico no cambia de una semana a otra, y el servidor del SGC es
    // público y lento: cada tesela que sirva la caché es una que no tiene que
    // dibujar él.
    const cache = (await pedir(`capa=planchas&bbox=${RECUADRO}&tam=800,600`)).headers.get("cache-control")
    expect(cache).toContain("s-maxage=604800")
    expect(cache).toContain("stale-while-revalidate")
  })
})

/** Una respuesta JSON como la que daría el SGC. */
const json = (cuerpo) =>
  Promise.resolve({
    ok: true,
    status: 200,
    body: JSON.stringify(cuerpo),
    headers: new Headers({ "content-type": "application/json; charset=utf-8" }),
  })

describe("los modos nuevos", () => {
  it("pide el árbol de capas del servicio", async () => {
    global.fetch = jest.fn(() => json({ layers: [] }))
    const r = await pedir("capa=geologiaDepartamentos&modo=meta")

    expect(r.status).toBe(200)
    expect(global.fetch.mock.calls[0][0]).toMatch(/\/MapServer\?f=json$/)
  })

  it("y la leyenda", async () => {
    global.fetch = jest.fn(() => json({ layers: [] }))
    await pedir("capa=geologiaNacional&modo=leyenda")
    expect(global.fetch.mock.calls[0][0]).toMatch(/\/legend\?f=json$/)
  })

  it("pregunta qué hay en un punto, con el mapa que se está viendo", async () => {
    // ArcGIS necesita el recuadro y el tamaño en píxeles para traducir la
    // tolerancia del clic a una distancia sobre el terreno. Sin eso, un clic al
    // lado de un contacto devolvería la unidad equivocada.
    global.fetch = jest.fn(() => json({ results: [] }))
    const r = await pedir(
      `capa=geologiaNacional&modo=identify&punto=-8400000,700000&bbox=${RECUADRO}&tam=1440,900&tol=4`,
    )

    expect(r.status).toBe(200)
    const url = global.fetch.mock.calls[0][0]
    expect(url).toContain("/identify?")
    expect(url).toContain("geometry=-8400000,700000")
    expect(url).toContain(`mapExtent=${RECUADRO}`)
    expect(url).toContain("imageDisplay=1440,900,96")
    expect(url).toContain("returnGeometry=false")
  })

  it("el identify pregunta solo por lo que se está dibujando", async () => {
    // Con `all` devolvería unidades de departamentos apagados, y la ficha diría
    // cosas que no están en el mapa.
    global.fetch = jest.fn(() => json({ results: [] }))
    await pedir(
      `capa=geologiaDepartamentos&modo=identify&punto=-8400000,700000&bbox=${RECUADRO}&tam=800,600&sub=4,5,6`,
    )
    expect(global.fetch.mock.calls[0][0]).toContain("layers=visible:4,5,6")
  })

  it("un modo que no existe se rechaza", async () => {
    expect((await pedir(`capa=planchas&modo=inventado&bbox=${RECUADRO}`)).status).toBe(400)
  })
})

describe("qué se valida antes de concatenar", () => {
  it("las subcapas solo pueden ser dígitos y comas", async () => {
    // Van a parar dentro de la dirección que sale de nuestro servidor.
    const malas = ["1;2", "show:1", "1,2)&f=html", "../../", "-1"]
    for (const sub of malas) {
      const r = await pedir(`capa=planchas&bbox=${RECUADRO}&sub=${encodeURIComponent(sub)}&tam=800,600`)
      expect(r.status).toBe(400)
    }
    expect(global.fetch).not.toHaveBeenCalled()
  })

  it("y cuando son válidas se le pasan al servicio", async () => {
    await pedir(`capa=geologiaDepartamentos&bbox=${RECUADRO}&sub=12,13,14&tam=800,600`)
    expect(global.fetch.mock.calls[0][0]).toContain("layers=show:12,13,14")
  })

  it("sin subcapas no manda el parámetro, y el servicio dibuja lo suyo", async () => {
    await pedir(`capa=planchas&bbox=${RECUADRO}&tam=800,600`)
    expect(global.fetch.mock.calls[0][0]).not.toContain("layers=")
  })

  it("el tamaño de la imagen también, y con tope", async () => {
    // Esta ruta es pública: sin tope, una petición de veinte mil píxeles de lado
    // la acabaría pagando el servidor del SGC.
    const malos = ["800", "800,alto", "0,600", "9000,9000", "-5,-5"]
    for (const tam of malos) {
      const r = await pedir(`capa=planchas&bbox=${RECUADRO}&tam=${encodeURIComponent(tam)}`)
      expect(r.status).toBe(400)
    }
    expect(global.fetch).not.toHaveBeenCalled()
  })

  it("y una imagen se pide del tamaño que se pidió, no de uno fijo", async () => {
    // Es lo que permite pedir una sola imagen del trozo visible en vez de una
    // rejilla de teselas cuadradas, que es lo que repetía los rótulos.
    await pedir(`capa=grillaPlanchas&bbox=${RECUADRO}&tam=1440,900`)
    expect(global.fetch.mock.calls[0][0]).toContain("size=1440,900")
  })

  it("el punto, el tamaño y la tolerancia también se validan", async () => {
    const base = `capa=planchas&modo=identify&bbox=${RECUADRO}&tam=800,600&tol=4`
    const casos = [
      `${base.replace("&tam=800,600", "&tam=ochocientos,600")}&punto=1,2`,
      `${base}&punto=1,2,3`,
      `${base.replace("&tol=4", "&tol=999")}&punto=1,2`,
      `${base.replace("&tol=4", "&tol=-1")}&punto=1,2`,
      `capa=planchas&modo=identify&punto=1,2&tam=800,600&tol=4`,
    ]
    for (const query of casos) {
      expect((await pedir(query)).status).toBe(400)
    }
    expect(global.fetch).not.toHaveBeenCalled()
  })
})

describe("un JSON de error del SGC no se disfraza de dato", () => {
  it("ni en meta ni en identify", async () => {
    global.fetch = jest.fn(() =>
      Promise.resolve({ ok: true, status: 200, body: "<html>", headers: new Headers({ "content-type": "text/html" }) }),
    )
    expect((await pedir("capa=planchas&modo=meta")).status).toBe(502)
    expect(
      (await pedir(`capa=planchas&modo=identify&punto=1,2&bbox=${RECUADRO}&tam=800,600&tol=4`)).status,
    ).toBe(502)
  })
})
