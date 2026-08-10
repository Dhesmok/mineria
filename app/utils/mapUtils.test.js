import * as turf from "@turf/turf"
import { createPopupContent, extractRings, formatDegrees, getLabelCoordinates, getFeatureLabel } from "./mapUtils"

const polygonFeature = (coordinates) => ({
  type: "Feature",
  properties: {},
  geometry: { type: "Polygon", coordinates },
})

// Título minero típico: cuadrado de ~3 km de lado cerca de Medellín.
const SQUARE_3KM = [
  [
    [-75.6, 6.2],
    [-75.57, 6.2],
    [-75.57, 6.23],
    [-75.6, 6.23],
    [-75.6, 6.2],
  ],
]

// Polígono cóncavo en "L": el centroide cae fuera, así que exige un punto interior real.
const L_SHAPE = [
  [
    [-75.6, 6.2],
    [-75.57, 6.2],
    [-75.57, 6.23],
    [-75.585, 6.23],
    [-75.585, 6.21],
    [-75.6, 6.21],
    [-75.6, 6.2],
  ],
]

describe("getLabelCoordinates", () => {
  it.each([
    ["cuadrado de 3 km", SQUARE_3KM],
    ["polígono cóncavo en L", L_SHAPE],
    ["polígono pequeño de 500 m", [[[-74.1, 4.6], [-74.0955, 4.6], [-74.0955, 4.6045], [-74.1, 4.6045], [-74.1, 4.6]]]],
  ])("ubica la etiqueta estrictamente dentro de un %s", (_name, coordinates) => {
    const point = getLabelCoordinates(polygonFeature(coordinates))

    expect(point).not.toBeNull()
    expect(
      turf.booleanPointInPolygon(turf.point([point[0], point[1]]), turf.polygon(coordinates), {
        ignoreBoundary: true,
      }),
    ).toBe(true)
  })

  it("no devuelve un vértice del borde (regresión: polylabel con precisión de 0.1°)", () => {
    const point = getLabelCoordinates(polygonFeature(SQUARE_3KM))
    const corners = SQUARE_3KM[0]

    corners.forEach((corner) => {
      expect(turf.distance(turf.point([point[0], point[1]]), turf.point(corner), { units: "meters" })).toBeGreaterThan(
        100,
      )
    })
  })

  it("queda a menos de un metro del punto interior óptimo", () => {
    const point = getLabelCoordinates(polygonFeature(SQUARE_3KM))
    const optimal = turf.centerOfMass(turf.polygon(SQUARE_3KM)).geometry.coordinates

    expect(
      turf.distance(turf.point([point[0], point[1]]), turf.point(optimal), { units: "meters" }),
    ).toBeLessThan(1)
  })

  it("elige la parte más grande de un MultiPolygon", () => {
    const small = [[[-75.5, 6.3], [-75.499, 6.3], [-75.499, 6.301], [-75.5, 6.301], [-75.5, 6.3]]]
    const feature = {
      type: "Feature",
      properties: {},
      geometry: { type: "MultiPolygon", coordinates: [small, SQUARE_3KM] },
    }

    const point = getLabelCoordinates(feature)

    expect(
      turf.booleanPointInPolygon(turf.point([point[0], point[1]]), turf.polygon(SQUARE_3KM), {
        ignoreBoundary: true,
      }),
    ).toBe(true)
  })

  it("ignora las partes degeneradas de un MultiPolygon en vez de lanzar", () => {
    const degenerate = [[[-75.5, 6.3], [-75.499, 6.3], [-75.5, 6.3]]]
    const feature = {
      type: "Feature",
      properties: {},
      geometry: { type: "MultiPolygon", coordinates: [degenerate, SQUARE_3KM] },
    }

    const point = getLabelCoordinates(feature)

    expect(
      turf.booleanPointInPolygon(turf.point([point[0], point[1]]), turf.polygon(SQUARE_3KM), {
        ignoreBoundary: true,
      }),
    ).toBe(true)
  })

  it("devuelve null en vez de lanzar cuando el anillo es degenerado", () => {
    // Antes turf.polygon lanzaba aquí y esri-leaflet abortaba el lote completo de features.
    expect(getLabelCoordinates(polygonFeature([[[-75.6, 6.2], [-75.57, 6.2], [-75.6, 6.2]]]))).toBeNull()
  })

  it("devuelve null para geometrías ausentes o vacías", () => {
    expect(getLabelCoordinates(undefined)).toBeNull()
    expect(getLabelCoordinates({ type: "Feature", properties: {} })).toBeNull()
    expect(getLabelCoordinates(polygonFeature([]))).toBeNull()
  })

  it("usa la propia geometría para un punto, no la Isla Nula", () => {
    const feature = {
      type: "Feature",
      properties: {},
      geometry: { type: "Point", coordinates: [-75.5, 6.2] },
    }

    expect(getLabelCoordinates(feature)).toEqual([-75.5, 6.2])
  })
})

describe("extractRings", () => {
  const collection = (...features) => ({ type: "FeatureCollection", features })
  const polygon = (coordinates) => ({ type: "Feature", properties: {}, geometry: { type: "Polygon", coordinates } })

  it("quita el vértice de cierre repetido", () => {
    // Regresión: la comprobación anterior comparaba ring[0] === ring[ring.length - 1],
    // dos arreglos distintos, así que siempre era falsa y el duplicado se colaba en la
    // tabla de coordenadas y en los marcadores de vértices.
    const rings = extractRings(collection(polygon(SQUARE_3KM)))

    expect(rings).toHaveLength(1)
    expect(rings[0].coordinates).toHaveLength(4)
    expect(rings[0].coordinates[0]).not.toEqual(rings[0].coordinates[3])
  })

  it("conserva el anillo tal cual si no viene cerrado", () => {
    const open = [[[-75.6, 6.2], [-75.57, 6.2], [-75.57, 6.23], [-75.6, 6.23]]]

    expect(extractRings(collection(polygon(open)))[0].coordinates).toHaveLength(4)
  })

  it("separa el contorno exterior de los huecos", () => {
    const withHole = [
      [[-75.6, 6.2], [-75.5, 6.2], [-75.5, 6.3], [-75.6, 6.3], [-75.6, 6.2]],
      [[-75.58, 6.22], [-75.56, 6.22], [-75.56, 6.24], [-75.58, 6.24], [-75.58, 6.22]],
    ]

    const rings = extractRings(collection(polygon(withHole)))

    expect(rings.map((ring) => ring.label)).toEqual(["Polígono 1", "Polígono 1 · hueco 1"])
    expect(rings.map((ring) => ring.isHole)).toEqual([false, true])
  })

  it("numera las partes de un MultiPolygon", () => {
    const multi = {
      type: "Feature",
      properties: {},
      geometry: {
        type: "MultiPolygon",
        coordinates: [SQUARE_3KM, [[[-74.1, 4.6], [-74.09, 4.6], [-74.09, 4.61], [-74.1, 4.61], [-74.1, 4.6]]]],
      },
    }

    expect(extractRings(collection(multi)).map((ring) => ring.label)).toEqual(["Polígono 1", "Polígono 2"])
  })

  it("recorre todas las features, no solo la primera", () => {
    // Antes solo se procesaba data.features[0] y el resto se perdía en la tabla,
    // en los vértices y en la exportación.
    const second = [[[-74.1, 4.6], [-74.09, 4.6], [-74.09, 4.61], [-74.1, 4.61], [-74.1, 4.6]]]

    const rings = extractRings(collection(polygon(SQUARE_3KM), polygon(second)))

    expect(rings).toHaveLength(2)
    expect(rings.map((ring) => ring.polygonNumber)).toEqual([1, 2])
  })

  it("devuelve una lista vacía para entradas inservibles", () => {
    expect(extractRings(undefined)).toEqual([])
    expect(extractRings({ features: [] })).toEqual([])
    expect(extractRings(collection({ type: "Feature", properties: {} }))).toEqual([])
    expect(extractRings(collection({ geometry: { type: "Point", coordinates: [-75, 6] } }))).toEqual([])
  })
})

describe("formatDegrees", () => {
  it("usa cinco decimales y coma decimal", () => {
    expect(formatDegrees(-75.123456)).toBe("-75,12346")
    expect(formatDegrees(6.2)).toBe("6,20000")
  })
})

describe("getFeatureLabel", () => {
  it("prefiere TENURE_ID", () => {
    expect(getFeatureLabel({ TENURE_ID: "ABC-123", CODIGO_EXPEDIENTE: "XYZ" })).toBe("ABC-123")
  })

  it("cae a CODIGO_EXPEDIENTE en las capas que no exponen TENURE_ID", () => {
    expect(getFeatureLabel({ CODIGO_EXPEDIENTE: "XYZ-987" })).toBe("XYZ-987")
  })

  it("devuelve N/A sin lanzar cuando no hay propiedades", () => {
    expect(getFeatureLabel(undefined)).toBe("N/A")
    expect(getFeatureLabel({})).toBe("N/A")
  })
})

describe("createPopupContent", () => {
  it("escapa los atributos que vienen del servicio", () => {
    // Los atributos se interpolan directamente en el HTML del popup.
    const html = createPopupContent({
      TENURE_ID: '<script>alert(1)</script>',
      SOLICITANTES_O_TITULARES: 'Minas "El Roble" & Cía',
    })

    expect(html).not.toContain("<script>")
    expect(html).toContain("&lt;script&gt;")
    expect(html).toContain("Minas &quot;El Roble&quot; &amp; Cía")
  })

  it("no lanza sin propiedades", () => {
    expect(() => createPopupContent()).not.toThrow()
    expect(createPopupContent()).toContain("N/A")
  })
})
