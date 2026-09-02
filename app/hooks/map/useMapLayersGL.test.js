import { renderHook, waitFor } from "@testing-library/react"

import { useMapLayersGL } from "./useMapLayersGL"
import { ANM_LAYERS, anmFillLayerId, anmLineLayerId, LAYERS_MIN_ZOOM } from "../../utils/anmLayers"
import { resetLayerFieldsCache } from "../../utils/layerFields"
import { clearAnmCache } from "../../utils/anmCache"

jest.mock("../../utils/tenureLayers", () => ({
  ...jest.requireActual("../../utils/tenureLayers"),
  findTenureLayerNumbers: async () => ({ "Título Vigente": 3, "Solicitud Vigente": 4 }),
}))

// Mismo motivo que en `useExpedientSearchGL.test.js`: MapLibre no arranca en
// jsdom y se publica solo como ESM, así que el doble se registra en virtual.
jest.mock(
  "maplibre-gl",
  () => ({
    __esModule: true,
    Marker: class {
      setLngLat() {
        return this
      }
      addTo() {
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

const createMap = (zoom) => ({
  zoomRanges: {},
  getZoom: () => zoom,
  getBounds: () => ({
    getWest: () => -76,
    getSouth: () => 6,
    getEast: () => -75,
    getNorth: () => 7,
  }),
  getSource: () => ({ setData: jest.fn() }),
  getLayer: (id) => ({ id }),
  getTerrain: () => null,
  getCanvas: () => ({ style: {}, clientWidth: 800, clientHeight: 600 }),
  project: () => ({ x: 0, y: 0 }),
  setLayerZoomRange: jest.fn(function (id, min, max) {
    this.zoomRanges[id] = [min, max]
  }),
  setLayoutProperty: jest.fn(),
  setPaintProperty: jest.fn(),
  setFilter: jest.fn(),
  moveLayer: jest.fn(),
  on: jest.fn(),
  off: jest.fn(),
})

const soloTitulos = () =>
  Object.fromEntries(
    ANM_LAYERS.map(({ key }) => [key, { on: key === "title", opacity: 0.6 }]),
  )

const render = (map, filters) =>
  renderHook(() =>
    useMapLayersGL(
      { current: map },
      map,
      soloTitulos(),
      ANM_LAYERS.map((l) => l.key),
      filters,
      jest.fn(),
      jest.fn(),
    ),
  )

const barriendo = { scope: "layer", byArea: { mineria: { selections: { estado: ["Vigente"] } } } }

beforeEach(() => {
  jest.clearAllMocks()
  resetLayerFieldsCache()
  clearAnmCache()
  jest.spyOn(console, "error").mockImplementation(() => {})
})

afterEach(() => jest.restoreAllMocks())

describe("el zoom mínimo de las capas", () => {
  it("se mantiene cuando se consulta lo que se está viendo", async () => {
    const map = createMap(12)
    global.fetch = jest.fn(async () => ({ ok: true, json: async () => ({ features: [] }) }))

    render(map, { scope: "viewport", byArea: {} })

    await waitFor(() => expect(map.setLayerZoomRange).toHaveBeenCalled())
    expect(map.zoomRanges[anmFillLayerId("title")][0]).toBe(LAYERS_MIN_ZOOM)
    expect(map.zoomRanges[anmLineLayerId("title")][0]).toBe(LAYERS_MIN_ZOOM)
  })

  it("no le pone tope por arriba", () => {
    // MapLibre esconde la capa *a partir* de su `maxzoom`, así que pasarle el
    // zoom máximo del mapa (22) apagaría los títulos justo al llegar a él:
    // arreglar el tope de abajo no puede meter uno nuevo por arriba.
    const map = createMap(12)
    global.fetch = jest.fn(async () => ({ ok: true, json: async () => ({ features: [] }) }))

    render(map, { scope: "viewport", byArea: {} })

    expect(map.zoomRanges[anmFillLayerId("title")][1]).toBeGreaterThan(22)
  })

  it("se levanta al barrer la capa entera", async () => {
    // Es el fallo que dejaba "Toda la capa" sin dibujar nada: el hook desactiva
    // el tope para consultar, pero el del estilo seguía puesto y MapLibre se
    // negaba a pintar lo que acababa de llegar. El panel decía «37 de 412» sobre
    // un mapa vacío, y sin el aviso de "acerca el mapa", que en ese modo no sale.
    const map = createMap(5)
    global.fetch = jest.fn(async () => ({ ok: true, json: async () => ({ features: [] }) }))

    render(map, barriendo)

    await waitFor(() => expect(map.zoomRanges[anmFillLayerId("title")]).toBeDefined())
    expect(map.zoomRanges[anmFillLayerId("title")][0]).toBe(0)
    expect(map.zoomRanges[anmLineLayerId("title")][0]).toBe(0)
  })
})

describe("el where de «toda la capa»", () => {
  /** Las URLs que se pidieron, para poder leerles el `where`. */
  const urlsPedidas = () => global.fetch.mock.calls.map(([url]) => String(url))

  /**
   * El `where` de la consulta, ya legible.
   *
   * Se lee con `URLSearchParams` y no con `decodeURIComponent` porque el `+` que
   * codifica un espacio no lo deshace este último: la cláusula salía como
   * `ESTADO+IN+('Vigente')` y la comparación fallaba por eso, no por el `where`.
   */
  const whereDeLaConsulta = () => {
    const url = urlsPedidas().find((u) => u.includes("/query"))
    return new URL(url).searchParams.get("where")
  }

  it("solo nombra campos que la capa declara", async () => {
    // Nombrar uno que no existe hace que ArcGIS responda HTTP 200 con un cuerpo
    // de error —trampa nº 2— y el visor saca el banner rojo. El estado se llama
    // TITULO_ESTADO en unas capas y STATUS o ESTADO en otras, así que preguntar
    // por los tres rompía justo lo que el respaldo venía a resolver.
    global.fetch = jest.fn(async (url) => ({
      ok: true,
      json: async () =>
        String(url).includes("/query")
          ? { features: [] }
          : { fields: [{ name: "ESTADO" }, { name: "AREA_HA" }] },
    }))

    render(createMap(5), barriendo)

    await waitFor(() => expect(urlsPedidas().some((u) => u.includes("/query"))).toBe(true))
    const consulta = whereDeLaConsulta()

    expect(consulta).toContain("ESTADO IN ('Vigente')")
    expect(consulta).not.toContain("TITULO_ESTADO")
    expect(consulta).not.toContain("STATUS")
  })

  it("si no se pueden leer los campos, pregunta como antes", async () => {
    // No poder consultar los metadatos no puede dejar sin filtrar: el peor caso
    // vuelve a ser el de siempre, no uno nuevo.
    global.fetch = jest.fn(async (url) =>
      String(url).includes("/query")
        ? { ok: true, json: async () => ({ features: [] }) }
        : { ok: false, status: 500 },
    )

    render(createMap(5), barriendo)

    await waitFor(() => expect(urlsPedidas().some((u) => u.includes("/query"))).toBe(true))
    const consulta = whereDeLaConsulta()

    expect(consulta).toContain("TITULO_ESTADO IN ('Vigente')")
  })

  it("pide cero resultados si la capa no puede cumplir el filtro", async () => {
    // Callar la condición devolvería la capa entera: enseñar como resultado
    // filtrado lo que no se ha filtrado es peor que no devolver nada.
    global.fetch = jest.fn(async (url) => ({
      ok: true,
      json: async () =>
        String(url).includes("/query") ? { features: [] } : { fields: [{ name: "OBJECTID" }] },
    }))

    render(createMap(5), barriendo)

    await waitFor(() => expect(urlsPedidas().some((u) => u.includes("/query"))).toBe(true))
    expect(decodeURIComponent(urlsPedidas().find((u) => u.includes("/query")))).toContain("1=0")
  })
})
