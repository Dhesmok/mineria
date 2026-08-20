import { darken, hexToRgb, LAYER_PALETTE, readableInk, rgbToHex } from "./colors"

describe("hexToRgb", () => {
  it("lee un color de seis dígitos", () => {
    expect(hexToRgb("#A46F48")).toEqual([164, 111, 72])
  })

  it("lee la forma corta de tres dígitos", () => {
    expect(hexToRgb("#abc")).toEqual([170, 187, 204])
  })

  it("acepta el color sin almohadilla", () => {
    expect(hexToRgb("A46F48")).toEqual([164, 111, 72])
  })

  it("devuelve null ante algo que no es un color", () => {
    expect(hexToRgb("rojo")).toBeNull()
    expect(hexToRgb("#12345")).toBeNull()
    expect(hexToRgb(undefined)).toBeNull()
  })
})

describe("rgbToHex", () => {
  it("vuelve al punto de partida", () => {
    expect(rgbToHex(hexToRgb("#A46F48"))).toBe("#a46f48")
  })

  it("recorta los valores fuera de rango en vez de producir basura", () => {
    expect(rgbToHex([-40, 300, 12.6])).toBe("#00ff0d")
  })
})

describe("darken", () => {
  it("oscurece hacia el negro", () => {
    // Un 50 % de cada canal.
    expect(darken("#808080", 0.5)).toBe("#404040")
  })

  it("con 0 deja el color igual", () => {
    expect(darken("#A46F48", 0)).toBe("#a46f48")
  })

  it("con 1 llega al negro", () => {
    expect(darken("#A46F48", 1)).toBe("#000000")
  })

  it("devuelve el valor original si no es un color", () => {
    expect(darken("azul")).toBe("azul")
  })

  it("siempre oscurece de verdad, para que el borde se distinga del relleno", () => {
    // Es lo que hace legible un polígono: si el borde saliera igual que el
    // relleno, la figura perdería su contorno sobre el satélite.
    LAYER_PALETTE.forEach((color) => {
      const borde = darken(color, 0.35)
      expect(borde).not.toBe(color.toLowerCase())
      const [r, g, b] = hexToRgb(borde)
      const [R, G, B] = hexToRgb(color)
      expect(r + g + b).toBeLessThan(R + G + B)
    })
  })
})

describe("readableInk", () => {
  it("pone tinta oscura sobre un color claro", () => {
    expect(readableInk("#FFF0AF")).toBe("#111827")
    expect(readableInk("#ffffff")).toBe("#111827")
  })

  it("pone tinta blanca sobre un color oscuro", () => {
    expect(readableInk("#22577A")).toBe("#ffffff")
    expect(readableInk("#000000")).toBe("#ffffff")
  })

  it("cada color de la paleta tiene una tinta legible encima", () => {
    LAYER_PALETTE.forEach((color) => {
      expect(["#111827", "#ffffff"]).toContain(readableInk(color))
    })
  })
})
