import {
  createBaseStyle,
  createOverlayStyle,
  BASE_LAYERS,
  HILLSHADE_LAYER_ID,
  INITIAL_CENTER,
  MAX_ZOOM,
  TERRAIN_SOURCE_ID,
  TRANSPARENT_PIXEL,
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
    // La imagen de satélite de Google, con sus nombres. Se sopesó dejar el gris
    // claro —sobre la imagen los contornos de los títulos se leen peor— y se
    // eligió que quien abre el visor reconozca dónde está de un vistazo.
    const style = createBaseStyle()
    expect(layerById(style, BASEMAP_LAYERS.googleHybrid).layout.visibility).toBe("visible")
    expect(layerById(style, BASEMAP_LAYERS.grayBase).layout.visibility).toBe("none")
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

describe("TRANSPARENT_PIXEL", () => {
  /**
   * Se le leen los píxeles de verdad, decodificando el PNG.
   *
   * **«Parece transparente» es exactamente lo que ya falló.** El que había era
   * azul al 50 % —bytes `0, 0, 255, 127`— y nadie lo notó porque el nombre de la
   * constante decía otra cosa. Como las fuentes de tipo `image` nacen cubriendo
   * el mundo entero, eso pintaba el país de azul al encender una capa del SGC sin
   * departamentos marcados. Una prueba que solo comparase la cadena base64 con
   * ella misma habría pasado igual de contenta.
   */
  const pixelesDe = (dataUrl) => {
    const zlib = require("zlib")
    const png = Buffer.from(dataUrl.split(",")[1], "base64")

    expect(png.subarray(0, 8)).toEqual(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))
    expect(png.readUInt32BE(16)).toBe(1) // ancho
    expect(png.readUInt32BE(20)).toBe(1) // alto
    expect(png[25]).toBe(6) // color type 6 = RGBA; sin canal alfa no hay transparencia posible

    let offset = 8
    while (offset < png.length) {
      const largo = png.readUInt32BE(offset)
      if (png.toString("ascii", offset + 4, offset + 8) === "IDAT") {
        // El primer byte de la fila es el tipo de filtro; con filtro 0 los cuatro
        // siguientes son el RGBA tal cual.
        const crudo = zlib.inflateSync(png.subarray(offset + 8, offset + 8 + largo))
        expect(crudo[0]).toBe(0)
        return [...crudo.subarray(1, 5)]
      }
      offset += 12 + largo
    }
    throw new Error("El PNG no tiene datos")
  }

  it("es transparente de verdad, no azul", () => {
    expect(pixelesDe(TRANSPARENT_PIXEL)[3]).toBe(0)
  })

  it("lo usan todas las fuentes de imagen, y es el mismo", () => {
    // Estuvo copiado en `useSgcLayersGL` con el mismo error, que es el motivo por
    // el que arreglarlo en un sitio no habría bastado.
    const style = createBaseStyle()
    const imagenes = Object.values(style.sources).filter((s) => s.type === "image")

    expect(imagenes.length).toBeGreaterThan(0)
    imagenes.forEach((fuente) => expect(fuente.url).toBe(TRANSPARENT_PIXEL))
  })
})

describe("createOverlayStyle", () => {
  it("crea un estilo sin capa de fondo (transparente) y con terreno 3D", () => {
    const style = createOverlayStyle()
    expect(style.version).toBe(8)
    // Sin capa background para que el canvas sea 100% transparente
    expect(style.layers.some((l) => l.type === "background")).toBe(false)
    expect(style.sources[TERRAIN_SOURCE_ID]).toBeDefined()
  })

  it("declara las fuentes y capas ráster del SGC y de la ANH", () => {
    const style = createOverlayStyle()
    expect(style.sources["sgc-src-geologiaNacional"]).toBeDefined()
    expect(style.sources["anh-src-tierras"]).toBeDefined()
    expect(style.sources["plancha-src"]).toBeDefined()
    expect(layerById(style, "sgc-geologiaNacional")).toBeDefined()
    expect(layerById(style, "anh-tierras")).toBeDefined()
    expect(layerById(style, "plancha-capa")).toBeDefined()
  })
})

