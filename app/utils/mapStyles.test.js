import { createBaseStyle, BASE_LAYERS, INITIAL_CENTER, MAX_ZOOM } from "./mapStyles"

const layerById = (style, id) => style.layers.find((layer) => layer.id === id)

describe("createBaseStyle", () => {
  it("declara las dos capas base desde el arranque", () => {
    // Es lo que permite alternar mapa/satélite sin llamar a setStyle(), que se
    // llevaría por delante las capas de la ANM y lo dibujado por el usuario.
    const style = createBaseStyle()

    expect(layerById(style, BASE_LAYERS.osm)).toBeDefined()
    expect(layerById(style, BASE_LAYERS.satellite)).toBeDefined()
  })

  it("deja visible solo la capa pedida", () => {
    const osm = createBaseStyle("osm")
    expect(layerById(osm, BASE_LAYERS.osm).layout.visibility).toBe("visible")
    expect(layerById(osm, BASE_LAYERS.satellite).layout.visibility).toBe("none")

    const satellite = createBaseStyle("satellite")
    expect(layerById(satellite, BASE_LAYERS.osm).layout.visibility).toBe("none")
    expect(layerById(satellite, BASE_LAYERS.satellite).layout.visibility).toBe("visible")
  })

  it("arranca en mapa cuando no se pide nada", () => {
    const style = createBaseStyle()
    expect(layerById(style, BASE_LAYERS.osm).layout.visibility).toBe("visible")
  })

  it("marca hasta qué zoom existen teselas reales de cada fuente", () => {
    // Sin `maxzoom` MapLibre pide teselas que el servidor no tiene y el mapa se
    // queda en blanco al acercarse. Con él, estira la última que sí existe.
    const style = createBaseStyle()
    expect(style.sources.osm.maxzoom).toBe(19)
    expect(style.sources.satellite.maxzoom).toBeGreaterThan(19)
    expect(style.sources.osm.maxzoom).toBeLessThan(MAX_ZOOM)
  })

  it("atribuye cada fuente", () => {
    // OSM exige el crédito en pantalla; sin `attribution` el control no lo muestra.
    const style = createBaseStyle()
    expect(style.sources.osm.attribution).toMatch(/OpenStreetMap/)
    expect(style.sources.satellite.attribution).toMatch(/Google/)
  })

  it("centra el mapa en Colombia con las coordenadas en el orden de MapLibre", () => {
    // [lon, lat], al revés que Leaflet. Invertirlas deja el mapa en el Índico.
    const [lon, lat] = INITIAL_CENTER
    expect(lon).toBeLessThan(0)
    expect(lat).toBeGreaterThan(0)
    expect(lat).toBeLessThan(15)
  })
})
