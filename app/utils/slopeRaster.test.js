import {
  SAMPLE_STEP_PX,
  SLOPE_ALPHA,
  SLOPE_LEGEND,
  SLOPE_MIN_ZOOM,
  slopeColorFor,
  slopeGridFrom,
  slopePixels,
  slopeUnavailableReason,
} from "./slopeRaster"

/** Una rejilla que sube `porCelda` metros hacia el este. */
const rampaEste = (cols, rows, porCelda) => {
  const alturas = new Float32Array(cols * rows)
  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < cols; col++) alturas[row * cols + col] = col * porCelda
  }
  return alturas
}

describe("slopeGridFrom", () => {
  it("un plano que sube un metro por metro da 45° en todas partes", () => {
    const espaciado = 30
    const grid = slopeGridFrom(rampaEste(6, 5, espaciado), 6, 5, espaciado)
    grid.forEach((valor) => expect(valor).toBeCloseTo(45, 6))
  })

  it("terreno plano da cero", () => {
    const grid = slopeGridFrom(new Float32Array(20).fill(1500), 5, 4, 30)
    grid.forEach((valor) => expect(valor).toBe(0))
  })

  it("en los bordes extrapola, y no deja una franja falsa de terreno suave", () => {
    // Repetir la celda del borde deja el gradiente a la mitad en el anillo
    // exterior: en una ladera uniforme de 45°, el borde saldría de 26°, y con
    // una rejilla de 8 px eso es una franja falsa rodeando toda la pantalla.
    const grid = slopeGridFrom(rampaEste(4, 4, 30), 4, 4, 30)
    expect(grid.every((valor) => Number.isFinite(valor))).toBe(true)
    expect(grid[0]).toBeCloseTo(45, 6)
    expect(grid[grid.length - 1]).toBeCloseTo(45, 6)
  })

  it("donde falta una altura, no inventa un número", () => {
    const alturas = rampaEste(4, 4, 30)
    alturas[5] = NaN
    const grid = slopeGridFrom(alturas, 4, 4, 30)
    expect(Number.isNaN(grid[0])).toBe(true)
  })
})

describe("slopeColorFor", () => {
  it("cada tramo tiene su color", () => {
    expect(slopeColorFor(2)).toEqual([...SLOPE_LEGEND[0].color, SLOPE_ALPHA])
    expect(slopeColorFor(10)).toEqual([...SLOPE_LEGEND[1].color, SLOPE_ALPHA])
    expect(slopeColorFor(20)).toEqual([...SLOPE_LEGEND[2].color, SLOPE_ALPHA])
    expect(slopeColorFor(40)).toEqual([...SLOPE_LEGEND[3].color, SLOPE_ALPHA])
    expect(slopeColorFor(70)).toEqual([...SLOPE_LEGEND[4].color, SLOPE_ALPHA])
  })

  it("los cortes van al tramo de arriba", () => {
    // 5° exactos son «suave», no «plano»: si no, el límite pertenecería a los
    // dos tramos según de dónde se mire.
    expect(slopeColorFor(5)).toEqual([...SLOPE_LEGEND[1].color, SLOPE_ALPHA])
  })

  it("sin dato, transparente", () => {
    expect(slopeColorFor(NaN)).toEqual([0, 0, 0, 0])
    expect(slopeColorFor(null)).toEqual([0, 0, 0, 0])
  })

  it("deja ver el mapa por debajo", () => {
    expect(SLOPE_ALPHA).toBeLessThan(255)
    expect(SLOPE_ALPHA).toBeGreaterThan(80)
  })
})

describe("slopePixels", () => {
  it("cuatro bytes por celda, en orden", () => {
    const pixeles = slopePixels(new Float32Array([2, NaN]))
    expect(pixeles).toHaveLength(8)
    expect([...pixeles.slice(0, 4)]).toEqual([...SLOPE_LEGEND[0].color, SLOPE_ALPHA])
    expect([...pixeles.slice(4)]).toEqual([0, 0, 0, 0])
  })
})

describe("cuándo no se dibuja", () => {
  const bien = { zoom: 15, pitch: 0, metrosPorPixel: 3 }

  it("con el mapa plano y cerca, sí se dibuja", () => {
    expect(slopeUnavailableReason(bien)).toBeNull()
  })

  it("con la cámara inclinada, no, y dice por qué", () => {
    // La capa se coloca sobre el rectángulo de pantalla; inclinada, ese
    // rectángulo no es un rectángulo en el terreno.
    const motivo = slopeUnavailableReason({ ...bien, pitch: 45 })
    expect(motivo).toMatch(/mapa plano/)
  })

  it("y por debajo del zoom mínimo tampoco", () => {
    const motivo = slopeUnavailableReason({ ...bien, zoom: SLOPE_MIN_ZOOM - 1 })
    expect(motivo).toMatch(/Acerca el mapa/)
  })

  it("ni cuando la rejilla saldría más gruesa que el modelo", () => {
    // 40 m/px × 8 px de rejilla = 320 m entre muestras, diez veces el modelo.
    const motivo = slopeUnavailableReason({ ...bien, metrosPorPixel: 40 })
    expect(motivo).toMatch(/Acerca el mapa/)
  })

  it("la rejilla es lo bastante fina para que valga la pena", () => {
    expect(SAMPLE_STEP_PX).toBeLessThanOrEqual(10)
  })
})
