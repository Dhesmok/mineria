import { renderHook, act } from "@testing-library/react"
import { useTerrainGL, EXAGGERATION_DEFAULT } from "./useTerrainGL"
import { TERRAIN_SOURCE_ID } from "../../utils/mapStyles"

jest.mock("../../utils/demTileLoader", () => ({
  reliefAround: jest.fn(async () => ({
    relief: 500,
    center: 1500,
    highest: 2000,
  })),
  clearTileCache: jest.fn(),
}))

const createMapMock = (initialTerrain = null) => {
  let terrain = initialTerrain
  let sky = null
  let pitch = 0
  let bearing = 0
  let zoom = 14

  const listeners = {}

  const map = {
    getTerrain: jest.fn(() => terrain),
    setTerrain: jest.fn((t) => {
      terrain = t
    }),
    setSky: jest.fn((s) => {
      sky = s
    }),
    getSky: jest.fn(() => sky),
    getPitch: jest.fn(() => pitch),
    getBearing: jest.fn(() => bearing),
    getZoom: jest.fn(() => zoom),
    getCenter: jest.fn(() => ({ lng: -75.5, lat: 6.2 })),
    getCanvas: jest.fn(() => ({ clientHeight: 800, clientWidth: 1200, style: {} })),
    getVerticalFieldOfView: jest.fn(() => 36.87),
    queryTerrainElevation: jest.fn((_pt) => 1500),
    areTilesLoaded: jest.fn(() => true),
    easeTo: jest.fn((opts) => {
      if (opts.pitch !== undefined) pitch = opts.pitch
      if (opts.bearing !== undefined) bearing = opts.bearing
      if (opts.zoom !== undefined) zoom = opts.zoom
    }),
    jumpTo: jest.fn((opts) => {
      if (opts.pitch !== undefined) pitch = opts.pitch
      if (opts.bearing !== undefined) bearing = opts.bearing
      if (opts.zoom !== undefined) zoom = opts.zoom
    }),
    on: jest.fn((event, handler) => {
      listeners[event] = listeners[event] || []
      listeners[event].push(handler)
    }),
    off: jest.fn((event, handler) => {
      if (!listeners[event]) return
      listeners[event] = listeners[event].filter((h) => h !== handler)
    }),
    _emit: (event, data) => {
      if (!listeners[event]) return
      listeners[event].forEach((h) => h(data))
    },
  }

  return map
}

describe("useTerrainGL", () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  it("inicia en 2D con valores por omisión", () => {
    const map = createMapMock()
    const { result } = renderHook(() => useTerrainGL({ current: map }, map))

    expect(result.current.is3D).toBe(false)
    expect(result.current.exaggeration).toBe(EXAGGERATION_DEFAULT)
    expect(result.current.pitch).toBe(0)
    expect(result.current.bearing).toBe(0)
  })

  it("activa el terreno, cielo e inclina la cámara al encender 3D", async () => {
    const map = createMapMock()
    const { result } = renderHook(() => useTerrainGL({ current: map }, map))

    await act(async () => {
      await result.current.toggle3D()
    })

    expect(result.current.is3D).toBe(true)
    expect(map.setTerrain).toHaveBeenCalledWith(
      expect.objectContaining({ source: TERRAIN_SOURCE_ID }),
    )
    expect(map.setSky).toHaveBeenCalled()
    expect(map.easeTo).toHaveBeenCalledWith(
      expect.objectContaining({ pitch: 45 }),
    )
  })

  it("quita el terreno y restablece la cámara a 0° al salir de 3D", async () => {
    const map = createMapMock({ source: TERRAIN_SOURCE_ID })
    const { result } = renderHook(() => useTerrainGL({ current: map }, map))

    // Entrar
    await act(async () => {
      await result.current.toggle3D()
    })
    expect(result.current.is3D).toBe(true)

    // Salir
    await act(async () => {
      await result.current.toggle3D()
    })

    expect(result.current.is3D).toBe(false)
    expect(map.setTerrain).toHaveBeenCalledWith(null)
    expect(map.setSky).toHaveBeenCalledWith(undefined)
    expect(map.easeTo).toHaveBeenCalledWith(
      expect.objectContaining({ pitch: 0, bearing: 0 }),
    )
  })

  it("permite cambiar la exageración y actualiza el mapa", () => {
    const map = createMapMock({ source: TERRAIN_SOURCE_ID, exaggeration: 1.5 })
    const { result } = renderHook(() => useTerrainGL({ current: map }, map))

    act(() => {
      result.current.changeExaggeration(2.5)
    })

    expect(result.current.exaggeration).toBe(2.5)
    expect(map.setTerrain).toHaveBeenCalledWith(
      expect.objectContaining({ source: TERRAIN_SOURCE_ID, exaggeration: 2.5 }),
    )
  })

  it("permite cambiar la inclinación con jumpTo", () => {
    const map = createMapMock()
    const { result } = renderHook(() => useTerrainGL({ current: map }, map))

    act(() => {
      result.current.changePitch(60)
    })

    expect(result.current.pitch).toBe(60)
    expect(map.jumpTo).toHaveBeenCalledWith(
      expect.objectContaining({ pitch: 60 }),
    )
  })

  it("calcula la altura real dividiendo por el factor de exageración en elevationAt", () => {
    const map = createMapMock({ source: TERRAIN_SOURCE_ID, exaggeration: 2.0 })
    map.queryTerrainElevation.mockReturnValue(3000) // 3000m exagerado al 2x = 1500m reales

    const { result } = renderHook(() => useTerrainGL({ current: map }, map))

    const elev = result.current.elevationAt({ lng: -75.5, lat: 6.2 })
    expect(elev).toBe(1500)
  })
})
