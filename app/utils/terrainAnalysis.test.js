import {
  ACCURACY_WARNING,
  DEM_RESOLUTION_M,
  compassName,
  metersToDegrees,
  sampleGrid,
  slopeAspectFrom,
} from "./terrainAnalysis"

/**
 * Una ventana 3×3 con un plano inclinado: `haciaEste` y `haciaNorte` son las
 * subidas en metros por celda. Los valores se colocan en el orden de
 * `sampleGrid`: fila norte, central y sur, de oeste a este.
 */
const planoInclinado = (haciaEste, haciaNorte) => {
  const alturas = []
  for (const filaNorte of [1, 0, -1]) {
    for (const columnaEste of [-1, 0, 1]) {
      alturas.push(100 + columnaEste * haciaEste + filaNorte * haciaNorte)
    }
  }
  return alturas
}

describe("slopeAspectFrom", () => {
  it("en terreno plano da cero y no inventa una orientación", () => {
    // Una ladera plana no mira a ninguna parte. Devolver 0° sería decir «mira al
    // norte», que es falso.
    const resultado = slopeAspectFrom(Array(9).fill(1500))
    expect(resultado.slopeDegrees).toBe(0)
    expect(resultado.aspectDegrees).toBeNull()
    expect(resultado.aspect).toBeNull()
  })

  it("una subida hacia el este da una ladera que mira al oeste", () => {
    // Si sube hacia el este, la pendiente baja hacia el oeste: 270°.
    const resultado = slopeAspectFrom(planoInclinado(DEM_RESOLUTION_M, 0))
    expect(resultado.aspectDegrees).toBeCloseTo(270, 6)
    expect(resultado.aspect.short).toBe("O")
  })

  it("una subida hacia el norte da una ladera que mira al sur", () => {
    const resultado = slopeAspectFrom(planoInclinado(0, DEM_RESOLUTION_M))
    expect(resultado.aspectDegrees).toBeCloseTo(180, 6)
    expect(resultado.aspect.short).toBe("S")
  })

  it("y una subida hacia el noreste, una que mira al suroeste", () => {
    const resultado = slopeAspectFrom(planoInclinado(DEM_RESOLUTION_M, DEM_RESOLUTION_M))
    expect(resultado.aspectDegrees).toBeCloseTo(225, 6)
    expect(resultado.aspect.short).toBe("SO")
  })

  it("45° cuando sube un metro por cada metro", () => {
    // Una celda de 30 m que sube 30 m es exactamente 45° y 100 %.
    const resultado = slopeAspectFrom(planoInclinado(DEM_RESOLUTION_M, 0))
    expect(resultado.slopeDegrees).toBeCloseTo(45, 6)
    expect(resultado.slopePercent).toBeCloseTo(100, 6)
  })

  it("la mitad de subida da 26,57°", () => {
    // atan(0,5) = 26,565°, y el 50 % de pendiente.
    const resultado = slopeAspectFrom(planoInclinado(DEM_RESOLUTION_M / 2, 0))
    expect(resultado.slopeDegrees).toBeCloseTo(26.565, 3)
    expect(resultado.slopePercent).toBeCloseTo(50, 6)
  })

  it("pondera doble las celdas que tocan el centro", () => {
    // Es lo que distingue a Horn de una resta entre extremos, y es lo que hace
    // que el ruido de una esquina no se lleve el resultado. Con la esquina
    // noroeste 30 m más alta, cada derivada vale 30/(8·30) = 0,125 y la
    // pendiente sale de atan(√2·0,125) = 10,02°.
    const alturas = Array(9).fill(100)
    alturas[0] = 130
    const resultado = slopeAspectFrom(alturas)
    expect(resultado.slopeDegrees).toBeCloseTo(10.02, 2)
  })

  it("sin las nueve alturas no devuelve nada", () => {
    // Pasa de verdad: en el borde del área con datos, alguna consulta al modelo
    // vuelve vacía, y un número calculado con huecos sería peor que ninguno.
    expect(slopeAspectFrom([1, 2, 3])).toBeNull()
    expect(slopeAspectFrom([100, 100, null, 100, 100, 100, 100, 100, 100])).toBeNull()
    expect(slopeAspectFrom(null)).toBeNull()
  })
})

describe("compassName", () => {
  it("reparte los ocho rumbos en sectores de 45°", () => {
    expect(compassName(0).short).toBe("N")
    expect(compassName(22).short).toBe("N")
    expect(compassName(23).short).toBe("NE")
    expect(compassName(90).short).toBe("E")
    expect(compassName(180).short).toBe("S")
    expect(compassName(315).short).toBe("NO")
    expect(compassName(350).short).toBe("N")
  })

  it("aguanta ángulos fuera de rango", () => {
    expect(compassName(365).short).toBe("N")
    expect(compassName(-90).short).toBe("O")
  })

  it("sin ángulo no devuelve rumbo", () => {
    expect(compassName(null)).toBeNull()
  })
})

describe("metersToDegrees", () => {
  it("un grado de latitud son unos 111 km, en cualquier sitio", () => {
    expect(metersToDegrees(111320, 0).dLat).toBeCloseTo(1, 6)
    expect(metersToDegrees(111320, 60).dLat).toBeCloseTo(1, 6)
  })

  it("pero uno de longitud se encoge con la latitud", () => {
    // Sin esta corrección la ventana de muestreo saldría rectangular y la
    // pendiente sesgada hacia una dirección.
    expect(metersToDegrees(111320, 0).dLon).toBeCloseTo(1, 6)
    expect(metersToDegrees(111320, 60).dLon).toBeCloseTo(2, 6)
  })
})

describe("sampleGrid", () => {
  it("devuelve nueve puntos, con el consultado en el centro", () => {
    const puntos = sampleGrid([-75.57, 6.24])
    expect(puntos).toHaveLength(9)
    expect(puntos[4][0]).toBeCloseTo(-75.57, 9)
    expect(puntos[4][1]).toBeCloseTo(6.24, 9)
  })

  it("con la fila norte primero y de oeste a este", () => {
    const [noroeste, , noreste, , , , suroeste] = sampleGrid([0, 0])
    expect(noroeste[1]).toBeGreaterThan(suroeste[1])
    expect(noroeste[0]).toBeLessThan(noreste[0])
  })
})

describe("el aviso de precisión", () => {
  it("dice para qué no sirve, no solo para qué sirve", () => {
    expect(ACCURACY_WARNING).toMatch(/no para diseño de bancos|estabilidad/)
    expect(ACCURACY_WARNING).toContain("30 m")
  })
})
