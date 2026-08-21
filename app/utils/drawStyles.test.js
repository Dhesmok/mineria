import { LAYER_PALETTE } from "./colors"
import { DEFAULT_DRAWING_COLOR, DRAW_PALETTE } from "./drawStyles"

describe("paleta del dibujo", () => {
  it("empieza por el color con el que se dibuja de fábrica", () => {
    // Si no estuviera, la muestra que enseña el panel no coincidiría con ninguna
    // de la cuadrícula y parecería que no hay nada elegido.
    expect(DRAW_PALETTE[0]).toBe(DEFAULT_DRAWING_COLOR)
  })

  it("incluye entera la paleta de las capas", () => {
    // Es lo que permite pintar un área propia del mismo color que una capa para
    // compararlas.
    LAYER_PALETTE.forEach((color) => expect(DRAW_PALETTE).toContain(color))
  })

  it("añade colores que no están en la de capas", () => {
    // La de capas es apagada a propósito para que los títulos no compitan con el
    // mapa; lo que se dibuja tiene que verse por encima de ellos.
    const propios = DRAW_PALETTE.filter((color) => !LAYER_PALETTE.includes(color))
    expect(propios.length).toBeGreaterThan(0)
  })

  it("no repite ningún color", () => {
    expect(new Set(DRAW_PALETTE).size).toBe(DRAW_PALETTE.length)
  })

  it("llena filas justas de siete, que es como se dibuja", () => {
    expect(DRAW_PALETTE.length % 7).toBe(0)
  })
})
