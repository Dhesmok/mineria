import { renderHook, act } from "@testing-library/react"
import { useDualMapSyncGL } from "./useDualMapSyncGL"

jest.mock("maplibre-gl", () => {
  class MockMapLibreMap {
    constructor(options) {
      this.options = options
      this._events = {}
      this._terrain = null
      this._style = options.style
      this.center = options.center || [-74, 4]
      this.zoom = options.zoom || 5
      this.bearing = options.bearing || 0
      this.pitch = options.pitch || 0
    }
    on(event, handler) {
      if (!this._events[event]) this._events[event] = []
      this._events[event].push(handler)
      if (event === "styledata") {
        setTimeout(handler, 0)
      }
      return this
    }
    off(event, handler) {
      if (!this._events[event]) return this
      this._events[event] = this._events[event].filter((h) => h !== handler)
      return this
    }
    fire(event, data) {
      (this._events[event] || []).forEach((h) => h(data))
    }
    jumpTo({ center, zoom, bearing, pitch }) {
      if (center) this.center = center
      if (zoom !== undefined) this.zoom = zoom
      if (bearing !== undefined) this.bearing = bearing
      if (pitch !== undefined) this.pitch = pitch
    }
    getCenter() {
      return this.center
    }
    getZoom() {
      return this.zoom
    }
    getBearing() {
      return this.bearing
    }
    getPitch() {
      return this.pitch
    }
    resize() {
      this.resized = true
    }
    getStyle() {
      return this._style
    }
    getTerrain() {
      return this._terrain
    }
    setTerrain(terrain) {
      this._terrain = terrain
    }
    remove() {
      this.removed = true
    }
  }

  return {
    __esModule: true,
    Map: MockMapLibreMap,
  }
}, { virtual: true })

import { Map as MockMapLibreMap } from "maplibre-gl"

describe("useDualMapSyncGL", () => {
  let baseMap
  let baseMapRef
  let overlayContainer
  let overlayContainerRef

  beforeEach(() => {
    baseMap = new MockMapLibreMap({
      center: [-75.5, 6.2],
      zoom: 12,
      bearing: 30,
      pitch: 45,
    })
    baseMapRef = { current: baseMap }
    overlayContainer = document.createElement("div")
    overlayContainerRef = { current: overlayContainer }
  })

  it("inicializa el overlayMap y aplica mix-blend-mode", async () => {
    const { result } = renderHook(() =>
      useDualMapSyncGL(baseMapRef, baseMap, overlayContainerRef, {
        blendMode: "multiply",
        hasActiveOverlayLayers: true,
      }),
    )

    expect(overlayContainer.style.mixBlendMode).toBe("multiply")
    expect(overlayContainer.style.display).toBe("block")
    expect(result.current.overlayMapRef.current).toBeDefined()
  })

  it("cambia a mix-blend-mode: normal cuando se solicita", () => {
    const { rerender } = renderHook(
      ({ mode }) =>
        useDualMapSyncGL(baseMapRef, baseMap, overlayContainerRef, {
          blendMode: mode,
          hasActiveOverlayLayers: true,
        }),
      { initialProps: { mode: "multiply" } },
    )

    expect(overlayContainer.style.mixBlendMode).toBe("multiply")

    rerender({ mode: "normal" })
    expect(overlayContainer.style.mixBlendMode).toBe("normal")
  })

  it("oculta el contenedor cuando no hay capas temáticas activas para ahorrar GPU", () => {
    renderHook(() =>
      useDualMapSyncGL(baseMapRef, baseMap, overlayContainerRef, {
        blendMode: "multiply",
        hasActiveOverlayLayers: false,
      }),
    )

    expect(overlayContainer.style.display).toBe("none")
  })

  it("sincroniza cmara del baseMap hacia el overlayMap con jumpTo", () => {
    const { result } = renderHook(() =>
      useDualMapSyncGL(baseMapRef, baseMap, overlayContainerRef, {
        blendMode: "multiply",
        hasActiveOverlayLayers: true,
      }),
    )

    const overlay = result.current.overlayMapRef.current
    expect(overlay).toBeDefined()

    baseMap.center = [-74.1, 4.6]
    baseMap.zoom = 14
    baseMap.bearing = 90
    baseMap.pitch = 60

    act(() => {
      baseMap.fire("move")
    })

    expect(overlay.getCenter()).toEqual([-74.1, 4.6])
    expect(overlay.getZoom()).toBe(14)
    expect(overlay.getBearing()).toBe(90)
    expect(overlay.getPitch()).toBe(60)
  })

  it("sincroniza el terreno 3D cuando se activa", () => {
    const { rerender, result } = renderHook(
      ({ is3D }) =>
        useDualMapSyncGL(baseMapRef, baseMap, overlayContainerRef, {
          blendMode: "multiply",
          is3D,
          exaggeration: 2.0,
          hasActiveOverlayLayers: true,
        }),
      { initialProps: { is3D: false } },
    )

    const overlay = result.current.overlayMapRef.current
    expect(overlay.getTerrain()).toBeNull()

    rerender({ is3D: true })
    expect(overlay.getTerrain()).toEqual({
      source: "terrain",
      exaggeration: 2.0,
    })

    rerender({ is3D: false })
    expect(overlay.getTerrain()).toBeNull()
  })
})
