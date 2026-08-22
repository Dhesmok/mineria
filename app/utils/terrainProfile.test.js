import { lengthInMeters } from "./measure"
import {
  MAX_SAMPLES,
  MIN_SAMPLES,
  profileFrom,
  sampleAtDistance,
  sampleCountFor,
  samplePointsAlong,
  slopeAtSample,
} from "./terrainProfile"

/** Una línea este-oeste en la zona de Medellín, del largo que se pida. */
const lineaDe = (metros) => {
  // A esta latitud un grado de longitud son unos 110.900 m sobre CTM-12.
  const grados = metros / 110900
  return [
    [-75.6, 6.24],
    [-75.6 + grados, 6.24],
  ]
}

describe("sampleCountFor", () => {
  it("una muestra cada diez metros, que ya es tres veces más fino que el modelo", () => {
    expect(sampleCountFor(1000)).toBe(101)
  })

  it("nunca menos del mínimo, para que una línea corta siga dando una curva", () => {
    expect(sampleCountFor(5)).toBe(MIN_SAMPLES)
    expect(sampleCountFor(0)).toBe(MIN_SAMPLES)
  })

  it("ni más del máximo, para que una línea larguísima no cueste más que las demás", () => {
    // Es la lección de la capa de pendiente: veinte mil muestras bloquean el
    // navegador diez segundos.
    expect(sampleCountFor(500000)).toBe(MAX_SAMPLES)
  })
})

describe("samplePointsAlong", () => {
  it("devuelve puntos equiespaciados con su distancia acumulada", () => {
    const puntos = samplePointsAlong(lineaDe(1000), 11)
    expect(puntos).toHaveLength(11)
    expect(puntos[0].distance).toBe(0)
    // Los tramos son todos iguales.
    const saltos = puntos.slice(1).map((p, i) => p.distance - puntos[i].distance)
    saltos.forEach((salto) => expect(salto).toBeCloseTo(saltos[0], 6))
  })

  it("la longitud coincide con la que mide la herramienta de medir", () => {
    // Es la razón de que este módulo proyecte a CTM-12 y no calcule por su
    // cuenta: dos cifras distintas para la misma línea se leen como un error.
    const linea = lineaDe(2500)
    const puntos = samplePointsAlong(linea, 50)
    const medida = lengthInMeters({ type: "LineString", coordinates: linea })
    expect(puntos[puntos.length - 1].distance).toBeCloseTo(medida, 3)
  })

  it("reparte por distancia y no por vértice", () => {
    // Una línea con un tramo largo y otro corto: el detalle tiene que ser el
    // mismo en los dos, o el perfil saldría fino donde se hizo clic muchas
    // veces y grueso donde no.
    const linea = [
      [-75.6, 6.24],
      [-75.5, 6.24],
      [-75.499, 6.24],
    ]
    const puntos = samplePointsAlong(linea, 21)
    const saltos = puntos.slice(1).map((p, i) => p.distance - puntos[i].distance)
    saltos.forEach((salto) => expect(salto).toBeCloseTo(saltos[0], 4))
  })

  it("sin dos vértices válidos no hay perfil", () => {
    expect(samplePointsAlong([])).toEqual([])
    expect(samplePointsAlong([[-75.6, 6.24]])).toEqual([])
    expect(samplePointsAlong(null)).toEqual([])
  })

  it("una línea de longitud cero tampoco", () => {
    expect(samplePointsAlong([[-75.6, 6.24], [-75.6, 6.24]])).toEqual([])
  })
})

describe("slopeAtSample", () => {
  /** Muestras cada 10 m sobre una rampa de la pendiente que se pida. */
  const rampa = (grados, n = 40) => {
    const paso = 10
    const m = Math.tan((grados * Math.PI) / 180)
    return Array.from({ length: n }, (_, i) => ({
      distance: i * paso,
      elevation: 1000 + i * paso * m,
    }))
  }

  it("mide la pendiente de una rampa conocida", () => {
    expect(slopeAtSample(rampa(30), 20)).toBeCloseTo(30, 6)
    expect(slopeAtSample(rampa(5), 20)).toBeCloseTo(5, 6)
  })

  it("da lo mismo cuesta arriba que cuesta abajo", () => {
    expect(slopeAtSample(rampa(-25), 20)).toBeCloseTo(25, 6)
  })

  it("mide sobre una ventana de al menos una celda del modelo", () => {
    // Con muestras cada 10 m sobre un modelo de 30, dos vecinas caen en la misma
    // celda: su diferencia es ruido. Una sola muestra alterada no puede mover la
    // pendiente de toda la ventana como lo haría comparando con la de al lado.
    const puntos = rampa(0)
    puntos[20].elevation += 3
    const conRuido = slopeAtSample(puntos, 20)
    const vecinaALaVecina = (Math.atan(3 / 10) * 180) / Math.PI
    expect(conRuido).toBeLessThan(vecinaALaVecina)
  })

  it("sin altura no hay pendiente", () => {
    const puntos = rampa(20)
    puntos[20].elevation = null
    expect(slopeAtSample(puntos, 20)).toBeNull()
  })
})

describe("profileFrom", () => {
  const puntos = (n) =>
    Array.from({ length: n }, (_, i) => ({ lng: -75.6 + i * 0.001, lat: 6.24, distance: i * 100 }))

  it("resume un cerro: sube y baja", () => {
    // Diez puntos: sube 200 m y baja 200 m. El desnivel entre extremos es cero,
    // pero el ascenso acumulado no, y esa diferencia es justo lo que hay que
    // saber para planear un recorrido.
    const alturas = [1000, 1100, 1200, 1300, 1400, 1200, 1100, 1050, 1000, 1000]
    const { stats } = profileFrom(puntos(10), alturas)

    expect(stats.min).toBe(1000)
    expect(stats.max).toBe(1400)
    expect(stats.drop).toBe(0)
    expect(stats.gain).toBe(400)
    expect(stats.loss).toBe(400)
    expect(stats.length).toBe(900)
    expect(stats.coverage).toBe(1)
  })

  it("no inventa las alturas que faltan", () => {
    // El modelo llega por teselas y puede que parte del recorrido no haya
    // llegado. Rellenar esos huecos daría un perfil creíble y falso.
    const alturas = [1000, null, null, 1300, 1400]
    const { points, stats } = profileFrom(puntos(5), alturas)

    expect(points[1].elevation).toBeNull()
    expect(stats.coverage).toBeCloseTo(0.6, 6)
  })

  it("no cuenta desnivel a través de un hueco", () => {
    // Entre el punto 0 y el 3 hay dos sin dato: sumar su diferencia sería contar
    // como desnivel el salto entre dos puntos que pueden estar lejísimos.
    const { stats } = profileFrom(puntos(5), [1000, null, null, 1300, 1310])
    expect(stats.gain).toBe(10)
  })

  it("sin puntos suficientes no devuelve nada", () => {
    expect(profileFrom([], [])).toBeNull()
    expect(profileFrom(puntos(1), [1000])).toBeNull()
  })
})

describe("sampleAtDistance", () => {
  const puntos = Array.from({ length: 11 }, (_, i) => ({ distance: i * 100, elevation: 1000 + i }))

  it("encuentra la muestra más cercana", () => {
    expect(sampleAtDistance(puntos, 0).distance).toBe(0)
    expect(sampleAtDistance(puntos, 149).distance).toBe(100)
    expect(sampleAtDistance(puntos, 151).distance).toBe(200)
    expect(sampleAtDistance(puntos, 1000).distance).toBe(1000)
  })

  it("aguanta valores fuera del recorrido", () => {
    expect(sampleAtDistance(puntos, -50).distance).toBe(0)
    expect(sampleAtDistance(puntos, 99999).distance).toBe(1000)
  })

  it("y valores imposibles", () => {
    expect(sampleAtDistance(puntos, NaN)).toBeNull()
    expect(sampleAtDistance([], 10)).toBeNull()
  })
})
