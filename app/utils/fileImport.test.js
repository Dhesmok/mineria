import {
  baseNameOf,
  decodeText,
  detectFormat,
  extensionOf,
  groupFiles,
  MAX_FILE_BYTES,
  normalizeFeatureCollection,
  readGeoFiles,
} from "./fileImport"
import { crsById } from "./crs"

/**
 * Un doble de `File` con lo único que `readGeoFiles` le pide: nombre, tamaño y
 * los bytes. El `File` de jsdom no trae `arrayBuffer()` en todas las versiones, y
 * lo que hay que probar es nuestro código y no el suyo.
 */
const archivo = (name, contenido = "") => {
  const bytes =
    typeof contenido === "string" ? new TextEncoder().encode(contenido) : new Uint8Array(contenido)
  return {
    name,
    size: bytes.byteLength,
    arrayBuffer: async () => bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength),
  }
}

describe("qué formato es", () => {
  it("reconoce las extensiones que se pueden cargar", () => {
    expect(detectFormat("titulos.zip")).toBe("shapefile-zip")
    expect(detectFormat("titulos.SHP")).toBe("shapefile")
    expect(detectFormat("recorrido.kml")).toBe("kml")
    expect(detectFormat("recorrido.kmz")).toBe("kmz")
    expect(detectFormat("lindero.dxf")).toBe("dxf")
    expect(detectFormat("capa.geojson")).toBe("geojson")
    expect(detectFormat("capa.json")).toBe("geojson")
    expect(detectFormat("ruta.gpx")).toBe("gpx")
  })

  // Se reconoce para poder explicar por qué no se puede abrir, que es distinto de
  // no reconocerlo.
  it("reconoce el .dwg aunque no se pueda leer", () => {
    expect(detectFormat("plano.dwg")).toBe("dwg")
  })

  it("no reconoce lo demás", () => {
    expect(detectFormat("informe.pdf")).toBeNull()
    expect(detectFormat("sinextension")).toBeNull()
  })

  it("separa nombre y extensión aunque venga con carpetas", () => {
    expect(extensionOf("C:\\planos\\lindero.DXF")).toBe("dxf")
    expect(baseNameOf("/home/fabio/titulos.shp")).toBe("titulos")
  })
})

/**
 * El shapefile no es un archivo sino cuatro, y quien lo selecciona a mano en el
 * diálogo no tiene por qué saberlo.
 */
describe("agrupar los archivos de un shapefile", () => {
  it("junta el .shp con sus acompañantes por nombre", () => {
    const { grupos, problemas } = groupFiles([
      archivo("titulos.dbf"),
      archivo("titulos.shp"),
      archivo("titulos.prj"),
      archivo("titulos.shx"),
    ])

    expect(problemas).toEqual([])
    expect(grupos).toHaveLength(1)
    expect(grupos[0].format).toBe("shapefile")
    expect(grupos[0].sidecars.dbf.name).toBe("titulos.dbf")
    expect(grupos[0].sidecars.prj.name).toBe("titulos.prj")
  })

  it("no confunde dos shapefiles seleccionados a la vez", () => {
    const { grupos } = groupFiles([
      archivo("titulos.shp"),
      archivo("solicitudes.shp"),
      archivo("solicitudes.dbf"),
      archivo("titulos.dbf"),
    ])

    expect(grupos).toHaveLength(2)
    const porNombre = Object.fromEntries(grupos.map((g) => [g.file.name, g.sidecars.dbf?.name]))
    expect(porNombre["titulos.shp"]).toBe("titulos.dbf")
    expect(porNombre["solicitudes.shp"]).toBe("solicitudes.dbf")
  })

  // El error más común al cargar un shapefile a mano: elegir solo el .dbf porque
  // es «el que tiene los datos».
  it("explica el .dbf que llega huérfano en vez de ignorarlo", () => {
    const { grupos, problemas } = groupFiles([archivo("titulos.dbf"), archivo("titulos.prj")])

    expect(grupos).toHaveLength(0)
    expect(problemas).toHaveLength(1)
    expect(problemas[0].message).toContain(".shp")
  })

  it("nombra la extensión que no reconoce", () => {
    const { problemas } = groupFiles([archivo("informe.pdf")])
    expect(problemas[0].message).toContain(".pdf")
  })
})

describe("cualquier cosa que se parezca a GeoJSON", () => {
  const punto = { type: "Point", coordinates: [-75, 6] }

  it("acepta las cinco formas del formato", () => {
    expect(normalizeFeatureCollection({ type: "FeatureCollection", features: [{ geometry: punto }] }).features)
      .toHaveLength(1)
    expect(normalizeFeatureCollection({ type: "Feature", geometry: punto, properties: {} }).features)
      .toHaveLength(1)
    expect(normalizeFeatureCollection(punto).features).toHaveLength(1)
    expect(
      normalizeFeatureCollection({ type: "GeometryCollection", geometries: [punto, punto] }).features,
    ).toHaveLength(2)
  })

  it("conserva los atributos y rellena los que faltan", () => {
    const fc = normalizeFeatureCollection({
      type: "FeatureCollection",
      features: [{ geometry: punto, properties: { PREDIO: "La Ceiba" } }, { geometry: punto }],
    })

    expect(fc.features[0].properties).toEqual({ PREDIO: "La Ceiba" })
    expect(fc.features[1].properties).toEqual({})
  })

  // Una figura sin geometría es GeoJSON válido —una fila de atributos sin sitio—
  // y no hay nada que dibujar con ella.
  it("descarta las figuras sin geometría", () => {
    const fc = normalizeFeatureCollection({
      type: "FeatureCollection",
      features: [{ geometry: null, properties: {} }, { geometry: punto }],
    })
    expect(fc.features).toHaveLength(1)
  })

  it("devuelve nada cuando no es GeoJSON", () => {
    expect(normalizeFeatureCollection({ hola: 1 })).toBeNull()
    expect(normalizeFeatureCollection(null)).toBeNull()
    expect(normalizeFeatureCollection("texto")).toBeNull()
  })
})

/**
 * La codificación del texto. AutoCAD y las herramientas viejas de Windows
 * escriben en la codificación local, así que un nombre de capa con tildes sale
 * con rombos si se lee todo como UTF-8.
 */
describe("decodificar el texto", () => {
  it("lee UTF-8 cuando lo es", () => {
    expect(decodeText(new TextEncoder().encode("LINDERO QUEBRADA LA CEIBA — SEÑALES"))).toBe(
      "LINDERO QUEBRADA LA CEIBA — SEÑALES",
    )
  })

  it("cae a Windows-1252 cuando los bytes no son UTF-8 válido", () => {
    // 0xD1 es la Ñ en Windows-1252 y un byte imposible en UTF-8.
    expect(decodeText(new Uint8Array([0x53, 0x45, 0xd1, 0x41, 0x4c]))).toBe("SEÑAL")
  })
})

describe("leer los archivos", () => {
  it("carga un GeoJSON y lo declara geográfico", async () => {
    const contenido = JSON.stringify({
      type: "FeatureCollection",
      features: [
        { type: "Feature", geometry: { type: "Point", coordinates: [-75.6, 6.2] }, properties: { a: 1 } },
      ],
    })

    const { layers, problems } = await readGeoFiles([archivo("capa.geojson", contenido)])

    expect(problems).toEqual([])
    expect(layers).toHaveLength(1)
    expect(layers[0].crs).toBe("4686")
    expect(layers[0].featureCollection.features).toHaveLength(1)
  })

  it("carga un KML con su polígono y sus atributos", async () => {
    const kml = `<?xml version="1.0" encoding="UTF-8"?>
      <kml xmlns="http://www.opengis.net/kml/2.2"><Document>
        <Placemark><name>Lote 3</name><Polygon><outerBoundaryIs><LinearRing><coordinates>
          -75.6,6.2,0 -75.5,6.2,0 -75.5,6.3,0 -75.6,6.2,0
        </coordinates></LinearRing></outerBoundaryIs></Polygon></Placemark>
      </Document></kml>`

    const { layers, problems } = await readGeoFiles([archivo("lote.kml", kml)])

    expect(problems).toEqual([])
    expect(layers[0].featureCollection.features[0].geometry.type).toBe("Polygon")
    expect(layers[0].featureCollection.features[0].properties.name).toBe("Lote 3")
  })

  // `DOMParser` no lanza con un XML roto: devuelve un documento con un
  // `<parsererror>` dentro. Sin mirarlo, un KML cortado se cargaba como una capa
  // vacía y sin explicación.
  it("explica un KML mal formado en vez de cargar una capa vacía", async () => {
    const { layers, problems } = await readGeoFiles([archivo("roto.kml", "<kml><Document>")])

    expect(layers).toHaveLength(0)
    expect(problems).toHaveLength(1)
    expect(problems[0].message).toMatch(/mal formado/i)
  })

  it("carga un CAD y avisa de lo que no pudo leer", async () => {
    const dxf = [
      "0", "SECTION", "2", "ENTITIES",
      "0", "LWPOLYLINE", "8", "LINDERO", "90", "3", "70", "1",
      "10", "1000000", "20", "1100000",
      "10", "1001000", "20", "1100000",
      "10", "1001000", "20", "1101000",
      "0", "SPLINE", "8", "CURVAS", "10", "0", "20", "0",
      "0", "ENDSEC",
      "0", "EOF",
    ].join("\n")

    const { layers, problems } = await readGeoFiles([archivo("lindero.dxf", dxf)])

    expect(problems).toEqual([])
    expect(layers).toHaveLength(1)
    // Un DXF no dice en qué sistema de coordenadas está. Ni uno.
    expect(layers[0].crs).toBeNull()
    expect(layers[0].warnings.join(" ")).toContain("SPLINE")
  })

  it("dice por qué un .dwg no se puede abrir y qué hacer", async () => {
    const { problems } = await readGeoFiles([archivo("plano.dwg", "binario")])
    expect(problems[0].message).toContain("DXF")
  })

  it("un archivo que falla no impide cargar los demás", async () => {
    const bueno = JSON.stringify({ type: "Point", coordinates: [-75, 6] })
    const { layers, problems } = await readGeoFiles([
      archivo("roto.geojson", "{no es json"),
      archivo("bueno.geojson", bueno),
    ])

    expect(layers).toHaveLength(1)
    expect(problems).toHaveLength(1)
    expect(problems[0].name).toBe("roto.geojson")
  })

  it("avisa de una capa vacía en vez de añadirla al panel", async () => {
    const vacio = JSON.stringify({ type: "FeatureCollection", features: [] })
    const { layers, problems } = await readGeoFiles([archivo("vacia.geojson", vacio)])

    expect(layers).toHaveLength(0)
    expect(problems[0].message).toMatch(/vacía/i)
  })

  it("no intenta leer un archivo por encima del tope", async () => {
    const enorme = { ...archivo("enorme.zip", "x"), size: MAX_FILE_BYTES + 1 }
    const { problems } = await readGeoFiles([enorme])

    expect(problems).toHaveLength(1)
    expect(problems[0].message).toContain("MB")
  })

  it("no devuelve nada si no se seleccionó nada", async () => {
    expect(await readGeoFiles([])).toEqual({ layers: [], problems: [] })
  })
})

/**
 * El shapefile, ida y vuelta: se escribe uno con el mismo escritor con que el
 * visor exporta —`@mapbox/shp-write`, que ya estaba en el proyecto— y se vuelve a
 * leer.
 *
 * Es la prueba que no se puede hacer con un archivo inventado. Un shapefile son
 * cuatro archivos binarios con sus longitudes cruzadas, y escribirlo a mano en una
 * prueba probaría nuestra idea del formato. Escribirlo con un escritor de verdad,
 * comprimirlo como lo comprime cualquier SIG y leerlo con el lector de verdad
 * comprueba el camino entero: el descomprimido, el `.shp`, el `.dbf` con sus
 * atributos y el `.prj` que decide dónde va la capa.
 */
describe("shapefile de ida y vuelta", () => {
  const conPolígono = (props) => ({
    type: "FeatureCollection",
    features: [
      {
        type: "Feature",
        properties: props,
        geometry: {
          type: "Polygon",
          coordinates: [
            [
              [-75.6, 6.2],
              [-75.5, 6.2],
              [-75.5, 6.3],
              [-75.6, 6.3],
              [-75.6, 6.2],
            ],
          ],
        },
      },
    ],
  })

  const comprimir = async (geojson, prj) => {
    const shpwrite = (await import("@mapbox/shp-write")).default
    return shpwrite.zip(geojson, {
      folder: "titulos",
      types: { point: "puntos", polygon: "titulos", line: "lineas" },
      prj,
      outputType: "arraybuffer",
    })
  }

  it("lee el .shp, sus atributos y su .prj desde un .zip", async () => {
    const { prj } = crsById("4686")
    const zip = await comprimir(conPolígono({ PREDIO: "La Ceiba", HA: 12.5 }), prj)

    const { layers, problems } = await readGeoFiles([
      { name: "titulos.zip", size: zip.byteLength, arrayBuffer: async () => zip },
    ])

    expect(problems).toEqual([])
    expect(layers).toHaveLength(1)
    // El nombre es el del shapefile de dentro, no el del zip: un «capas.zip» con
    // tres shapefiles daría tres capas llamadas igual.
    expect(layers[0].name).toMatch(/titulos\.shp$/i)
    expect(layers[0].crs).toBe("4686")

    const figura = layers[0].featureCollection.features[0]
    expect(figura.geometry.type).toBe("Polygon")
    expect(figura.properties.PREDIO).toBe("La Ceiba")
    expect(figura.geometry.coordinates[0][0][0]).toBeCloseTo(-75.6, 5)
  })

  /**
   * Un shapefile sin `.prj` es lo más común en los planos que llegan por correo,
   * y es exactamente el caso en que hay que preguntar por el sistema.
   *
   * El `.prj` hay que quitarlo a mano: el escritor pone uno por omisión aunque no
   * se le pase ninguno, así que pedirle un zip «sin .prj» devuelve uno con `.prj`.
   * Se le quita volviendo a comprimir todo menos ese archivo, que es además lo que
   * hace cualquiera que mande el shapefile «con lo justo».
   */
  it("declara que no sabe el sistema cuando el zip no trae .prj", async () => {
    const JSZip = (await import("jszip")).default
    const conPrj = await JSZip.loadAsync(await comprimir(conPolígono({ PREDIO: "Sin prj" })))
    const sinPrj = new JSZip()

    for (const nombre of Object.keys(conPrj.files)) {
      if (/\.prj$/i.test(nombre) || conPrj.files[nombre].dir) continue
      sinPrj.file(nombre, await conPrj.files[nombre].async("arraybuffer"))
    }
    const zip = await sinPrj.generateAsync({ type: "arraybuffer" })

    const { layers } = await readGeoFiles([
      { name: "sinprj.zip", size: zip.byteLength, arrayBuffer: async () => zip },
    ])

    expect(layers[0].crs).toBeNull()
    expect(layers[0].warnings.join(" ")).toContain(".prj")
  })

  it("explica un .zip que no lleva ningún shapefile", async () => {
    const JSZip = (await import("jszip")).default
    const zip = new JSZip()
    zip.file("informe.txt", "nada que ver aquí")
    const bytes = await zip.generateAsync({ type: "arraybuffer" })

    const { problems } = await readGeoFiles([
      { name: "informe.zip", size: bytes.byteLength, arrayBuffer: async () => bytes },
    ])

    expect(problems[0].message).toContain(".shp")
  })
})
