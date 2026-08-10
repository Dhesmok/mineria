import * as turf from "@turf/turf"
import { getLabelCoordinates, getFeatureLabel } from "./mapUtils"

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
