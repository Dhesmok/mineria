import {
  ANM_LAYERS,
  arcgisResponseToGeoJSON,
  buildFeatureQueryUrl,
  clampBounds,
  didExceedLimit,
  fetchLayerFeatures,
  MAX_FEATURES_PER_QUERY,
} from "./anmLayers"

const BOX = { west: -75.6, south: 6.2, east: -75.5, north: 6.3 }

const paramsOf = (url) => new URLSearchParams(url.split("?")[1])

describe("buildFeatureQueryUrl", () => {
  it("pide el recuadro visible como envelope en coordenadas geográficas", () => {
    const params = paramsOf(buildFeatureQueryUrl("https://ejemplo/MapServer/3", BOX))

    expect(params.get("geometry")).toBe("-75.6,6.2,-75.5,6.3")
    expect(params.get("geometryType")).toBe("esriGeometryEnvelope")
    expect(params.get("inSR")).toBe("4326")
    // MapLibre espera GeoJSON en WGS84; sin outSR el servicio responde en su
    // propia proyección y los polígonos caen en mitad del Atlántico.
    expect(params.get("outSR")).toBe("4326")
  })

  it("pide el formato propio de Esri, no GeoJSON", () => {
    // Es lo que usa esri-leaflet contra estos mismos servidores de la ANM, o sea
    // lo único que se sabe que funciona. La conversión la hace arcgisToGeoJSON.
    expect(paramsOf(buildFeatureQueryUrl("https://ejemplo/0", BOX)).get("f")).toBe("json")
  })

  it("pone un tope de features por consulta", () => {
    expect(paramsOf(buildFeatureQueryUrl("https://ejemplo/0", BOX)).get("resultRecordCount")).toBe(
      String(MAX_FEATURES_PER_QUERY),
    )
  })

  it("escapa el where en lugar de pegarlo crudo", () => {
    const url = buildFeatureQueryUrl("https://ejemplo/0", BOX)
    expect(url).toContain("where=1%3D1")
  })
})

describe("clampBounds", () => {
  it("recorta el recuadro al rango válido de coordenadas", () => {
    // Al alejarse, MapLibre devuelve longitudes fuera de -180..180 porque el
    // mapa da la vuelta al mundo. ArcGIS responde a eso con un error, no con una
    // lista vacía, y saltaba el banner rojo por un gesto normal del usuario.
    expect(clampBounds({ west: -420, south: -95, east: 380, north: 120 })).toEqual({
      west: -180,
      south: -90,
      east: 180,
      north: 90,
    })
  })

  it("deja intacto un recuadro que ya es válido", () => {
    expect(clampBounds(BOX)).toEqual(BOX)
  })
})

describe("arcgisResponseToGeoJSON", () => {
  const square = [
    [-75.6, 6.2],
    [-75.6, 6.3],
    [-75.5, 6.3],
    [-75.5, 6.2],
    [-75.6, 6.2],
  ]

  it("convierte los anillos de Esri en geometrías GeoJSON", () => {
    const result = arcgisResponseToGeoJSON({
      objectIdFieldName: "OBJECTID",
      features: [
        { attributes: { OBJECTID: 7, TENURE_ID: "ABC-123" }, geometry: { rings: [square] } },
      ],
    })

    expect(result.type).toBe("FeatureCollection")
    expect(result.features).toHaveLength(1)
    expect(result.features[0].geometry.type).toBe("Polygon")
    expect(result.features[0].properties.TENURE_ID).toBe("ABC-123")
  })

  it("usa el identificador del servicio para que MapLibre pueda distinguir features", () => {
    const result = arcgisResponseToGeoJSON({
      objectIdFieldName: "OBJECTID",
      features: [{ attributes: { OBJECTID: 42 }, geometry: { rings: [square] } }],
    })

    expect(result.features[0].id).toBe(42)
  })

  it("cae en el índice cuando el servicio no expone identificador", () => {
    // Dos features con el mismo id se pisan al consultarlas por clic.
    const result = arcgisResponseToGeoJSON({
      features: [
        { attributes: {}, geometry: { rings: [square] } },
        { attributes: {}, geometry: { rings: [square] } },
      ],
    })

    expect(result.features.map((f) => f.id)).toEqual([0, 1])
  })

  it("descarta las features sin geometría en vez de romper", () => {
    const result = arcgisResponseToGeoJSON({
      features: [{ attributes: { OBJECTID: 1 } }, { attributes: {}, geometry: { rings: [square] } }],
    })

    expect(result.features).toHaveLength(1)
  })

  it("devuelve una colección vacía si la respuesta no trae features", () => {
    expect(arcgisResponseToGeoJSON({}).features).toEqual([])
    expect(arcgisResponseToGeoJSON(null).features).toEqual([])
  })

  it("respeta los huecos de un polígono", () => {
    // Un anillo interior en sentido contrario es un hueco. Tratarlo como
    // contorno independiente rellena el hueco, que fue un bug real al exportar.
    const hole = [
      [-75.58, 6.22],
      [-75.56, 6.22],
      [-75.56, 6.24],
      [-75.58, 6.24],
      [-75.58, 6.22],
    ]
    const result = arcgisResponseToGeoJSON({
      features: [{ attributes: {}, geometry: { rings: [square, hole] } }],
    })

    expect(result.features[0].geometry.type).toBe("Polygon")
    expect(result.features[0].geometry.coordinates).toHaveLength(2)
  })
})

describe("didExceedLimit", () => {
  it("cree al servicio cuando avisa de que recortó", () => {
    expect(didExceedLimit({ exceededTransferLimit: true }, 5)).toBe(true)
  })

  it("sospecha cuando la cuenta cuadra justo con el tope pedido", () => {
    // No todas las versiones de ArcGIS mandan exceededTransferLimit.
    expect(didExceedLimit({}, MAX_FEATURES_PER_QUERY)).toBe(true)
    expect(didExceedLimit({}, MAX_FEATURES_PER_QUERY - 1)).toBe(false)
  })
})

describe("fetchLayerFeatures", () => {
  afterEach(() => {
    jest.restoreAllMocks()
  })

  it("devuelve las features convertidas", async () => {
    global.fetch = jest.fn(async () => ({
      ok: true,
      json: async () => ({
        objectIdFieldName: "OBJECTID",
        features: [
          {
            attributes: { OBJECTID: 1 },
            geometry: {
              rings: [
                [
                  [-75.6, 6.2],
                  [-75.6, 6.3],
                  [-75.5, 6.3],
                  [-75.6, 6.2],
                ],
              ],
            },
          },
        ],
      }),
    }))

    const result = await fetchLayerFeatures("https://ejemplo/0", BOX)

    expect(result.featureCollection.features).toHaveLength(1)
    expect(result.truncated).toBe(false)
  })

  it("propaga los errores que ArcGIS devuelve con HTTP 200", async () => {
    // Trampa conocida: response.ok es true y features queda undefined, así que
    // el fallo pasaba por "no hay nada en esta zona".
    global.fetch = jest.fn(async () => ({
      ok: true,
      json: async () => ({ error: { message: "Campo inexistente", code: 400 } }),
    }))

    await expect(fetchLayerFeatures("https://ejemplo/0", BOX)).rejects.toThrow("Campo inexistente")
  })
})

describe("ANM_LAYERS", () => {
  it("define las cuatro capas con clave única", () => {
    const keys = ANM_LAYERS.map((layer) => layer.key)
    expect(keys).toHaveLength(4)
    expect(new Set(keys).size).toBe(4)
  })

  it("cada capa sabe de dónde sale: dirección fija o descubrimiento en runtime", () => {
    // Los índices de la ANM cambian entre despliegues; fijarlos en el código es
    // la trampa número uno del proyecto.
    ANM_LAYERS.forEach((layer) => {
      expect(Boolean(layer.url) !== Boolean(layer.tenureName)).toBe(true)
    })
  })
})
