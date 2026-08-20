import { parseCoordinateInput } from "./coordinateInput"

// Un punto conocido de Medellín, con el que se comprueban todas las formas de
// escribirlo: 6,2308 N — 75,5906 W.
const MEDELLIN = { lat: 6.2308, lon: -75.5906 }

const expectMedellin = (result) => {
  expect(result.error).toBeUndefined()
  expect(result.lat).toBeCloseTo(MEDELLIN.lat, 4)
  expect(result.lon).toBeCloseTo(MEDELLIN.lon, 4)
}

describe("parseCoordinateInput", () => {
  it("entiende decimales con punto separados por coma", () => {
    expectMedellin(parseCoordinateInput("6.2308, -75.5906", "4686"))
  })

  it("entiende decimales con coma separados por espacio", () => {
    // La forma en que se escribe un número en español. Aquí las comas son
    // decimales, no separadores.
    expectMedellin(parseCoordinateInput("6,2308 -75,5906", "4686"))
  })

  it("entiende decimales con coma y además coma de separación", () => {
    expectMedellin(parseCoordinateInput("6,2308, -75,5906", "4686"))
  })

  it("entiende decimales con coma sin ningún espacio", () => {
    // El caso realmente ambiguo: cuatro comas y ningún espacio. Se rearma por
    // pares.
    expectMedellin(parseCoordinateInput("6,2308,-75,5906", "4686"))
  })

  it("entiende grados, minutos y segundos", () => {
    expectMedellin(parseCoordinateInput("6°13'50.9\"N 75°35'26.2\"W", "4686"))
  })

  it("acepta la O de Oeste, que es como se escribe en español", () => {
    expectMedellin(parseCoordinateInput("6°13'50.9\"N 75°35'26.2\"O", "4686"))
  })

  it("usa las letras del rumbo para ordenar el par, aunque venga al revés", () => {
    // Escrito longitud primero. Sin mirar las letras, el punto acabaría en el
    // Índico.
    expectMedellin(parseCoordinateInput("75°35'26.2\"W 6°13'50.9\"N", "4686"))
  })

  it("respeta el signo negativo aunque no haya letra de rumbo", () => {
    const result = parseCoordinateInput("6°13'50.9\" -75°35'26.2\"", "4686")
    expectMedellin(result)
  })

  it("lee un par en metros de un sistema plano y lo devuelve en geográficas", () => {
    // Ida y vuelta: se convierte el punto de Medellín a CTM-12, se escribe como
    // lo haría el usuario —norte y luego este— y tiene que volver al mismo sitio.
    const { fromGeographic } = require("./crs")
    const [este, norte] = fromGeographic([MEDELLIN.lon, MEDELLIN.lat], "9377")

    expectMedellin(parseCoordinateInput(`${Math.round(norte)} ${Math.round(este)}`, "9377"))
  })

  it("no confunde el orden de los ejes en un sistema plano", () => {
    // Norte y este intercambiados: el punto se va lejísimos, y eso es justo lo
    // que el aviso tiene que detectar.
    const { fromGeographic } = require("./crs")
    const [este, norte] = fromGeographic([MEDELLIN.lon, MEDELLIN.lat], "9377")

    const alReves = parseCoordinateInput(`${Math.round(este)} ${Math.round(norte)}`, "9377")
    expect(alReves.error).toBeUndefined()
    expect(alReves.outsideColombia).toBe(true)
  })

  it("marca un punto fuera de Colombia sin rechazarlo", () => {
    // Madrid. No es un error —alguien puede querer mirar allá—, pero casi
    // siempre es un tecleo equivocado y hay que decirlo.
    const result = parseCoordinateInput("40.4168 -3.7038", "4686")
    expect(result.error).toBeUndefined()
    expect(result.outsideColombia).toBe(true)
  })

  it("no marca nada raro en un punto que sí está en Colombia", () => {
    expect(parseCoordinateInput("6,2308 -75,5906", "4686").outsideColombia).toBe(false)
  })

  it("rechaza el texto vacío", () => {
    expect(parseCoordinateInput("   ", "4686").error).toBeTruthy()
  })

  it("rechaza lo que no son dos números", () => {
    expect(parseCoordinateInput("por allá arriba", "4686").error).toBeTruthy()
    expect(parseCoordinateInput("6.2308", "4686").error).toBeTruthy()
  })

  it("rechaza una latitud imposible", () => {
    expect(parseCoordinateInput("120 -75", "4686").error).toBeTruthy()
  })
})
