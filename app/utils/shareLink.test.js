import {
  applySharedLayers,
  buildShareUrl,
  parseSharedLayers,
  withoutSharedLayers,
} from "./shareLink"

const CONOCIDAS = ["title", "request", "sgcGeologia"]

describe("parseSharedLayers", () => {
  it("lee las capas del enlace y descarta las que el visor no conoce", () => {
    expect(parseSharedLayers("#vista=12/6.2/-75.5&capas=title,inventada,request", CONOCIDAS)).toEqual([
      "title",
      "request",
    ])
  })

  it("sin parámetro no dice nada: se respetan las preferencias de quien abre", () => {
    expect(parseSharedLayers("#vista=12/6.2/-75.5", CONOCIDAS)).toBeNull()
    expect(parseSharedLayers("", CONOCIDAS)).toBeNull()
  })

  it("con el parámetro vacío pide todo apagado", () => {
    expect(parseSharedLayers("#capas=", CONOCIDAS)).toEqual([])
  })

  it("no repite una capa nombrada dos veces", () => {
    expect(parseSharedLayers("#capas=title,title", CONOCIDAS)).toEqual(["title"])
  })
})

describe("applySharedLayers", () => {
  const capas = {
    title: { on: false, opacity: 0.4, fillColor: "#aa0000" },
    request: { on: true, opacity: 0.6, fillColor: "#00aa00" },
  }

  it("solo cambia el interruptor, no el color ni la opacidad de quien abre", () => {
    const aplicado = applySharedLayers(capas, ["title"])
    expect(aplicado.title).toEqual({ on: true, opacity: 0.4, fillColor: "#aa0000" })
    expect(aplicado.request.on).toBe(false)
    expect(aplicado.request.fillColor).toBe("#00aa00")
  })

  it("sin capas en el enlace deja el estado como estaba", () => {
    expect(applySharedLayers(capas, null)).toBe(capas)
  })
})

describe("withoutSharedLayers", () => {
  it("quita las capas y conserva la vista sin codificarla", () => {
    expect(withoutSharedLayers("#vista=12/6.2/-75.5&capas=title")).toBe("#vista=12/6.2/-75.5")
  })

  it("deja vacío si no queda nada", () => {
    expect(withoutSharedLayers("#capas=title")).toBe("")
  })
})

describe("buildShareUrl", () => {
  it("añade las capas encendidas a la vista que ya escribe MapLibre", () => {
    expect(
      buildShareUrl("https://visor.com/#vista=12.5/6.25/-75.56/30/60", ["title", "request"]),
    ).toBe("https://visor.com/#vista=12.5/6.25/-75.56/30/60&capas=title,request")
  })

  it("reemplaza unas capas viejas en vez de sumarlas", () => {
    expect(buildShareUrl("https://visor.com/#vista=9/6/-75&capas=request", ["title"])).toBe(
      "https://visor.com/#vista=9/6/-75&capas=title",
    )
  })

  it("sin capas encendidas no deja un parámetro colgando", () => {
    expect(buildShareUrl("https://visor.com/#vista=9/6/-75", [])).toBe("https://visor.com/#vista=9/6/-75")
  })

  it("la vuelta completa: lo que se comparte es lo que se lee", () => {
    const url = buildShareUrl("https://visor.com/?x=1#vista=9/6/-75", ["sgcGeologia"])
    expect(parseSharedLayers(new URL(url).hash, CONOCIDAS)).toEqual(["sgcGeologia"])
  })
})
