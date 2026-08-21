import { anchorToViewport, popoverWidth } from "./popoverPosition"

const pantalla = { width: 1440, height: 900 }
const telefono = { width: 412, height: 839 }

describe("anchorToViewport", () => {
  it("coloca la ventana justo debajo del botón", () => {
    const { top, left } = anchorToViewport(
      { left: 300, bottom: 200 },
      { width: 304, height: 400 },
      pantalla,
    )
    expect(top).toBe(206)
    expect(left).toBe(300)
  })

  it("no la deja salirse por la derecha", () => {
    // El fallo real: en un teléfono de 412 px, una ventana de 304 anclada a un
    // botón en x=112 se salía cuatro píxeles.
    const { left } = anchorToViewport(
      { left: 112, bottom: 300 },
      { width: 304, height: 400 },
      telefono,
    )
    expect(left + 304).toBeLessThanOrEqual(telefono.width)
  })

  it("ni por abajo", () => {
    const { top } = anchorToViewport(
      { left: 20, bottom: 800 },
      { width: 300, height: 400 },
      telefono,
    )
    expect(top + 400).toBeLessThanOrEqual(telefono.height)
  })

  it("nunca la pega al borde, aunque no quepa", () => {
    // Una ventana más alta que la pantalla: al menos que no empiece fuera.
    const { top, left } = anchorToViewport(
      { left: -50, bottom: 10 },
      { width: 900, height: 2000 },
      telefono,
    )
    expect(top).toBe(12)
    expect(left).toBe(12)
  })

  it("aguanta sin recuadro de anclaje", () => {
    // Pasa cuando la ventana se abre por teclado y no por un clic.
    expect(anchorToViewport(null, { width: 300, height: 200 }, pantalla)).toEqual({
      top: 12,
      left: 12,
    })
  })
})

describe("popoverWidth", () => {
  it("usa el ancho preferido cuando cabe", () => {
    expect(popoverWidth(304, 1440)).toBe(304)
  })

  it("y lo recorta al ancho de la pantalla menos los márgenes", () => {
    expect(popoverWidth(304, 412)).toBe(304)
    expect(popoverWidth(304, 320)).toBe(296)
  })

  it("nunca devuelve un ancho negativo", () => {
    expect(popoverWidth(304, 10)).toBe(0)
  })
})
