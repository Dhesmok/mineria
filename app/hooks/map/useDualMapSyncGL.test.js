import { renderHook, act } from "@testing-library/react"
import { useDualMapSyncGL } from "./useDualMapSyncGL"

/**
 * El lienzo de arriba: el segundo mapa, donde van las capas que se funden con
 * el relieve.
 *
 * Lo que se comprueba aquí es casi todo *cuándo*, no *qué*: cuándo se construye
 * —después del de abajo, para heredarle la cámara y un contenedor ya medido—,
 * cuándo se anuncia —solo con el estilo parseado, o los hooks que le cuelgan
 * capas se rinden en silencio— y cuándo se quita —siempre, que es lo que dejó
 * de pasar y abandonaba un contexto WebGL por cada montaje—.
 *
 * Quién lo esconde y quién lo funde ya no está aquí: eso lo pone React al pintar
 * (ver el JSX de `MapComponentGL`), porque así el contenedor ya tiene el tamaño
 * bueno cuando estos efectos van a medirlo.
 */

jest.mock(
  "maplibre-gl",
  () => {
    class MockMapLibreMap {
      constructor(options) {
        this.options = options
        this._events = {}
        this._terrain = null
        this._style = options.style
        this.center = options.center || [-74, 4]
        this.zoom = options.zoom ?? 5
        this.bearing = options.bearing ?? 0
        this.pitch = options.pitch ?? 0
        this.removed = false
        this.repintados = 0
      }
      on(event, handler) {
        if (!this._events[event]) this._events[event] = []
        this._events[event].push(handler)
        return this
      }
      off(event, handler) {
        if (!this._events[event]) return this
        this._events[event] = this._events[event].filter((h) => h !== handler)
        return this
      }
      fire(event, data) {
        ;(this._events[event] || []).forEach((h) => h(data))
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
      /** Con el estilo ya parseado. `estiloListo = false` simula el arranque. */
      getLayer(id) {
        if (!this.estiloListo) return undefined
        return (this._style?.layers || []).find((capa) => capa.id === id)
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
    MockMapLibreMap.prototype.estiloListo = true

    return { __esModule: true, Map: MockMapLibreMap }
  },
  { virtual: true },
)

import { Map as MockMapLibreMap } from "maplibre-gl"

describe("useDualMapSyncGL", () => {
  let baseMap
  let baseMapRef
  let overlayContainer
  let overlayContainerRef

  const montar = (opciones = {}, mapaBase = baseMap) =>
    renderHook(
      (props) =>
        useDualMapSyncGL(baseMapRef, props.mapaBase, overlayContainerRef, {
          blendMode: "multiply",
          hasActiveOverlayLayers: true,
          ...props.opciones,
        }),
      { initialProps: { mapaBase, opciones } },
    )

  beforeEach(() => {
    baseMap = new MockMapLibreMap({ center: [-75.5, 6.2], zoom: 12, bearing: 30, pitch: 45 })
    baseMapRef = { current: baseMap }
    overlayContainer = document.createElement("div")
    overlayContainerRef = { current: overlayContainer }
  })

  it("no construye nada mientras no exista el mapa de abajo", () => {
    // Construirlo antes le daba la vista de fábrica en vez de la que el usuario
    // tuviera guardada, y un contenedor que todavía podía medir cero.
    const { result } = montar({}, null)
    expect(result.current.overlayMapRef.current).toBeNull()
    expect(result.current.overlayMapInstance).toBeNull()
  })

  it("hereda la cámara del mapa de abajo", () => {
    const { result } = montar()
    const overlay = result.current.overlayMapRef.current

    expect(overlay.getCenter()).toEqual([-75.5, 6.2])
    expect(overlay.getZoom()).toBe(12)
    expect(overlay.getBearing()).toBe(30)
    expect(overlay.getPitch()).toBe(45)
  })

  it("pide guardar el búfer con el nombre que MapLibre 6 entiende", () => {
    // `preserveDrawingBuffer` suelto —o bajo cualquier otro nombre— se ignora en
    // silencio, y sin él la exportación sale sin las capas de este lienzo.
    const { result } = montar()
    const opciones = result.current.overlayMapRef.current.options

    expect(opciones.canvasContextAttributes).toEqual({ preserveDrawingBuffer: true })
    expect(opciones.interactive).toBe(false)
  })

  it("no lo anuncia hasta que el estilo esté parseado", () => {
    // Es la trampa del mapa de abajo otra vez: quien recibe el aviso comprueba
    // `getLayer()` y, si el estilo todavía no está, se rinde y no vuelve a
    // intentarlo. Anunciarlo pronto dejaba las capas sin aparecer nunca.
    MockMapLibreMap.prototype.estiloListo = false
    try {
      const { result } = montar()
      expect(result.current.overlayMapRef.current).not.toBeNull()
      expect(result.current.overlayMapInstance).toBeNull()

      MockMapLibreMap.prototype.estiloListo = true
      act(() => {
        result.current.overlayMapRef.current.fire("styledata")
      })

      expect(result.current.overlayMapInstance).toBe(result.current.overlayMapRef.current)
    } finally {
      MockMapLibreMap.prototype.estiloListo = true
    }
  })

  it("sincroniza la cámara del mapa de abajo hacia el de arriba", () => {
    const { result } = montar()
    const overlay = result.current.overlayMapRef.current

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
    expect(overlay.getTerrain()).toEqual({ source: "terrain", exaggeration: 2.0 })

    rerender({ is3D: false })
    expect(overlay.getTerrain()).toBeNull()
  })

  it("le pone el relieve al aparecer, aunque el 3D ya estuviera puesto", () => {
    // El mapa de arriba nace después del de abajo, así que cuando alguien entra
    // en 3D con las capas apagadas, el efecto del terreno ya corrió sin mapa al
    // que aplicárselo. Tiene que volver a correr cuando aparezca.
    const { rerender, result } = renderHook(
      ({ mapaBase }) =>
        useDualMapSyncGL(baseMapRef, mapaBase, overlayContainerRef, {
          blendMode: "multiply",
          is3D: true,
          exaggeration: 1.5,
          hasActiveOverlayLayers: true,
        }),
      { initialProps: { mapaBase: null } },
    )

    expect(result.current.overlayMapRef.current).toBeNull()

    rerender({ mapaBase: baseMap })
    expect(result.current.overlayMapRef.current.getTerrain()).toEqual({
      source: "terrain",
      exaggeration: 1.5,
    })
  })

  it("se remide al volver a encenderse, que es cuando su lienzo medía cero", () => {
    const { rerender, result } = renderHook(
      ({ activas }) =>
        useDualMapSyncGL(baseMapRef, baseMap, overlayContainerRef, {
          blendMode: "multiply",
          hasActiveOverlayLayers: activas,
        }),
      { initialProps: { activas: false } },
    )

    const overlay = result.current.overlayMapRef.current
    overlay.resized = false
    baseMap.center = [-73.0, 7.0]

    rerender({ activas: true })

    expect(overlay.resized).toBe(true)
    expect(overlay.getCenter()).toEqual([-73.0, 7.0])
  })

  it("lo quita al desmontar aunque el estilo no esté listo", () => {
    // La guarda anterior preguntaba por `getStyle()`, que lanza mientras el
    // estilo se parsea, y el `catch` se tragaba el fallo dejando el mapa vivo:
    // un contexto WebGL y un lienzo abandonados por cada montaje.
    const { result, unmount } = montar()
    const overlay = result.current.overlayMapRef.current
    overlay.getStyle = () => {
      throw new Error("El estilo todavía no está listo")
    }

    unmount()

    expect(overlay.removed).toBe(true)
  })
})
