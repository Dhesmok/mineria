import {
  buildFooter,
  exportFileName,
  formatExportDate,
  metersPerPixel,
  scaleBarFor,
} from "./imageExport"

describe("metersPerPixel", () => {
  it("en el ecuador y zoom 0, el mundo cabe en 512 píxeles", () => {
    // MapLibre define su zoom con teselas de 512, no de 256: a un mismo número
    // de zoom su escala es la mitad que en Leaflet. Comprobado contra
    // `map.unproject` en un navegador: a zoom 15 y 6,24° de latitud da
    // 2,3745 m/px, que es lo que sale de esta fórmula y la mitad de lo que
    // salía de la de 256.
    expect(metersPerPixel(0, 0) * 512).toBeCloseTo(40075016, -3)
  })

  it("coincide con lo que mide MapLibre de verdad", () => {
    expect(metersPerPixel(6.24, 15)).toBeCloseTo(2.3745, 4)
  })

  it("corrige por la latitud", () => {
    // A la latitud de Medellín (6,25°) el factor es cos(6,25°) ≈ 0,9941.
    const ecuador = metersPerPixel(0, 14)
    const medellin = metersPerPixel(6.25, 14)
    expect(medellin / ecuador).toBeCloseTo(Math.cos((6.25 * Math.PI) / 180), 6)
  })

  it("cada zoom parte a la mitad", () => {
    expect(metersPerPixel(6.25, 15)).toBeCloseTo(metersPerPixel(6.25, 14) / 2, 9)
  })
})

describe("scaleBarFor", () => {
  it("elige el salto redondo más grande que quepa", () => {
    // 100 px × 3 m/px = 300 m de margen: cabe el salto de 200, no el de 500.
    const barra = scaleBarFor(3, 100)
    expect(barra.meters).toBe(200)
    expect(barra.label).toBe("200 m")
    expect(barra.width).toBe(67)
  })

  it("pasa a kilómetros cuando toca", () => {
    expect(scaleBarFor(30, 100).label).toBe("2 km")
  })

  it("nunca inventa un número raro", () => {
    // El ojo mide comparando, y compara con números redondos: una barra que
    // diga «237 m» es correcta y no sirve.
    for (const mpp of [0.5, 1.7, 4.2, 19, 240, 3100]) {
      expect(scaleBarFor(mpp, 120).label).toMatch(/^(1|2|5)(0*)( km| m)$/)
    }
  })

  it("cuando ni el salto más pequeño cabe, usa ese igual", () => {
    // 10 m/px en 0,05 px de hueco: medio metro. Ningún salto redondo cabe, y
    // devolver null obligaría a que quien dibuja se acuerde de comprobarlo.
    const barra = scaleBarFor(10, 0.05)
    expect(barra.meters).toBe(1)
    expect(barra.label).toBe("1 m")
  })
})

describe("buildFooter", () => {
  const base = {
    crsLabel: "Origen Nacional (CTM-12)",
    crsId: "9377",
    date: new Date(2026, 7, 21),
  }

  it("dice sistema, fecha y fuentes", () => {
    const lineas = buildFooter({ ...base, sources: ["ANM"] })
    expect(lineas.join("\n")).toContain("EPSG:9377")
    expect(lineas.join("\n")).toContain("21/08/2026")
    expect(lineas.join("\n")).toContain("Fuentes: ANM")
  })

  it("nombra las capas cuando las hay", () => {
    const lineas = buildFooter({ ...base, layers: ["Títulos Vigentes", "Subcontratos"] })
    expect(lineas[0]).toBe("Capas: Títulos Vigentes · Subcontratos")
  })

  it("y se calla cuando no hay ninguna, en vez de dejar un renglón vacío", () => {
    const lineas = buildFooter(base)
    expect(lineas.some((l) => l.startsWith("Capas:"))).toBe(false)
    expect(lineas.some((l) => l.startsWith("Fuentes:"))).toBe(false)
  })

  it("el sistema de coordenadas nunca falta", () => {
    // Es el dato que hace que la imagen se pueda citar; sin él, dos personas
    // leen coordenadas distintas del mismo mapa.
    expect(buildFooter(base).some((l) => l.includes("Sistema de coordenadas"))).toBe(true)
  })
})

describe("nombre del archivo", () => {
  it("lleva la fecha y la hora, para no pisar el anterior", () => {
    expect(exportFileName(new Date(2026, 7, 21, 9, 5))).toBe("mapa-202608210905.png")
  })

  it("formatExportDate usa el orden de aquí", () => {
    expect(formatExportDate(new Date(2026, 0, 3))).toBe("03/01/2026")
  })
})
