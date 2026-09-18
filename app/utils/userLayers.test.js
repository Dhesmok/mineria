import {
  bboxOfFeatureCollection,
  buildUserLayer,
  candidateSourceCrs,
  colorForUserLayer,
  countGeometries,
  describeCount,
  guessSourceCrs,
  isUserLayerKey,
  layerLabelFromFileName,
  looksGeographic,
  plausiblyColombia,
  reprojectFeatureCollection,
  USER_PALETTE,
  userStyleLayerIds,
  withSourceCrs,
} from "./userLayers"
import { styleLayerIdsFor } from "./themeAreas"
import { fromGeographic } from "./crs"

const punto = (x, y, props = {}) => ({
  type: "Feature",
  geometry: { type: "Point", coordinates: [x, y] },
  properties: props,
})

const coleccion = (features) => ({ type: "FeatureCollection", features })

describe("claves e identificadores", () => {
  it("distingue una capa del usuario de una del visor", () => {
    expect(isUserLayerKey("usuario:3")).toBe(true)
    expect(isUserLayerKey("title")).toBe(false)
    expect(isUserLayerKey(undefined)).toBe(false)
  })

  it("da tres capas de estilo, con el relleno abajo y los puntos arriba", () => {
    const [relleno, linea, punto] = userStyleLayerIds("usuario:1")
    expect(relleno).toContain("relleno")
    expect(linea).toContain("linea")
    expect(punto).toContain("punto")
  })

  // La razón de ser del prefijo: `styleLayerIdsFor` es puro y no puede consultar
  // la lista de capas cargadas, que vive en el estado de React.
  it("styleLayerIdsFor responde por las capas del usuario sin conocerlas", () => {
    expect(styleLayerIdsFor("usuario:7")).toEqual(userStyleLayerIds("usuario:7"))
    expect(styleLayerIdsFor("inventada")).toEqual([])
  })

  it("reparte los colores en ciclo y sin repetir de seguido", () => {
    expect(colorForUserLayer(0)).toBe(USER_PALETTE[0])
    expect(colorForUserLayer(1)).not.toBe(USER_PALETTE[0])
    expect(colorForUserLayer(USER_PALETTE.length)).toBe(USER_PALETTE[0])
  })
})

describe("nombre de la capa", () => {
  it("quita la extensión y los guiones bajos", () => {
    expect(layerLabelFromFileName("TITULOS_VIGENTES_2024.shp")).toBe("TITULOS VIGENTES 2024")
    expect(layerLabelFromFileName("/tmp/planos/lindero.dxf")).toBe("lindero")
    expect(layerLabelFromFileName("recorrido.kml")).toBe("recorrido")
  })

  it("no se queda sin nombre con un archivo raro", () => {
    expect(layerLabelFromFileName(".shp")).toBe("Capa sin nombre")
    expect(layerLabelFromFileName("")).toBe("Capa sin nombre")
  })
})

describe("qué trae la capa", () => {
  it("cuenta por tipo de geometría", () => {
    const fc = coleccion([
      punto(-75, 6),
      { type: "Feature", geometry: { type: "LineString", coordinates: [[-75, 6], [-74, 7]] }, properties: {} },
      {
        type: "Feature",
        geometry: { type: "MultiPolygon", coordinates: [[[[-75, 6], [-74, 6], [-74, 7], [-75, 6]]]] },
        properties: {},
      },
    ])

    expect(countGeometries(fc)).toEqual({ polygons: 1, lines: 1, points: 1 })
    expect(describeCount(countGeometries(fc))).toBe("1 polígono · 1 línea · 1 punto")
  })

  it("lo dice cuando no hay nada", () => {
    expect(describeCount(countGeometries(coleccion([])))).toBe("sin figuras")
  })
})

describe("recuadro", () => {
  it("abarca todas las geometrías, anidadas o no", () => {
    const fc = coleccion([
      punto(-75, 6),
      {
        type: "Feature",
        geometry: { type: "Polygon", coordinates: [[[-76, 5], [-74, 5], [-74, 8], [-76, 5]]] },
        properties: {},
      },
    ])
    expect(bboxOfFeatureCollection(fc)).toEqual([-76, 5, -74, 8])
  })

  // Un solo NaN en el recuadro manda `fitBounds` a ningún sitio: el mapa se queda
  // gris y parece que la capa no cargó. Se descarta el par entero y no solo la
  // componente mala: un punto con una sola coordenada no se puede colocar.
  it("ignora las coordenadas que no son números", () => {
    const fc = coleccion([punto(-75, 6), punto(NaN, 7), punto(-74, Infinity), punto(-73, 9)])
    expect(bboxOfFeatureCollection(fc)).toEqual([-75, 6, -73, 9])
  })

  it("devuelve nada cuando no hay ni una coordenada usable", () => {
    expect(bboxOfFeatureCollection(coleccion([]))).toBeNull()
    expect(bboxOfFeatureCollection(coleccion([punto(NaN, NaN)]))).toBeNull()
  })
})

describe("¿son grados?", () => {
  it("acepta lo que cabe en el planeta", () => {
    expect(looksGeographic([-76, 5, -74, 8])).toBe(true)
  })

  // El caso que importa: un este de un millón no es una longitud.
  it("rechaza coordenadas planas", () => {
    expect(looksGeographic([1043210, 1187905, 1050000, 1190000])).toBe(false)
    expect(looksGeographic([4900000, 1900000, 5100000, 2100000])).toBe(false)
  })

  it("Colombia se reconoce por el centro del recuadro", () => {
    expect(plausiblyColombia([-76, 5, -74, 8])).toBe(true)
    expect(plausiblyColombia([-3, 40, -2, 41])).toBe(false)
    expect(plausiblyColombia([0, 0, 0.001, 0.001])).toBe(false)
  })
})

/**
 * La parte delicada: adivinar el sistema de un archivo que no lo declara.
 *
 * Los números de estas pruebas no son inventados: son los que sale de proyectar
 * un punto de Segovia (Antioquia) a cada uno de los tres sistemas, que es lo que
 * traería un DXF levantado allí.
 */
describe("adivinar el sistema de coordenadas", () => {
  const segovia = [-74.7, 7.08]

  const comoBbox = (crsId) => {
    const [x, y] = fromGeographic(segovia, crsId)
    return [x - 500, y - 500, x + 500, y + 500]
  }

  it("reconoce el CTM-12 por su rango propio", () => {
    expect(guessSourceCrs(comoBbox("9377"))).toBe("9377")
  })

  it("reconoce un UTM 18N", () => {
    expect(guessSourceCrs(comoBbox("32618"))).toBe("32618")
  })

  // Los cinco orígenes MAGNA comparten falso este y falso norte: un punto de
  // Antioquia leído como Origen Este también cae en Colombia. La ambigüedad es
  // real y por eso se devuelven todos los candidatos, no solo el primero.
  it("con un origen MAGNA propone el de Bogotá primero y confiesa la duda", () => {
    const candidatos = candidateSourceCrs(comoBbox("3116"))
    expect(candidatos[0]).toBe("3116")
    expect(candidatos.length).toBeGreaterThan(1)
  })

  /**
   * Las dos lecturas equivocadas que sí caen dentro de Colombia, y que por eso
   * pasaban por buenas antes de exigir la franja de cobertura del sistema.
   */
  it("no confunde un UTM con un origen MAGNA aunque los dos caigan en el país", () => {
    // El mismo punto en UTM 18N, leído como Origen Bogotá, queda 467 km al
    // oeste: en Nariño, verosímil y equivocado.
    const candidatos = candidateSourceCrs(comoBbox("32618"))
    expect(candidatos).toContain("32618")
    expect(candidatos).not.toContain("3116")
  })

  it("no inventa un sistema para unas coordenadas locales de CAD", () => {
    // Tres cifras desde un origen inventado en una esquina de la mina. Leídas
    // como un origen MAGNA caen en el Pacífico frente a Tumaco.
    expect(guessSourceCrs([0, 0, 800, 600])).toBeNull()
    expect(candidateSourceCrs(null)).toEqual([])
  })
})

describe("reproyectar", () => {
  it("deja intacta una colección que ya está en geográficas", () => {
    const fc = coleccion([punto(-75, 6)])
    expect(reprojectFeatureCollection(fc, "4686")).toBe(fc)
  })

  it("lleva un punto plano a su longitud y latitud", () => {
    const [x, y] = fromGeographic([-74.7, 7.08], "3116")
    const salida = reprojectFeatureCollection(coleccion([punto(x, y)]), "3116")
    const [lon, lat] = salida.features[0].geometry.coordinates

    expect(lon).toBeCloseTo(-74.7, 6)
    expect(lat).toBeCloseTo(7.08, 6)
  })

  it("conserva la altura de un punto de tres componentes", () => {
    const [x, y] = fromGeographic([-74.7, 7.08], "9377")
    const fc = coleccion([
      { type: "Feature", geometry: { type: "Point", coordinates: [x, y, 1850] }, properties: {} },
    ])
    expect(reprojectFeatureCollection(fc, "9377").features[0].geometry.coordinates[2]).toBe(1850)
  })

  it("respeta el anidamiento de un multipolígono con hueco", () => {
    const anillo = (dx) => [
      [1000000 + dx, 1100000],
      [1001000 + dx, 1100000],
      [1001000 + dx, 1101000],
      [1000000 + dx, 1100000],
    ]
    const fc = coleccion([
      {
        type: "Feature",
        geometry: { type: "MultiPolygon", coordinates: [[anillo(0), anillo(100)]] },
        properties: {},
      },
    ])

    const salida = reprojectFeatureCollection(fc, "3116")
    expect(salida.features[0].geometry.coordinates).toHaveLength(1)
    expect(salida.features[0].geometry.coordinates[0]).toHaveLength(2)
    expect(salida.features[0].geometry.coordinates[0][0]).toHaveLength(4)
    // Un este de 1.000.000 es exactamente el falso este del Origen Bogotá, así
    // que cae sobre su meridiano central.
    expect(salida.features[0].geometry.coordinates[0][0][0][0]).toBeCloseTo(-74.0775, 3)
  })

  it("no reproyecta una figura sin geometría", () => {
    const fc = coleccion([{ type: "Feature", geometry: null, properties: { a: 1 } }])
    expect(reprojectFeatureCollection(fc, "3116").features[0].geometry).toBeNull()
  })
})

describe("la ficha de una capa cargada", () => {
  const planoEnBogota = () => {
    const [x, y] = fromGeographic([-74.7, 7.08], "3116")
    return buildUserLayer({
      id: "1",
      label: "Lindero",
      source: "lindero.dxf",
      featureCollection: coleccion([punto(x, y)]),
      crsId: "3116",
      crsGuessed: true,
      fillColor: "#e07a3f",
    })
  }

  it("guarda el archivo original y entrega la versión en geográficas", () => {
    const capa = planoEnBogota()

    expect(capa.key).toBe("usuario:1")
    expect(capa.areaId).toBe("misdatos")
    expect(capa.data).not.toBe(capa.original)
    expect(capa.bbox[0]).toBeCloseTo(-74.7, 4)
    expect(capa.farFromColombia).toBe(false)
    expect(capa.hint).toBe("1 punto")
    // El contorno se deriva del relleno cuando no se da: nadie elige dos colores.
    expect(capa.lineColor).toBe("#e07a3f")
  })

  /**
   * La razón de guardar el archivo original: cambiar de sistema tiene que partir
   * de los números del archivo. Reproyectando encima de lo ya reproyectado,
   * elegir Bogotá y después CTM-12 dejaría el plano en el mar sin que nada lo
   * explique.
   */
  it("al cambiar de sistema reproyecta desde el archivo, no desde lo dibujado", () => {
    const capa = planoEnBogota()
    const enCtm = withSourceCrs(capa, "9377")
    const devuelta = withSourceCrs(enCtm, "3116")

    expect(enCtm.original).toBe(capa.original)
    expect(devuelta.bbox[0]).toBeCloseTo(capa.bbox[0], 9)
    expect(devuelta.bbox[1]).toBeCloseTo(capa.bbox[1], 9)
    // Elegir a mano deja de ser una suposición, y el panel deja de avisar.
    expect(enCtm.crsGuessed).toBe(false)
  })

  it("avisa cuando la capa acaba lejos de Colombia", () => {
    const capa = buildUserLayer({
      id: "2",
      label: "Ruta",
      source: "ruta.kml",
      featureCollection: coleccion([punto(2.17, 41.38)]),
      crsId: "4686",
    })
    expect(capa.farFromColombia).toBe(true)
  })
})
