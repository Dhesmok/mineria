import {
  SGC_ATTRIBUTION,
  SGC_KEYS,
  SGC_LAYERS,
  SGC_TILE_SIZE,
  sgcExportUrl,
  sgcLayerByKey,
  sgcLayerId,
  sgcSourceId,
  sgcTileTemplate,
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
