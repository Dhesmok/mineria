import { renderHook, waitFor } from "@testing-library/react"
import { useExpedientSearchGL } from "./useExpedientSearchGL"

jest.mock("../../utils/tenureLayers", () => ({
  ...jest.requireActual("../../utils/tenureLayers"),
  findTenureLayerNumbers: async () => ({ "Título Vigente": 3, "Solicitud Vigente": 4 }),
}))

// MapLibre no arranca en jsdom (necesita WebGL), así que se sustituyen las tres
// piezas que el hook construye por dobles que registran lo que se les pide.
// Es el mismo enfoque que tenía la versión Leaflet de estos tests.
//
// `virtual: true` es obligatorio: maplibre-gl 6 se publica solo como módulo ESM
// y el resolvedor de Jest, que es CommonJS, ni siquiera consigue encontrarlo
// —falla con "Cannot find module" antes de llegar a sustituirlo—. Con esta
// opción Jest registra el doble directamente y no intenta resolver el original.
jest.mock("maplibre-gl", () => ({
  __esModule: true,
  LngLatBounds: class {
    constructor() {
      this.points = []
    }
    extend(point) {
      this.points.push(point)
      return this
    }
  },
  Marker: class {
    constructor(options) {
      this.options = options
    }
    setLngLat() {
      return this
    }
    addTo(map) {
      map.__markers.push(this)
      return this
    }
    remove() {
      return this
    }
  },
  Popup: class {
    setLngLat() {
      return this
    }
    setHTML() {
      return this
    }
    setText() {
      return this
    }
    addTo() {
      return this
    }
    remove() {
      return this
    }
  },
}), { virtual: true })

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
  features: [
    {
      type: "Feature",
      properties: { TENURE_ID: "ABC-123" },
      geometry: { type: "Polygon", coordinates: SQUARE },
    },
  ],
})

/**
 * Mapa de mentira que registra qué datos recibe cada fuente. Es el equivalente
 * del `createMap` de la versión Leaflet: allá se miraba qué capas se añadían,
 * aquí se mira qué se le pasa a cada `setData`.
 */
const createMap = () => {
  const data = {}
  const setDataCalls = []

  return {
    __markers: [],
    data,
    setDataCalls,
    getSource: (id) => ({
      setData: (value) => {
        data[id] = value
        setDataCalls.push({ id, count: value?.features?.length ?? 0 })
      },
    }),
    getZoom: () => 10,
    setPaintProperty: jest.fn(),
    fitBounds: jest.fn(),
    flyTo: jest.fn(),
    getCanvas: () => ({ style: {} }),
    on: jest.fn(),
    off: jest.fn(),
  }
}

const renderSearch = (map, overrides = {}) => {
  const props = {
    onCoordinatesUpdate: jest.fn(),
    setError: jest.fn(),
    setShowErrorBanner: jest.fn(),
    ...overrides,
  }
  const mapRef = { current: map }

  const view = renderHook(
    ({ searchTrigger }) =>
      useExpedientSearchGL(
        mapRef,
        map,
        "ABC-123",
        searchTrigger,
        props.onCoordinatesUpdate,
        props.setError,
        props.setShowErrorBanner,
      ),
    { initialProps: { searchTrigger: 0 } },
  )

  return { ...view, ...props }
}

describe("useExpedientSearchGL", () => {
  beforeEach(() => {
    jest.clearAllMocks()
    jest.spyOn(console, "error").mockImplementation(() => {})
  })

  afterEach(() => {
    jest.restoreAllMocks()
  })

  it("no deja dibujado el resultado de una búsqueda que llegó tarde", async () => {
    // Regresión heredada del visor Leaflet: pulsar "Aplicar" repetidamente lanzaba
    // búsquedas concurrentes y la que terminara de última pisaba a las demás. Aquí
    // el guardia es el mismo (searchId), solo cambia cómo se dibuja.
    let resolvers = []
    global.fetch = jest.fn(
      () =>
        new Promise((resolve) => {
          resolvers.push(() => resolve({ ok: true, json: async () => featureCollection() }))
        }),
    )

    const map = createMap()
    const { rerender } = renderSearch(map)

    rerender({ searchTrigger: 1 })
    rerender({ searchTrigger: 2 })
    rerender({ searchTrigger: 3 })

    await waitFor(() => expect(resolvers.length).toBeGreaterThan(0))
    resolvers.forEach((resolve) => resolve())

    await waitFor(() => expect(map.fitBounds).toHaveBeenCalled())

    // Solo una búsqueda pudo encuadrar el mapa: las obsoletas se descartaron.
    expect(map.fitBounds).toHaveBeenCalledTimes(1)
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
    // Las cuatro capas se consultan a la vez y con dos nombres de campo cada
    // una, así que la primera búsqueda lanza varias peticiones —no una— y todas
    // comparten el mismo `signal`. Lo que importa aquí no es cuántas son sino
    // que la búsqueda siguiente las cancele todas de golpe.
    await waitFor(() => expect(signals.length).toBeGreaterThan(0))
    const deLaPrimera = [...signals]

    rerender({ searchTrigger: 2 })
    await waitFor(() => expect(deLaPrimera.every((signal) => signal.aborted)).toBe(true))
  })

  it("consulta las capas a la vez y no una detrás de otra", async () => {
    // Eran hasta ocho idas y vueltas en serie —cuatro capas por dos nombres de
    // campo—, así que un expediente de la última capa se pagaba entero. En
    // paralelo el peor caso son dos.
    let enVuelo = 0
    let maximoALaVez = 0
    global.fetch = jest.fn(async () => {
      enVuelo += 1
      maximoALaVez = Math.max(maximoALaVez, enVuelo)
      await Promise.resolve()
      enVuelo -= 1
      return { ok: true, json: async () => ({ features: [] }) }
    })

    const { rerender } = renderSearch(createMap())
    rerender({ searchTrigger: 1 })

    await waitFor(() => expect(global.fetch).toHaveBeenCalledTimes(8))
    expect(maximoALaVez).toBeGreaterThan(1)
  })

  it("limpia los vértices del expediente anterior cuando la búsqueda no encuentra nada", async () => {
    global.fetch = jest.fn(async () => ({ ok: true, json: async () => ({ features: [] }) }))

    const map = createMap()
    const { rerender, onCoordinatesUpdate } = renderSearch(map)

    rerender({ searchTrigger: 1 })

    await waitFor(() => expect(onCoordinatesUpdate).toHaveBeenCalledWith([], null))
    // La fuente de vértices quedó vacía, no con los del expediente anterior.
    expect(map.data["search-vertices"].features).toEqual([])
    expect(map.data["search-result"].features).toEqual([])
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

    await waitFor(() =>
      expect(setError).toHaveBeenCalledWith(expect.stringContaining("No se pudo consultar")),
    )
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

    await waitFor(() =>
      expect(setError).toHaveBeenCalledWith(expect.stringContaining("No se encontró un polígono")),
    )
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
    // Y los cuatro vértices se dibujaron, sin repetir el de cierre.
    expect(map.data["search-vertices"].features).toHaveLength(4)
  })

  it("pinta el resultado con el color de la capa donde apareció", async () => {
    global.fetch = jest.fn(async () => ({ ok: true, json: async () => featureCollection() }))

    const map = createMap()
    const { rerender } = renderSearch(map)

    rerender({ searchTrigger: 1 })

    await waitFor(() => expect(map.setPaintProperty).toHaveBeenCalled())
    expect(map.setPaintProperty).toHaveBeenCalledWith("search-fill", "fill-color", expect.any(String))
  })
})
