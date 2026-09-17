import { renderHook } from "@testing-library/react"

import { useUserLayersGL } from "./useUserLayersGL"
import { SEARCH_LAYERS } from "../../utils/mapStyles"
import {
  buildUserLayer,
  userFillLayerId,
  userLineLayerId,
  userPointLayerId,
  userSourceId,
} from "../../utils/userLayers"

// Mismo motivo que en los demás hooks del mapa: MapLibre no arranca en jsdom y se
// publica solo como ESM, así que el doble se registra en virtual.
jest.mock(
  "maplibre-gl",
  () => ({
    __esModule: true,
    Popup: class {
      setLngLat() {
        return this
      }
      setHTML(html) {
        this.html = html
        return this
      }
      addTo() {
        return this
      }
      remove() {
        return this
      }
    },
  }),
  { virtual: true },
)

/**
 * Un mapa de mentira que lleva la cuenta de sus capas y fuentes.
 *
 * Tiene que llevarla de verdad —y no ser cuatro `jest.fn()`— porque lo que se
 * prueba aquí es justo eso: que este hook, el único que crea y destruye capas del
 * estilo, no deje una fuente huérfana ni intente añadir dos veces la misma capa.
 */
const createMap = () => {
  const capas = new Map()
  const fuentes = new Map()
  const contenedor = document.createElement("div")
  jest.spyOn(contenedor, "addEventListener")

  const map = {
    capas,
    fuentes,
    orden: [],
    getLayer: (id) => capas.get(id),
    getSource: (id) => fuentes.get(id),
    addSource: jest.fn((id, def) => {
      if (fuentes.has(id)) throw new Error(`fuente repetida: ${id}`)
      fuentes.set(id, { ...def, setData: jest.fn() })
    }),
    addLayer: jest.fn((def, antesDe) => {
      if (capas.has(def.id)) throw new Error(`capa repetida: ${def.id}`)
      capas.set(def.id, { ...def, antesDe })
      map.orden.push(def.id)
    }),
    removeLayer: jest.fn((id) => {
      if (!capas.has(id)) throw new Error(`no existe la capa ${id}`)
      capas.delete(id)
    }),
    removeSource: jest.fn((id) => {
      // Como MapLibre: negarse a borrar una fuente que alguna capa sigue usando.
      const enUso = [...capas.values()].some((capa) => capa.source === id)
      if (enUso) throw new Error(`la fuente ${id} sigue en uso`)
      fuentes.delete(id)
    }),
    setLayoutProperty: jest.fn((id, prop, valor) => {
      capas.get(id).layout = { ...capas.get(id).layout, [prop]: valor }
    }),
    setPaintProperty: jest.fn((id, prop, valor) => {
      capas.get(id).paint = { ...capas.get(id).paint, [prop]: valor }
    }),
    queryRenderedFeatures: jest.fn(() => []),
    getCanvas: () => ({ style: {} }),
    // El reconocedor de toques no se engancha con `map.on` sino a los eventos del
    // contenedor del lienzo, así que aquí hace falta un elemento de verdad.
    getCanvasContainer: () => contenedor,
    on: jest.fn(),
    off: jest.fn(),
  }

  // La capa del resultado de la búsqueda es la señal de «el estilo ya está», y el
  // sitio por debajo del cual entran las capas cargadas.
  capas.set(SEARCH_LAYERS.fill, { id: SEARCH_LAYERS.fill })
  map.contenedor = contenedor
  return map
}

const capaDePrueba = (id, features = 1) =>
  buildUserLayer({
    id,
    label: `Capa ${id}`,
    source: `capa${id}.geojson`,
    featureCollection: {
      type: "FeatureCollection",
      features: Array.from({ length: features }, (_, i) => ({
        type: "Feature",
        geometry: { type: "Point", coordinates: [-75 - i / 100, 6] },
        properties: { NOMBRE: `punto ${i}` },
      })),
    },
    crsId: "4686",
    fillColor: "#e07a3f",
    lineColor: "#8f4a20",
  })

const render = (map, capas, estado) =>
  renderHook(
    ({ capas: lista, estado: st }) => useUserLayersGL({ current: map }, map, lista, st, true),
    { initialProps: { capas, estado } },
  )

const encendida = (capa) => ({
  [capa.key]: { on: true, opacity: 0.4, fillColor: "#123456", lineColor: "#654321" },
})

describe("montar y quitar", () => {
  it("añade una fuente y tres capas por archivo, debajo de la búsqueda", () => {
    const map = createMap()
    const capa = capaDePrueba("1")
    render(map, [capa], encendida(capa))

    expect(map.fuentes.has(userSourceId(capa.key))).toBe(true)
    ;[userFillLayerId, userLineLayerId, userPointLayerId].forEach((id) => {
      expect(map.capas.get(id(capa.key)).antesDe).toBe(SEARCH_LAYERS.fill)
    })
    // El relleno primero y los puntos al final: el contorno tiene que quedar por
    // encima de su propio relleno translúcido.
    expect(map.orden).toEqual([
      userFillLayerId(capa.key),
      userLineLayerId(capa.key),
      userPointLayerId(capa.key),
    ])
  })

  /**
   * Una capa `circle` de MapLibre dibuja un círculo **en cada vértice de cada
   * geometría**, no solo en los puntos. Sin filtrar por tipo, un lindero de cinco
   * esquinas sale con cinco pelotas encima y el círculo de una bocamina se
   * convierte en un anillo de bolitas. Se vio en una captura; ninguna prueba sobre
   * los datos podía verlo, y esta solo puede comprobar que el filtro está puesto.
   */
  it("la capa de puntos solo dibuja puntos, no los vértices de todo", () => {
    const map = createMap()
    const capa = capaDePrueba("1")
    render(map, [capa], encendida(capa))

    expect(map.capas.get(userPointLayerId(capa.key)).filter).toEqual([
      "==",
      ["geometry-type"],
      "Point",
    ])
    // Y las otras dos no llevan filtro: `fill` ya solo pinta polígonos, y `line`
    // tiene que pintar las líneas *y* el contorno de los polígonos.
    expect(map.capas.get(userFillLayerId(capa.key)).filter).toBeUndefined()
    expect(map.capas.get(userLineLayerId(capa.key)).filter).toBeUndefined()
  })

  /**
   * Nacen ocultas y las enciende el efecto del estado. Ponerlas visibles al
   * crearlas da un parpadeo con los colores de fábrica antes de tomar los suyos.
   */
  it("nace oculta y la enciende el estado del panel", () => {
    const map = createMap()
    const capa = capaDePrueba("1")
    render(map, [capa], encendida(capa))

    const relleno = map.capas.get(userFillLayerId(capa.key))
    expect(relleno.layout.visibility).toBe("visible")
    expect(relleno.paint["fill-opacity"]).toBe(0.4)
    expect(relleno.paint["fill-color"]).toBe("#123456")
    expect(map.capas.get(userLineLayerId(capa.key)).paint["line-color"]).toBe("#654321")
  })

  it("no vuelve a añadir lo que ya está puesto al repetirse el render", () => {
    const map = createMap()
    const capa = capaDePrueba("1")
    const { rerender } = render(map, [capa], encendida(capa))

    rerender({ capas: [capa], estado: encendida(capa) })

    expect(map.addSource).toHaveBeenCalledTimes(1)
    expect(map.addLayer).toHaveBeenCalledTimes(3)
  })

  // Quitar la fuente antes que las capas lanza en MapLibre, y dejaría el visor con
  // una excepción a medio camino y la fuente puesta para siempre.
  it("al quitar una capa se va también su fuente", () => {
    const map = createMap()
    const capa = capaDePrueba("1")
    const { rerender } = render(map, [capa], encendida(capa))

    rerender({ capas: [], estado: {} })

    expect(map.capas.has(userFillLayerId(capa.key))).toBe(false)
    expect(map.fuentes.has(userSourceId(capa.key))).toBe(false)
  })

  it("quita una y deja la otra", () => {
    const map = createMap()
    const [a, b] = [capaDePrueba("1"), capaDePrueba("2")]
    const { rerender } = render(map, [a, b], { ...encendida(a), ...encendida(b) })

    rerender({ capas: [b], estado: encendida(b) })

    expect(map.fuentes.has(userSourceId(a.key))).toBe(false)
    expect(map.fuentes.has(userSourceId(b.key))).toBe(true)
  })

  /**
   * Cambiar el sistema de coordenadas de una capa cargada no la vuelve a montar:
   * es la misma capa con otra geometría, y quitarla y ponerla la mandaría al
   * final del apilamiento.
   */
  it("al cambiar de sistema solo reemplaza los datos", () => {
    const map = createMap()
    const capa = capaDePrueba("1")
    const { rerender } = render(map, [capa], encendida(capa))

    const movida = { ...capa, data: { type: "FeatureCollection", features: [] } }
    rerender({ capas: [movida], estado: encendida(movida) })

    expect(map.addLayer).toHaveBeenCalledTimes(3)
    expect(map.fuentes.get(userSourceId(capa.key)).setData).toHaveBeenCalledWith(movida.data)
  })

  // La condición de arranque es que exista la capa de la búsqueda, no
  // `isStyleLoaded()`: ver la trampa nº 16 de CLAUDE.md.
  it("no toca un mapa cuyo estilo todavía no está", () => {
    const map = createMap()
    map.capas.delete(SEARCH_LAYERS.fill)
    render(map, [capaDePrueba("1")], {})

    expect(map.addSource).not.toHaveBeenCalled()
    expect(map.addLayer).not.toHaveBeenCalled()
  })
})

describe("la ficha al pulsar", () => {
  const pulsar = (map) => {
    const alPulsar = map.on.mock.calls.find(([evento]) => evento === "click")[1]
    alPulsar({ point: [10, 10], lngLat: { lng: -75, lat: 6 } })
  }

  it("enseña los atributos de la figura pulsada con el nombre de su capa", () => {
    const map = createMap()
    const capa = capaDePrueba("1")
    render(map, [capa], encendida(capa))

    map.queryRenderedFeatures = jest.fn(() => [
      { layer: { id: userPointLayerId(capa.key) }, properties: { NOMBRE: "punto 0" } },
    ])

    pulsar(map)

    // No revienta y consulta solo las capas cargadas, no el mapa base.
    const [, opciones] = map.queryRenderedFeatures.mock.calls[0]
    expect(opciones.layers).toEqual([
      userFillLayerId(capa.key),
      userLineLayerId(capa.key),
      userPointLayerId(capa.key),
    ])
  })

  it("no consulta nada si no hay ninguna capa cargada", () => {
    const map = createMap()
    render(map, [], {})

    map.queryRenderedFeatures = jest.fn(() => [])
    pulsar(map)

    expect(map.queryRenderedFeatures).not.toHaveBeenCalled()
  })

  // En el teléfono el clic no llega: `mapbox-gl-draw` cancela el `touchend` y sin
  // él el navegador no genera el clic de compatibilidad (trampa nº 27).
  it("escucha también los toques, no solo el clic", () => {
    const map = createMap()
    render(map, [capaDePrueba("1")], {})

    expect(map.on.mock.calls.map(([evento]) => evento)).toContain("click")

    // Los toques no pasan por `map.on`: se escuchan en el contenedor del lienzo.
    // Ver `utils/tapGesture`.
    const enElLienzo = map.contenedor.addEventListener.mock.calls.map(([evento]) => evento)
    expect(enElLienzo).toContain("touchstart")
    expect(enElLienzo).toContain("touchend")
  })
})
