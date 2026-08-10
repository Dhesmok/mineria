import { renderHook, waitFor } from "@testing-library/react"
import { useExpedientSearch } from "./useExpedientSearch"

jest.mock("../../utils/tenureLayers", () => ({
  ...jest.requireActual("../../utils/tenureLayers"),
  findTenureLayerNumbers: async () => ({ "Título Vigente": 3, "Solicitud Vigente": 4 }),
}))

// Leaflet no funciona en jsdom, así que sustituimos las fábricas que usa el hook por
// dobles que registran qué se añadió al mapa.
jest.mock("leaflet", () => {
  const layer = (kind) => ({
    kind,
    addTo(map) {
      map.addLayer(this)
      return this
    },
    addLayer: jest.fn(),
    getBounds: () => "bounds",
  })

  return {
    __esModule: true,
    default: {
      geoJSON: jest.fn(() => layer("geojson")),
      layerGroup: jest.fn(() => layer("labels")),
      marker: jest.fn(() => ({ kind: "marker" })),
      divIcon: jest.fn(() => ({ kind: "icon" })),
    },
  }
})

const SQUARE = [
  [
    [-75.6, 6.2],
    [-75.57, 6.2],
    [-75.57, 6.23],
    [-75.6, 6.23],
    [-75.6, 6.2],
  ],
]

const featureCollection = () => ({
  type: "FeatureCollection",
  features: [{ type: "Feature", properties: { TENURE_ID: "ABC-123" }, geometry: { type: "Polygon", coordinates: SQUARE } }],
})

const createMap = () => {
  const added = []
  const map = {
    added,
    addLayer: (l) => added.push(l),
    removeLayer: (l) => {
      const at = added.indexOf(l)
      if (at !== -1) added.splice(at, 1)
    },
    hasLayer: (l) => added.includes(l),
    getZoom: () => 10,
    fitBounds: jest.fn(),
    addVertices: jest.fn(),
  }
  return map
}

const renderSearch = (map, overrides = {}) => {
  const props = {
    onCoordinatesUpdate: jest.fn(),
    setError: jest.fn(),
    setShowErrorBanner: jest.fn(),
    ...overrides,
  }
  const mapRef = { current: map }
  const refs = { geoJson: { current: null }, labels: { current: null }, vertices: { current: null } }

  const view = renderHook(
    ({ searchTrigger }) =>
      useExpedientSearch(
        mapRef,
        map,
        "ABC-123",
        searchTrigger,
        props.onCoordinatesUpdate,
        props.setError,
        props.setShowErrorBanner,
        refs.geoJson,
        refs.labels,
        refs.vertices,
      ),
    { initialProps: { searchTrigger: 0 } },
  )

  return { ...view, ...props, refs }
}

describe("useExpedientSearch", () => {
  beforeEach(() => {
    jest.clearAllMocks()
    jest.spyOn(console, "error").mockImplementation(() => {})
  })

  afterEach(() => {
    jest.restoreAllMocks()
  })

  it("no deja copias huérfanas cuando se busca varias veces seguidas", async () => {
    // Regresión: pulsar "Aplicar" repetidamente lanzaba búsquedas concurrentes. Cada
    // una sobrescribía geoJsonLayerRef al terminar, así que las anteriores quedaban
    // dibujadas en el mapa sin referencia y ya no se podían quitar: el polígono se
    // veía "redibujado" y con el relleno acumulado.
    let resolvers = []
    global.fetch = jest.fn(
      () =>
        new Promise((resolve) => {
          resolvers.push(() => resolve({ ok: true, json: async () => featureCollection() }))
        }),
    )

    const map = createMap()
    const { rerender, refs } = renderSearch(map)

    rerender({ searchTrigger: 1 })
    rerender({ searchTrigger: 2 })
    rerender({ searchTrigger: 3 })

    await waitFor(() => expect(resolvers.length).toBeGreaterThan(0))
    resolvers.forEach((resolve) => resolve())

    await waitFor(() => expect(refs.geoJson.current).not.toBeNull())
    // Dar margen a que cualquier búsqueda rezagada intente dibujar.
    await waitFor(() => expect(map.fitBounds).toHaveBeenCalled())

    const drawnPolygons = map.added.filter((l) => l.kind === "geojson")
    expect(drawnPolygons).toHaveLength(1)
    expect(drawnPolygons[0]).toBe(refs.geoJson.current)
  })

  it("aborta la búsqueda anterior al arrancar una nueva", async () => {
    const signals = []
    global.fetch = jest.fn((_url, options) => {
      signals.push(options.signal)
      return new Promise(() => {})
    })

    const map = createMap()
    const { rerender } = renderSearch(map)

    rerender({ searchTrigger: 1 })
    await waitFor(() => expect(signals).toHaveLength(1))

    rerender({ searchTrigger: 2 })
    await waitFor(() => expect(signals[0].aborted).toBe(true))
  })

  it("limpia los vértices del expediente anterior cuando la búsqueda no encuentra nada", async () => {
    global.fetch = jest.fn(async () => ({ ok: true, json: async () => ({ features: [] }) }))

    const map = createMap()
    const { rerender, refs, onCoordinatesUpdate } = renderSearch(map)

    const staleVertices = { kind: "vertices" }
    map.addLayer(staleVertices)
    refs.vertices.current = staleVertices

    rerender({ searchTrigger: 1 })

    await waitFor(() => expect(onCoordinatesUpdate).toHaveBeenCalledWith([], null))
    expect(refs.vertices.current).toBeNull()
    expect(map.hasLayer(staleVertices)).toBe(false)
  })

  it("distingue un servicio caído de un expediente inexistente", async () => {
    // Regresión: ArcGIS devuelve HTTP 200 con {"error": ...} cuando el servicio falla.
    // Como response.ok era true y data.features quedaba undefined, un servicio caído
    // se reportaba como "no se encontró un polígono con ese expediente".
    global.fetch = jest.fn(async () => ({
      ok: true,
      json: async () => ({ error: { code: 500, message: "Service unavailable" } }),
    }))

    const map = createMap()
    const { rerender, setError } = renderSearch(map)

    rerender({ searchTrigger: 1 })

    await waitFor(() => expect(setError).toHaveBeenCalledWith(expect.stringContaining("No se pudo consultar")))
    expect(setError).not.toHaveBeenCalledWith(expect.stringContaining("No se encontró un polígono"))
  })

  it("no culpa al servidor cuando una capa solo rechaza uno de los dos campos", async () => {
    // Cada capa se sondea con TENURE_ID y con CODIGO_EXPEDIENTE; es normal que una de
    // las dos consultas falle porque el campo no existe en esa capa.
    global.fetch = jest.fn(async (url) => ({
      ok: true,
      json: async () =>
        String(url).includes("CODIGO_EXPEDIENTE")
          ? { error: { code: 400, message: "Invalid field: CODIGO_EXPEDIENTE" } }
          : { features: [] },
    }))

    const map = createMap()
    const { rerender, setError } = renderSearch(map)

    rerender({ searchTrigger: 1 })

    await waitFor(() => expect(setError).toHaveBeenCalledWith(expect.stringContaining("No se encontró un polígono")))
  })

  it("entrega los anillos sin el vértice de cierre duplicado", async () => {
    global.fetch = jest.fn(async () => ({ ok: true, json: async () => featureCollection() }))

    const map = createMap()
    const { rerender, onCoordinatesUpdate } = renderSearch(map)

    rerender({ searchTrigger: 1 })

    await waitFor(() => expect(onCoordinatesUpdate).toHaveBeenCalled())

    const [coordinates, , rings] = onCoordinatesUpdate.mock.calls.at(-1)
    expect(coordinates).toHaveLength(4)
    expect(rings).toHaveLength(1)
    expect(map.addVertices).toHaveBeenCalledWith(rings)
  })
})
