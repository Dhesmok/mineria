import {
  SGC_ATTRIBUTION,
  SGC_KEYS,
  SGC_LAYERS,
  SGC_TILE_SIZE,
  identifyResultsFrom,
  legendFrom,
  sgcExportUrl,
  sgcIdentifyUrl,
  sgcLayerByKey,
  sgcLayerId,
  sgcLegendUrl,
  sgcMetaUrl,
  sgcSourceId,
  sgcTileTemplate,
  subLayersFrom,
} from "./sgcLayers"

describe("el catálogo del SGC", () => {
  it("trae las cinco capas de geología, sin repetir clave", () => {
    expect(SGC_LAYERS).toHaveLength(5)
    expect(new Set(SGC_KEYS).size).toBe(5)
  })

  it("todas apuntan al SGC y a ningún otro sitio", () => {
    // Se pidieron servicios del SGC. Una dirección de otra entidad colada aquí
    // se dibujaría igual y nadie lo notaría mirando el mapa.
    SGC_LAYERS.forEach(({ service }) => {
      expect(service).toMatch(/^https:\/\/[a-z]+\.sgc\.gov\.co\//)
    })
  })

  it("todas son MapServer, que es lo que sabe exportar imágenes", () => {
    // Un FeatureServer responde geometrías, no dibujos. Apuntar a uno daría un
    // error del servicio en vez de una capa, y el visor solo vería una imagen
    // que no llega.
    SGC_LAYERS.forEach(({ service }) => {
      expect(service).toMatch(/\/MapServer$/)
    })
  })

  it("cada una dice a qué escala está y de qué año es", () => {
    // No es adorno: un mapa a 1:500.000 y otro a 1:100.000 responden preguntas
    // distintas, y con la capa encendida no hay forma de saber cuál se mira.
    SGC_LAYERS.forEach((capa) => {
      expect(capa.label).toBeTruthy()
      expect(capa.hint).toBeTruthy()
      expect(capa.scale).toBeTruthy()
      expect(capa.year === null || Number.isInteger(capa.year)).toBe(true)
    })
  })

  it("el mapa nacional es el más reciente que publica el SGC", () => {
    const nacional = sgcLayerByKey("geologiaNacional")
    expect(nacional.year).toBe(2023)
    expect(nacional.service).toContain("V2023")
  })

  it("una clave que no existe no devuelve nada", () => {
    expect(sgcLayerByKey("no-existe")).toBeUndefined()
    expect(sgcLayerByKey(null)).toBeUndefined()
  })
})

describe("sgcExportUrl", () => {
  const servicio = SGC_LAYERS[0].service
  const recuadro = "-8400000,600000,-8300000,700000"

  it("pide la imagen en Web Mercator, que es lo que dibuja MapLibre", () => {
    const url = sgcExportUrl(servicio, recuadro)
    expect(url).toContain("bboxSR=3857")
    expect(url).toContain("imageSR=3857")
    expect(url).toContain(`bbox=${recuadro}`)
  })

  it("la pide transparente y en png32", () => {
    // Transparente porque una capa geológica se mira encima del satélite o del
    // relieve. Y png32 y no png porque las unidades geológicas usan muchos
    // colores, y la paleta de 256 los destroza sin avisar.
    const url = sgcExportUrl(servicio, recuadro)
    expect(url).toContain("transparent=true")
    expect(url).toContain("format=png32")
    expect(url).toContain("f=image")
  })

  it("nunca nombra un índice de capa", () => {
    // Es la trampa nº 1 del proyecto. Dentro de «Geología por departamentos»,
    // «Fallas Geológicas» está en la 43, la 60 y la 177 según el departamento:
    // escribir un número aquí sería elegir un departamento al azar.
    SGC_LAYERS.forEach(({ service }) => {
      expect(sgcExportUrl(service, recuadro)).not.toMatch(/layers=/)
    })
  })

  it("el tamaño que pide es el mismo que declara la fuente", () => {
    // Si no coincidieran, el servicio devolvería una imagen de otro tamaño y
    // MapLibre la estiraría: el mapa saldría borroso y ligeramente desplazado,
    // que es de las cosas más difíciles de ver mirando una captura.
    expect(sgcExportUrl(servicio, recuadro)).toContain(`size=${SGC_TILE_SIZE},${SGC_TILE_SIZE}`)
  })
})

describe("sgcTileTemplate", () => {
  it("pasa por la ruta propia y no por el SGC directamente", () => {
    // MapLibre pide las teselas ráster con `fetch`, así que están sujetas a
    // CORS. No se pudo comprobar si el SGC lo permite —el proxy del entorno de
    // desarrollo bloquea sgc.gov.co—, y la ruta propia funciona en los dos casos.
    const plantilla = sgcTileTemplate("geologiaNacional")
    expect(plantilla).toMatch(/^\/api\/sgc\?/)
    expect(plantilla).not.toContain("sgc.gov.co")
  })

  it("nombra la capa por clave, no por dirección", () => {
    // Es lo que impide que la ruta acabe siendo un proxy abierto: con una URL
    // como parámetro, cualquiera podría pedir lo que quisiera desde el dominio
    // del visor.
    const plantilla = sgcTileTemplate("geologiaNacional")
    expect(plantilla).toContain("capa=geologiaNacional")
    expect(plantilla).not.toMatch(/url=|https?%3A/)
  })

  it("deja el hueco del recuadro que rellena MapLibre", () => {
    expect(sgcTileTemplate("planchas")).toContain("{bbox-epsg-3857}")
  })

  it("escapa la clave", () => {
    expect(sgcTileTemplate("a b&c=d")).toContain("capa=a%20b%26c%3Dd")
  })
})

describe("identificadores del estilo", () => {
  it("no chocan con los de ninguna otra capa del mapa", () => {
    // Un identificador repetido hace que MapLibre reemplace una capa por otra al
    // construir el estilo, y lo hace sin quejarse.
    const ids = SGC_KEYS.flatMap((key) => [sgcSourceId(key), sgcLayerId(key)])
    expect(new Set(ids).size).toBe(ids.length)
    ids.forEach((id) => expect(id).toMatch(/^sgc-/))
  })
})

describe("atribución", () => {
  it("nombra al SGC y enlaza a su sitio", () => {
    // Las condiciones de uso de los datos públicos la exigen, y además es lo que
    // le dice a quien mira el mapa de dónde salió la geología que está viendo.
    expect(SGC_ATTRIBUTION).toContain("Servicio Geológico Colombiano")
    expect(SGC_ATTRIBUTION).toContain("sgc.gov.co")
  })
})

describe("subLayersFrom", () => {
  /** Un servicio con dos departamentos, cada uno con sus capas dentro. */
  const departamentos = {
    layers: [
      { id: 0, name: "Boyacá", parentLayerId: -1, subLayerIds: [2, 3], defaultVisibility: false },
      { id: 1, name: "Antioquia", parentLayerId: -1, subLayerIds: [4], defaultVisibility: true },
      { id: 2, name: "Unidades", parentLayerId: 0, subLayerIds: null },
      { id: 3, name: "Fallas", parentLayerId: 0, subLayerIds: null },
      { id: 4, name: "Unidades", parentLayerId: 1, subLayerIds: null },
    ],
  }

  it("saca un grupo por departamento con todos sus índices dentro", () => {
    const grupos = subLayersFrom(departamentos)
    expect(grupos).toHaveLength(2)
    expect(grupos.map((g) => g.label)).toEqual(["Antioquia", "Boyacá"])
    expect(grupos.find((g) => g.label === "Boyacá").ids).toEqual([0, 2, 3])
  })

  it("dice cuál trae el servicio encendido de fábrica", () => {
    // Es la explicación de por qué solo se dibujaba Antioquia, y lo que permite
    // que las casillas arranquen marcadas en lo que de verdad hay en pantalla.
    const grupos = subLayersFrom(departamentos)
    expect(grupos.find((g) => g.label === "Antioquia").on).toBe(true)
    expect(grupos.find((g) => g.label === "Boyacá").on).toBe(false)
  })

  it("ordena en español, con las tildes en su sitio", () => {
    const json = {
      layers: [
        { id: 0, name: "Ñuble", parentLayerId: -1, subLayerIds: [3] },
        { id: 1, name: "Nariño", parentLayerId: -1, subLayerIds: [4] },
        { id: 2, name: "Antioquia", parentLayerId: -1, subLayerIds: [5] },
        { id: 3, name: "a", parentLayerId: 0 },
        { id: 4, name: "b", parentLayerId: 1 },
        { id: 5, name: "c", parentLayerId: 2 },
      ],
    }
    expect(subLayersFrom(json).map((g) => g.label)).toEqual(["Antioquia", "Nariño", "Ñuble"])
  })

  it("no ofrece elección cuando el servicio es plano o trae un solo grupo", () => {
    // Un desplegable de un elemento es ruido: esa capa se dibuja entera.
    expect(subLayersFrom({ layers: [{ id: 0, name: "Geología", parentLayerId: -1 }] })).toEqual([])
    expect(
      subLayersFrom({
        layers: [
          { id: 0, name: "Todo", parentLayerId: -1, subLayerIds: [1] },
          { id: 1, name: "Unidades", parentLayerId: 0 },
        ],
      }),
    ).toEqual([])
  })

  it("aguanta un servicio que no responde lo que se espera", () => {
    // ArcGIS contesta 200 con un cuerpo de error —la trampa nº 2— y ese cuerpo
    // llega hasta aquí. Devolver [] deja la capa como estaba; reventar deja la
    // aplicación en blanco.
    expect(subLayersFrom(null)).toEqual([])
    expect(subLayersFrom({ error: { code: 400 } })).toEqual([])
    expect(subLayersFrom({ layers: [] })).toEqual([])
  })

  it("no se cuelga si un grupo se referencia a sí mismo", () => {
    const grupos = subLayersFrom({
      layers: [
        { id: 0, name: "A", parentLayerId: -1, subLayerIds: [1] },
        { id: 1, name: "B", parentLayerId: 0, subLayerIds: [0] },
        { id: 2, name: "C", parentLayerId: -1, subLayerIds: [3] },
        { id: 3, name: "D", parentLayerId: 2 },
      ],
    })
    expect(grupos.find((g) => g.label === "A").ids).toEqual([0, 1])
  })
})

describe("identifyResultsFrom", () => {
  it("conserva los campos con contenido y en el orden del servicio", () => {
    const [resultado] = identifyResultsFrom({
      results: [
        {
          layerName: "Unidades geológicas",
          value: "K1-Sm",
          attributes: { Unidad: "K1-Sm", Edad: "Cretácico", Litologia: "Lodolitas" },
        },
      ],
    })
    expect(resultado.value).toBe("K1-Sm")
    expect(resultado.attributes.map((a) => a.field)).toEqual(["Unidad", "Edad", "Litologia"])
  })

  it("tira los campos vacíos y los identificadores internos", () => {
    // «Null» con mayúscula es lo que escribe ArcGIS en un campo sin dato: sin
    // quitarlo, la ficha se llena de filas que no dicen nada.
    const [resultado] = identifyResultsFrom({
      results: [
        {
          layerName: "x",
          value: "y",
          attributes: {
            OBJECTID: "412",
            "Shape.STArea()": "9000",
            Edad: "Null",
            Fuente: "<Null>",
            Nota: "   ",
            Unidad: "Q-al",
            GlobalID: "{ABC}",
          },
        },
      ],
    })
    expect(resultado.attributes).toEqual([{ field: "Unidad", value: "Q-al" }])
  })

  it("devuelve vacío cuando no hay resultados o el cuerpo es un error", () => {
    expect(identifyResultsFrom({ results: [] })).toEqual([])
    expect(identifyResultsFrom({ error: { code: 500 } })).toEqual([])
    expect(identifyResultsFrom(undefined)).toEqual([])
  })
})

describe("legendFrom", () => {
  it("arma el data: URI con el símbolo que manda el servicio", () => {
    // El símbolo tiene que ser el del propio SGC, no una aproximación nuestra:
    // en un mapa geológico el color *es* el dato.
    const leyenda = legendFrom({
      layers: [
        {
          layerId: 4,
          layerName: "Unidades",
          legend: [{ label: "Q-al", imageData: "AAAA", contentType: "image/png" }],
        },
      ],
    })
    expect(leyenda).toEqual([
      {
        layerId: 4,
        layerName: "Unidades",
        items: [{ label: "Q-al", image: "data:image/png;base64,AAAA" }],
      },
    ])
  })

  it("descarta las capas sin símbolos", () => {
    const leyenda = legendFrom({
      layers: [
        { layerId: 1, layerName: "Vacía", legend: [] },
        { layerId: 2, layerName: "Sin imagen", legend: [{ label: "x" }] },
        { layerId: 3, layerName: "Buena", legend: [{ label: "y", imageData: "BB" }] },
      ],
    })
    expect(leyenda.map((c) => c.layerName)).toEqual(["Buena"])
  })

  it("aguanta un cuerpo que no es una leyenda", () => {
    expect(legendFrom({ error: {} })).toEqual([])
    expect(legendFrom(null)).toEqual([])
  })
})

describe("direcciones de consulta", () => {
  it("meta y leyenda solo piden la capa y el modo", () => {
    expect(sgcMetaUrl("planchas")).toBe("/api/sgc?capa=planchas&modo=meta")
    expect(sgcLegendUrl("planchas")).toBe("/api/sgc?capa=planchas&modo=leyenda")
  })

  it("el identify lleva el punto, el recuadro y el tamaño de la pantalla", () => {
    // Sin el recuadro y el tamaño, ArcGIS no puede convertir la tolerancia en
    // píxeles a una distancia sobre el terreno, y un clic junto a un contacto
    // devolvería la unidad equivocada.
    const url = sgcIdentifyUrl({
      key: "geologiaNacional",
      lng: -8358000,
      lat: 700000.5,
      bbox: "-1,-2,3,4",
      width: 800.6,
      height: 600.2,
    })
    expect(url).toContain("modo=identify")
    expect(url).toContain("punto=-8358000%2C700000.5")
    expect(url).toContain("tam=801%2C600")
    expect(url).not.toContain("sub=")
  })

  it("y las subcapas elegidas, cuando las hay", () => {
    // Tienen que ser las mismas que se están dibujando: preguntar por todo
    // devolvería unidades de departamentos que no están en pantalla.
    const url = sgcIdentifyUrl({
      key: "geologiaDepartamentos",
      lng: 1,
      lat: 2,
      bbox: "-1,-2,3,4",
      width: 10,
      height: 10,
      sub: [7, 8],
    })
    expect(url).toContain("sub=7%2C8")
  })
})
