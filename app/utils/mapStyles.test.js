import { createBaseStyle, BASE_LAYERS, INITIAL_CENTER, MAX_ZOOM } from "./mapStyles"
import {
  ANM_LAYERS,
  anmFillLayerId,
  anmLineLayerId,
  anmSourceId,
  LAYERS_MIN_ZOOM,
} from "./anmLayers"

const layerById = (style, id) => style.layers.find((layer) => layer.id === id)
const indexOfLayer = (style, id) => style.layers.findIndex((layer) => layer.id === id)

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

describe("capas de la ANM en el estilo", () => {
  it("declara las cuatro capas vacías y apagadas desde el arranque", () => {
    // Se declaran de una vez para que el orden de apilamiento no dependa de en
    // qué orden pulse el usuario los interruptores.
    const style = createBaseStyle()

    ANM_LAYERS.forEach(({ key }) => {
      expect(style.sources[anmSourceId(key)].data.features).toEqual([])
      expect(layerById(style, anmFillLayerId(key)).layout.visibility).toBe("none")
      expect(layerById(style, anmLineLayerId(key)).layout.visibility).toBe("none")
    })
  })

  it("separa relleno y contorno", () => {
    // Es lo que permite que el slider de opacidad afecte solo al relleno y deje
    // el contorno nítido, como hacía el visor Leaflet.
    const style = createBaseStyle()

    ANM_LAYERS.forEach(({ key, fillColor, lineColor }) => {
      expect(layerById(style, anmFillLayerId(key)).paint["fill-color"]).toBe(fillColor)
      expect(layerById(style, anmLineLayerId(key)).paint["line-color"]).toBe(lineColor)
    })
  })

  it("no dibuja las capas por debajo del zoom mínimo", () => {
    // A zoom bajo estas capas traen decenas de miles de polígonos: ArcGIS corta
    // la respuesta y el mapa mostraba un subconjunto incompleto sin avisar.
    const style = createBaseStyle()

    ANM_LAYERS.forEach(({ key }) => {
      expect(layerById(style, anmFillLayerId(key)).minzoom).toBe(LAYERS_MIN_ZOOM)
      expect(layerById(style, anmLineLayerId(key)).minzoom).toBe(LAYERS_MIN_ZOOM)
    })
  })

  it("deja las capas de la ANM por encima del mapa base", () => {
    // En MapLibre el orden de la lista es el orden de apilamiento: una capa base
    // declarada después taparía los títulos por completo.
    const style = createBaseStyle()
    const lastBase = Math.max(
      indexOfLayer(style, BASE_LAYERS.osm),
      indexOfLayer(style, BASE_LAYERS.satellite),
    )

    ANM_LAYERS.forEach(({ key }) => {
      expect(indexOfLayer(style, anmFillLayerId(key))).toBeGreaterThan(lastBase)
    })
  })

  it("mantiene el contorno de cada capa por encima de su propio relleno", () => {
    const style = createBaseStyle()

    ANM_LAYERS.forEach(({ key }) => {
      expect(indexOfLayer(style, anmLineLayerId(key))).toBeGreaterThan(
        indexOfLayer(style, anmFillLayerId(key)),
      )
    })
  })
})
