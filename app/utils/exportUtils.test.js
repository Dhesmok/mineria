import { buildKml, escapeXml } from "./exportUtils"

const SQUARE = [
  [-75.6, 6.2],
  [-75.57, 6.2],
  [-75.57, 6.23],
  [-75.6, 6.23],
  [-75.6, 6.2],
]

const HOLE = [
  [-75.59, 6.21],
  [-75.58, 6.21],
  [-75.58, 6.22],
  [-75.59, 6.22],
  [-75.59, 6.21],
]

const SECOND_PART = [
  [-74.1, 4.6],
  [-74.09, 4.6],
  [-74.09, 4.61],
  [-74.1, 4.61],
  [-74.1, 4.6],
]

const collection = (...features) => ({ type: "FeatureCollection", features })
const feature = (geometry, properties = { TENURE_ID: "ABC-123" }) => ({ type: "Feature", properties, geometry })

const coordinateBlocks = (kml) => [...kml.matchAll(/<coordinates>([^<]*)<\/coordinates>/g)].map((m) => m[1])

describe("buildKml", () => {
  it("exporta un Polygon simple", () => {
    const kml = buildKml(collection(feature({ type: "Polygon", coordinates: [SQUARE] })), "ABC-123")

    expect(kml).toContain('<?xml version="1.0" encoding="UTF-8"?>')
    expect(kml).toContain("<name>ABC-123</name>")
    expect(coordinateBlocks(kml)).toEqual([SQUARE.map(([lon, lat]) => `${lon},${lat},0`).join(" ")])
  })

  it("exporta cada parte de un MultiPolygon dentro de un MultiGeometry", () => {
    // Regresión: la versión anterior emitía features[0].geometry.coordinates[0], que en
    // un MultiPolygon es un arreglo de anillos, y producía una línea de coordenadas
    // corrupta como "-75.6,6.2,-75.57,6.2,0".
    const kml = buildKml(
      collection(feature({ type: "MultiPolygon", coordinates: [[SQUARE], [SECOND_PART]] })),
      "ABC-123",
    )

    expect(kml).toContain("<MultiGeometry>")
    expect((kml.match(/<Polygon>/g) || []).length).toBe(2)

    const blocks = coordinateBlocks(kml)
    expect(blocks).toHaveLength(2)
    blocks.forEach((block) => {
      block.split(" ").forEach((tuple) => {
        expect(tuple).toMatch(/^-?\d+(\.\d+)?,-?\d+(\.\d+)?,0$/)
      })
    })
  })

  it("conserva los huecos como innerBoundaryIs", () => {
    const kml = buildKml(collection(feature({ type: "Polygon", coordinates: [SQUARE, HOLE] })), "ABC-123")

    expect((kml.match(/<outerBoundaryIs>/g) || []).length).toBe(1)
    expect((kml.match(/<innerBoundaryIs>/g) || []).length).toBe(1)
    expect(coordinateBlocks(kml)).toHaveLength(2)
  })

  it("exporta todas las features, no solo la primera", () => {
    const kml = buildKml(
      collection(
        feature({ type: "Polygon", coordinates: [SQUARE] }, { TENURE_ID: "UNO" }),
        feature({ type: "Polygon", coordinates: [SECOND_PART] }, { CODIGO_EXPEDIENTE: "DOS" }),
      ),
      "ABC-123",
    )

    expect((kml.match(/<Placemark>/g) || []).length).toBe(2)
    expect(kml).toContain("<name>UNO</name>")
    expect(kml).toContain("<name>DOS</name>")
  })

  it("cierra el anillo si el origen no lo trae cerrado", () => {
    const open = SQUARE.slice(0, -1)
    const kml = buildKml(collection(feature({ type: "Polygon", coordinates: [open] })), "ABC-123")
    const tuples = coordinateBlocks(kml)[0].split(" ")

    expect(tuples).toHaveLength(5)
    expect(tuples[0]).toBe(tuples[tuples.length - 1])
  })

  it("devuelve null cuando no hay geometrías exportables", () => {
    expect(buildKml(undefined, "ABC")).toBeNull()
    expect(buildKml(collection(), "ABC")).toBeNull()
    expect(buildKml(collection(feature({ type: "Point", coordinates: [-75, 6] })), "ABC")).toBeNull()
  })

  it("escapa el XML de los nombres", () => {
    const kml = buildKml(
      collection(feature({ type: "Polygon", coordinates: [SQUARE] }, { TENURE_ID: 'A & B <x>' })),
      'Doc "1"',
    )

    expect(kml).toContain("<name>A &amp; B &lt;x&gt;</name>")
    expect(kml).toContain("<name>Doc &quot;1&quot;</name>")
  })
})

describe("escapeXml", () => {
  it("escapa los cinco caracteres reservados", () => {
    expect(escapeXml(`&<>"'`)).toBe("&amp;&lt;&gt;&quot;&apos;")
  })

  it("tolera valores nulos", () => {
    expect(escapeXml(undefined)).toBe("")
  })
})
