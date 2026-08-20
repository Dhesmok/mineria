import { areaInHectares, areaInSquareMeters, lengthInMeters } from "./measure"

// Cuadrado de 0,01° de lado cerca del meridiano central de CTM-12 (-73°), a la
// latitud de Bogotá. Ahí la deformación de la proyección es mínima, así que se
// puede contrastar contra el valor teórico.
const square = (lon, lat, size) => [
  [
    [lon, lat],
    [lon + size, lat],
    [lon + size, lat + size],
    [lon, lat + size],
    [lon, lat],
  ],
]

const polygon = (coordinates) => ({ type: "Polygon", coordinates })

describe("areaInSquareMeters", () => {
  it("mide un cuadrado de tamaño conocido", () => {
    // 0,01° de latitud son ~1.106 m. En longitud, a 4,6°N, ~1.109 m.
    // El área ronda entonces 1,22 km². Se comprueba con holgura del 1 %.
    const metros = areaInSquareMeters(polygon(square(-73, 4.6, 0.01)))
    expect(metros).toBeGreaterThan(1_215_000)
    expect(metros).toBeLessThan(1_240_000)
  })

  it("da lo mismo con el anillo abierto que cerrado", () => {
    // Lo que dibuja el usuario no siempre repite el primer vértice al final.
    const cerrado = square(-73, 4.6, 0.01)
    const abierto = [cerrado[0].slice(0, -1)]

    expect(areaInSquareMeters(polygon(abierto))).toBeCloseTo(
      areaInSquareMeters(polygon(cerrado)),
      6,
    )
  })

  it("no depende del sentido de giro", () => {
    const horario = square(-73, 4.6, 0.01)
    const antihorario = [[...horario[0]].reverse()]

    expect(areaInSquareMeters(polygon(antihorario))).toBeCloseTo(
      areaInSquareMeters(polygon(horario)),
      6,
    )
  })

  it("resta los huecos en vez de sumarlos", () => {
    // Trampa conocida del proyecto: un hueco cuenta como área del polígono si se
    // trata como un contorno más. Un título con un hueco saldría con más área de
    // la que tiene.
    const contorno = square(-73, 4.6, 0.02)[0]
    const hueco = square(-72.995, 4.605, 0.005)[0]

    const sinHueco = areaInSquareMeters(polygon([contorno]))
    const conHueco = areaInSquareMeters(polygon([contorno, hueco]))
    const areaHueco = areaInSquareMeters(polygon([hueco]))

    expect(conHueco).toBeLessThan(sinHueco)
    expect(conHueco).toBeCloseTo(sinHueco - areaHueco, 3)
  })

  it("resta el hueco aunque venga con el giro equivocado", () => {
    // GeoJSON pide que los huecos giren al revés que el contorno, pero no todos
    // los servicios lo respetan.
    const contorno = square(-73, 4.6, 0.02)[0]
    const hueco = square(-72.995, 4.605, 0.005)[0]
    const huecoAlReves = [...hueco].reverse()

    expect(areaInSquareMeters(polygon([contorno, hueco]))).toBeCloseTo(
      areaInSquareMeters(polygon([contorno, huecoAlReves])),
      6,
    )
  })

  it("nunca devuelve un área negativa", () => {
    // Huecos mayores que el contorno: sin datos coherentes, cero es la única
    // respuesta que significa algo.
    const contorno = square(-73, 4.6, 0.005)[0]
    const huecoEnorme = square(-73, 4.6, 0.02)[0]

    expect(areaInSquareMeters(polygon([contorno, huecoEnorme]))).toBe(0)
  })

  it("suma las partes de un multipolígono", () => {
    const a = square(-73, 4.6, 0.01)
    const b = square(-72.9, 4.6, 0.01)

    const multi = { type: "MultiPolygon", coordinates: [a, b] }
    expect(areaInSquareMeters(multi)).toBeCloseTo(
      areaInSquareMeters(polygon(a)) + areaInSquareMeters(polygon(b)),
      3,
    )
  })

  it("devuelve cero para geometrías sin área", () => {
    expect(areaInSquareMeters({ type: "LineString", coordinates: [[-73, 4], [-72, 4]] })).toBe(0)
    expect(areaInSquareMeters(null)).toBe(0)
    expect(areaInSquareMeters(polygon([[[-73, 4], [-72, 4]]]))).toBe(0)
  })
})

describe("areaInHectares", () => {
  it("convierte a la unidad en que se habla de títulos", () => {
    const geometria = polygon(square(-73, 4.6, 0.01))
    expect(areaInHectares(geometria)).toBeCloseTo(areaInSquareMeters(geometria) / 10000, 6)
  })
})

describe("lengthInMeters", () => {
  it("mide un tramo de longitud conocida", () => {
    // 0,01° de latitud sobre el meridiano central: ~1.106 m, menos el factor de
    // escala 0,9992 de CTM-12.
    const metros = lengthInMeters({
      type: "LineString",
      coordinates: [
        [-73, 4.6],
        [-73, 4.61],
      ],
    })
    expect(metros).toBeGreaterThan(1090)
    expect(metros).toBeLessThan(1120)
  })

  it("suma todos los tramos de una línea quebrada", () => {
    const dosTramos = lengthInMeters({
      type: "LineString",
      coordinates: [
        [-73, 4.6],
        [-73, 4.61],
        [-73, 4.62],
      ],
    })
    const unTramo = lengthInMeters({
      type: "LineString",
      coordinates: [
        [-73, 4.6],
        [-73, 4.61],
      ],
    })

    expect(dosTramos).toBeCloseTo(unTramo * 2, 0)
  })

  it("devuelve cero para geometrías que no son lineales", () => {
    expect(lengthInMeters(polygon(square(-73, 4.6, 0.01)))).toBe(0)
    expect(lengthInMeters(null)).toBe(0)
  })
})
