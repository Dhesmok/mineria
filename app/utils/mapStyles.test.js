import {
  createBaseStyle,
  BASE_LAYERS,
  HILLSHADE_LAYER_ID,
  INITIAL_CENTER,
  MAX_ZOOM,
  TERRAIN_SOURCE_ID,
} from "./mapStyles"
import {
  ANM_LAYERS,
  anmFillLayerId,
  anmLineLayerId,
  anmSourceId,
  LAYERS_MIN_ZOOM,
} from "./anmLayers"
import { ALL_BASEMAP_LAYERS, BASEMAP_LAYERS, visibleBasemapLayers } from "./basemaps"

const layerById = (style, id) => style.layers.find((layer) => layer.id === id)
const indexOfLayer = (style, id) => style.layers.findIndex((layer) => layer.id === id)

describe("createBaseStyle", () => {
  it("declara todos los fondos desde el arranque", () => {
    // Es lo que permite alternar mapa/satélite sin llamar a setStyle(), que se
    // llevaría por delante las capas de la ANM y lo dibujado por el usuario.
    const style = createBaseStyle()

    ALL_BASEMAP_LAYERS.forEach((id) => {
      expect(layerById(style, id)).toBeDefined()
      expect(style.sources[`${id}-src`]).toBeDefined()
    })
  })

  it("deja visible solo el fondo pedido", () => {
    // Cambiar de fondo es encender unas capas y apagar otras, no reconstruir el
    // estilo: eso se llevaría por delante las capas de la ANM y lo dibujado.
    const esri = createBaseStyle("esri")
    const visibles = ALL_BASEMAP_LAYERS.filter(
      (id) => layerById(esri, id).layout.visibility === "visible",
    )
    expect(visibles).toEqual(visibleBasemapLayers("esri", true))
  })

  it("arranca en el fondo por omisión cuando no se pide nada", () => {
    // Es el gris claro de CARTO, no la imagen de satélite: lo primero que este
    // visor tiene que dejar ver son los títulos, y sobre la imagen sus
    // contornos se pierden.
    const style = createBaseStyle()
    expect(layerById(style, BASEMAP_LAYERS.cartoLabels).layout.visibility).toBe("visible")
    expect(layerById(style, BASEMAP_LAYERS.googleHybrid).layout.visibility).toBe("none")
    expect(layerById(style, BASEMAP_LAYERS.osm).layout.visibility).toBe("none")
  })

  it("los fondos van antes que todo lo demás", () => {
    // En MapLibre el orden de la lista es el orden de pintado: un fondo por
    // encima taparía los títulos.
    const style = createBaseStyle()
    const ids = style.layers.map((l) => l.id)
    const ultimoFondo = Math.max(...ALL_BASEMAP_LAYERS.map((id) => ids.indexOf(id)))
    expect(ultimoFondo).toBeLessThan(ids.indexOf(anmFillLayerId(ANM_LAYERS[0].key)))
  })

  it("marca hasta qué zoom existen teselas reales de cada fuente", () => {
    // Sin `maxzoom` MapLibre pide teselas que el servidor no tiene y el mapa se
    // queda en blanco al acercarse. Con él, estira la última que sí existe.
    const style = createBaseStyle()
    ALL_BASEMAP_LAYERS.forEach((id) => {
      const source = style.sources[`${id}-src`]
      expect(source.maxzoom).toBeGreaterThan(0)
      expect(source.maxzoom).toBeLessThanOrEqual(MAX_ZOOM)
    })
  })

  it("atribuye cada fuente", () => {
    // Las licencias exigen el crédito en pantalla; sin `attribution` el control
    // no lo muestra.
    const style = createBaseStyle()
    ALL_BASEMAP_LAYERS.forEach((id) => {
      expect(style.sources[`${id}-src`].attribution).toBeTruthy()
    })
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

describe("terreno y relieve en el estilo", () => {
  it("declara la fuente de elevación con la codificación terrarium", () => {
    // La fórmula de decodificación depende de esto. Con la codificación
    // equivocada el mapa no falla: sale un relieve inventado.
    const source = createBaseStyle().sources[TERRAIN_SOURCE_ID]
    expect(source.type).toBe("raster-dem")
    expect(source.encoding).toBe("terrarium")
  })

  it("usa las teselas públicas de AWS, sin clave ni cuenta", () => {
    const source = createBaseStyle().sources[TERRAIN_SOURCE_ID]
    expect(source.tiles[0]).toContain("elevation-tiles-prod")
    expect(source.tiles[0]).not.toContain("access_token")
    expect(source.tiles[0]).not.toContain("key=")
  })

  it("declara el relieve apagado desde el arranque", () => {
    // Mientras esté oculto no descarga ni una tesela de elevación: por eso puede
    // estar declarado sin costo.
    expect(layerById(createBaseStyle(), HILLSHADE_LAYER_ID).layout.visibility).toBe("none")
  })

  it("pone el relieve encima del mapa base y debajo de las capas de la ANM", () => {
    // Es contexto del terreno: no debe tapar los títulos, pero sí ir sobre el
    // mapa de fondo.
    const style = createBaseStyle()
    const hillshade = indexOfLayer(style, HILLSHADE_LAYER_ID)

    expect(hillshade).toBeGreaterThan(indexOfLayer(style, BASE_LAYERS.osm))
    expect(hillshade).toBeGreaterThan(indexOfLayer(style, BASE_LAYERS.satellite))
    ANM_LAYERS.forEach(({ key }) => {
      expect(indexOfLayer(style, anmFillLayerId(key))).toBeGreaterThan(hillshade)
    })
  })
})
