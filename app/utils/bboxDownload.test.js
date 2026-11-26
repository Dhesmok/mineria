import JSZip from "jszip"
import { ServiceUnavailableError } from "./arcgis"
import { resetTenureLayerCache } from "./tenureLayers"
import {
  bboxOfFeatureCollection,
  bboxOfGeometry,
  buildAreaZip,
  buildReadme,
  collectDem,
  collectLayerData,
  resolveActiveLayers,
  sanitizeName,
} from "./bboxDownload"

const polygon = (coords) => ({ type: "Polygon", coordinates: coords })

const SQUARE = [
  [
    [-75.6, 6.2],
    [-75.4, 6.2],
    [-75.4, 6.4],
    [-75.6, 6.4],
    [-75.6, 6.2],
  ],
]

describe("bboxOfGeometry", () => {
  it("saca la envolvente de un polígono", () => {
    expect(bboxOfGeometry(polygon(SQUARE))).toEqual({
      west: -75.6,
      south: 6.2,
      east: -75.4,
      north: 6.4,
    })
  })

  it("recorre todas las partes de un multipolígono", () => {
    const multi = {
      type: "MultiPolygon",
      coordinates: [SQUARE, [[[-76, 6], [-75.9, 6], [-75.9, 6.1], [-76, 6.1], [-76, 6]]]],
    }
    expect(bboxOfGeometry(multi)).toEqual({ west: -76, south: 6, east: -75.4, north: 6.4 })
  })

  it("devuelve null si no hay coordenadas usables", () => {
    expect(bboxOfGeometry(null)).toBeNull()
    expect(bboxOfGeometry({ type: "Polygon", coordinates: [] })).toBeNull()
  })
})

describe("bboxOfFeatureCollection", () => {
  it("abarca todas las figuras", () => {
    const fc = {
      type: "FeatureCollection",
      features: [
        { geometry: polygon(SQUARE) },
        { geometry: polygon([[[-77, 5], [-76.9, 5], [-76.9, 5.1], [-77, 5.1], [-77, 5]]]) },
      ],
    }
    expect(bboxOfFeatureCollection(fc)).toEqual({ west: -77, south: 5, east: -75.4, north: 6.4 })
  })

  it("null sin figuras", () => {
    expect(bboxOfFeatureCollection({ features: [] })).toBeNull()
  })
})

describe("sanitizeName", () => {
  it("quita acentos, espacios y símbolos", () => {
    expect(sanitizeName("Títulos Vigentes")).toBe("titulos_vigentes")
    expect(sanitizeName("Solicitud / Histórico")).toBe("solicitud_historico")
  })

  it("nunca devuelve vacío, para no romper el nombre de archivo", () => {
    expect(sanitizeName("")).toBe("capa")
    expect(sanitizeName("///")).toBe("capa")
    expect(sanitizeName(null)).toBe("capa")
  })
})

const demFalso = {
  tiff: new Uint8Array([0x49, 0x49, 42, 0]),
  plan: { cellMeters: 19.1, window: { width: 3, height: 2 }, reducedResolution: false },
  stats: { min: 1480, max: 2310, mean: 1820, noData: 0, valid: 6 },
  missing: 0,
  total: 4,
}

describe("buildReadme", () => {
  const bbox = { west: -75.6, south: 6.2, east: -75.4, north: 6.4 }
  const generatedAt = new Date("2026-08-20T09:58:00Z")

  it("registra la procedencia de cada capa: fuente, servicio y fecha", () => {
    // Sin esto el archivo descargado no tiene forma de rastrearse a su origen,
    // que es justo lo que lo separa de un dato suelto sin valor documental.
    const readme = buildReadme({
      bbox,
      generatedAt,
      layers: [
        {
          label: "Títulos Vigentes",
          source: "ANM (Agencia Nacional de Minería)",
          serviceUrl: "https://anm/MapServer/2",
          count: 12,
          truncated: false,
        },
      ],
    })

    expect(readme).toContain("Títulos Vigentes")
    expect(readme).toContain("Fuente: ANM (Agencia Nacional de Minería)")
    expect(readme).toContain("https://anm/MapServer/2")
    expect(readme).toContain("2026-08-20 09:58 UTC")
    expect(readme).toContain("Registros incluidos: 12")
  })

  it("la fuente sale de la capa, no escrita en el README", () => {
    // Estaba fija como «ANM» para toda capa: cierto con las cuatro de hoy y
    // falso el día que entre la primera del SGC o del IGAC. Un dato geoespacial
    // con la procedencia equivocada es peor que uno sin procedencia.
    const readme = buildReadme({
      bbox,
      generatedAt,
      layers: [
        { label: "Geología", source: "SGC", serviceUrl: "https://sgc/1", count: 3, truncated: false },
      ],
    })

    expect(readme).toContain("Fuente: SGC")
    expect(readme).not.toContain("Fuente: ANM")
  })

  it("avisa cuando el servicio recortó la respuesta", () => {
    const readme = buildReadme({
      bbox,
      generatedAt,
      layers: [{ label: "Títulos", serviceUrl: "x", count: 2000, truncated: true }],
    })
    expect(readme).toMatch(/RECORT/)
  })

  it("declara los CRS y no los mezcla", () => {
    const readme = buildReadme({ bbox, generatedAt, layers: [] })
    expect(readme).toContain("EPSG:4686")
    expect(readme).toContain("EPSG:9377")
  })

  it("dice que las alturas del DEM están sobre el geoide, no sobre el elipsoide", () => {
    // La versión anterior aseguraba lo contrario y mandaba a aplicar un geoide,
    // que sobre SRTM —ya referido a EGM96— descuadra la cota hasta 30 m.
    const readme = buildReadme({ bbox, generatedAt, layers: [], dem: demFalso })
    expect(readme).toMatch(/GEOIDE EGM96, NO AL ELIPSOIDE/)
    expect(readme).toMatch(/NO les apliques otro geoide/)
    expect(readme).toContain("dem.tif")
    expect(readme).toContain("SRTM")
  })

  it("explica por qué falta el DEM si no llegó, sin tumbar el resto", () => {
    const readme = buildReadme({ bbox, generatedAt, layers: [], dem: { error: "sin red" } })
    expect(readme).toMatch(/No incluido/)
    expect(readme).toContain("sin red")
  })

  it("avisa si el área era grande y se bajó la resolución", () => {
    const grande = { ...demFalso, plan: { ...demFalso.plan, reducedResolution: true } }
    expect(buildReadme({ bbox, generatedAt, layers: [], dem: grande })).toMatch(/bajó la resolución/)
  })

  it("avisa de las teselas que faltaron", () => {
    const incompleto = { ...demFalso, missing: 2, total: 9 }
    expect(buildReadme({ bbox, generatedAt, layers: [], dem: incompleto })).toMatch(/2 de 9 teselas/)
  })

  it("sin capas encendidas dice que solo va el relieve", () => {
    expect(buildReadme({ bbox, generatedAt, layers: [], dem: demFalso })).toMatch(
      /Ninguna capa vectorial/,
    )
  })

  it("pone las coordenadas del área con precisión suficiente", () => {
    const readme = buildReadme({ bbox, generatedAt, layers: [] })
    expect(readme).toContain("-75.600000")
    expect(readme).toContain("6.400000")
  })
})

describe("resolveActiveLayers", () => {
  afterEach(() => jest.restoreAllMocks())

  it("no consulta nada si no hay capas encendidas", async () => {
    global.fetch = jest.fn()
    const result = await resolveActiveLayers({
      title: false,
      request: false,
      anmService: false,
      historicalTitle: false,
    })
    expect(result).toEqual([])
    expect(global.fetch).not.toHaveBeenCalled()
  })

  it("descubre el índice de las capas de tenencia en runtime", async () => {
    // El índice cambia entre despliegues de la ANM; fijarlo es la trampa #1.
    global.fetch = jest.fn(async (url) => {
      const n = url.match(/MapServer\/(\d+)\?/)[1]
      const name = n === "2" ? "Título Vigente" : "otra"
      return { ok: true, json: async () => ({ id: Number(n), name }) }
    })

    const result = await resolveActiveLayers({ title: true })
    expect(result).toHaveLength(1)
    expect(result[0].serviceUrl).toMatch(/\/2$/)
  })

  it("usa la dirección fija de las capas que no se descubren", async () => {
    const result = await resolveActiveLayers({ anmService: true })
    expect(result[0].serviceUrl).toContain("ServiciosANM/MapServer/3")
  })

  it("con la ANM caída no entrega un ZIP sin los títulos que se pidieron", async () => {
    // Se omitía la capa en silencio: el ZIP salía con solo el relieve y el
    // README aseguraba que no había ninguna capa encendida.
    resetTenureLayerCache()
    global.fetch = jest.fn(async () => {
      throw new TypeError("Failed to fetch")
    })
    await expect(resolveActiveLayers({ title: true })).rejects.toBeInstanceOf(ServiceUnavailableError)
  })

  it("si la capa cambió de nombre lo dice, en vez de omitirla", async () => {
    resetTenureLayerCache()
    global.fetch = jest.fn(async (url) => ({
      ok: true,
      json: async () => ({ id: Number(url.match(/MapServer\/(\d+)\?/)[1]), name: "otra" }),
    }))
    await expect(resolveActiveLayers({ title: true })).rejects.toThrow(/ya no publica/)
  })
})

describe("collectLayerData", () => {
  afterEach(() => jest.restoreAllMocks())

  it("trae las features de cada capa y marca el recorte", async () => {
    global.fetch = jest.fn(async () => ({
      ok: true,
      json: async () => ({
        objectIdFieldName: "OBJECTID",
        exceededTransferLimit: true,
        features: [{ attributes: { OBJECTID: 1 }, geometry: { rings: SQUARE } }],
      }),
    }))

    const data = await collectLayerData(
      [{ key: "title", label: "Títulos", serviceUrl: "https://anm/2" }],
      { west: -75.6, south: 6.2, east: -75.4, north: 6.4 },
    )

    expect(data[0].featureCollection.features).toHaveLength(1)
    expect(data[0].truncated).toBe(true)
  })
})

describe("buildAreaZip", () => {
  const bbox = { west: -75.6, south: 6.2, east: -75.4, north: 6.4 }
  const generatedAt = new Date("2026-08-20T09:58:00Z")
  const areaGeoJSON = { type: "Feature", geometry: polygon(SQUARE), properties: {} }

  const layers = [
    {
      label: "Títulos Vigentes",
      serviceUrl: "https://anm/MapServer/2",
      truncated: false,
      featureCollection: {
        type: "FeatureCollection",
        features: [
          {
            type: "Feature",
            properties: { TENURE_ID: "ABC-1" },
            geometry: polygon(SQUARE),
          },
        ],
      },
    },
  ]

  it("empaqueta README, área y un archivo por capa en cada formato", async () => {
    const buffer = await buildAreaZip({ JSZipCtor: JSZip, layers, areaGeoJSON, bbox, generatedAt })
    const zip = await JSZip.loadAsync(buffer)
    const names = Object.keys(zip.files)

    expect(names).toContain("README.txt")
    expect(names).toContain("area.geojson")
    expect(names).toContain("titulos_vigentes.geojson")
    expect(names).toContain("titulos_vigentes.kml")
  })

  it("cada capa lleva su shapefile completo, con .prj, en su carpeta", async () => {
    const buffer = await buildAreaZip({ JSZipCtor: JSZip, layers, areaGeoJSON, bbox, generatedAt })
    const zip = await JSZip.loadAsync(buffer)
    const shp = Object.keys(zip.files).filter((n) => n.startsWith("shp/titulos_vigentes/"))
    ;["shp", "shx", "dbf", "prj"].forEach((ext) =>
      expect(shp).toContain(`shp/titulos_vigentes/titulos_vigentes.${ext}`),
    )
    const prj = await zip.file("shp/titulos_vigentes/titulos_vigentes.prj").async("string")
    expect(prj).toMatch(/MAGNA/)
  })

  it("mete el DEM cuando llegó, y no deja un dem.tif vacío cuando no", async () => {
    const con = await JSZip.loadAsync(
      await buildAreaZip({ JSZipCtor: JSZip, layers, areaGeoJSON, bbox, generatedAt, dem: demFalso }),
    )
    expect(con.file("dem.tif")).not.toBeNull()

    const sin = await JSZip.loadAsync(
      await buildAreaZip({
        JSZipCtor: JSZip,
        layers,
        areaGeoJSON,
        bbox,
        generatedAt,
        dem: { error: "x" },
      }),
    )
    expect(sin.file("dem.tif")).toBeNull()
  })

  it("el GeoJSON del archivo conserva los atributos de la ANM", async () => {
    const buffer = await buildAreaZip({ JSZipCtor: JSZip, layers, areaGeoJSON, bbox, generatedAt })
    const zip = await JSZip.loadAsync(buffer)
    const geojson = JSON.parse(await zip.file("titulos_vigentes.geojson").async("string"))

    expect(geojson.features[0].properties.TENURE_ID).toBe("ABC-1")
  })

  it("no genera KML de una capa sin geometría exportable", async () => {
    const vacia = [
      {
        label: "Vacía",
        serviceUrl: "x",
        truncated: false,
        featureCollection: { type: "FeatureCollection", features: [] },
      },
    ]
    const buffer = await buildAreaZip({ JSZipCtor: JSZip, layers: vacia, areaGeoJSON, bbox, generatedAt })
    const zip = await JSZip.loadAsync(buffer)

    expect(zip.file("vacia.geojson")).not.toBeNull()
    expect(zip.file("vacia.kml")).toBeNull()
  })

  it("dos capas que sanean al mismo nombre no se pisan", async () => {
    // `sanitizeName` quita los acentos, así que «Títulos Vigentes» y «Titulos
    // Vigentes» dan el mismo archivo: el segundo sobrescribía al primero dentro
    // del ZIP y el usuario abría cuatro capas para encontrar tres archivos.
    const chocan = [
      { ...layers[0], label: "Títulos Vigentes" },
      { ...layers[0], label: "Titulos Vigentes" },
    ]
    const buffer = await buildAreaZip({
      JSZipCtor: JSZip,
      layers: chocan,
      areaGeoJSON,
      bbox,
      generatedAt,
    })
    const zip = await JSZip.loadAsync(buffer)

    expect(zip.file("titulos_vigentes.geojson")).not.toBeNull()
    expect(zip.file("titulos_vigentes_2.geojson")).not.toBeNull()
  })
})

describe("collectDem", () => {
  const bbox = { west: -75.6, south: 6.2, east: -75.5, north: 6.3 }

  it("recorta el mosaico y lo devuelve como GeoTIFF con sus estadísticas", async () => {
    const loadMosaicFn = jest.fn(async (template, tiles, { cols, rows }) => ({
      heights: new Float32Array(cols * rows).fill(1500),
      missing: 0,
    }))
    const dem = await collectDem(bbox, { loadMosaicFn })

    expect(loadMosaicFn).toHaveBeenCalledTimes(1)
    expect(loadMosaicFn.mock.calls[0][0]).toMatch(/terrarium/)
    expect(String.fromCharCode(dem.tiff[0], dem.tiff[1])).toBe("II")
    expect(dem.stats.min).toBe(1500)
    expect(dem.stats.max).toBe(1500)
    expect(dem.missing).toBe(0)
  })

  it("si no llega ninguna tesela devuelve el motivo en vez de un archivo vacío", async () => {
    const loadMosaicFn = async (template, tiles, { cols, rows }) => ({
      heights: new Float32Array(cols * rows).fill(NaN),
      missing: tiles.length,
    })
    const dem = await collectDem(bbox, { loadMosaicFn })
    expect(dem.tiff).toBeUndefined()
    expect(dem.error).toMatch(/no respondió/)
  })

  it("un fallo de red no tumba la descarga: devuelve el error", async () => {
    const dem = await collectDem(bbox, {
      loadMosaicFn: async () => {
        throw new Error("boom")
      },
    })
    expect(dem).toEqual({ error: "boom" })
  })
})
