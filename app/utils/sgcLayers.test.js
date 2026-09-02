import {
  SGC_ATTRIBUTION,
  SGC_KEYS,
  SGC_LAYERS,
  defaultSubSelection,
  describeValue,
  fieldInfoFrom,
  identifyResultsFrom,
  legendFrom,
  sgcExportUrl,
  sgcIdentifyUrl,
  sgcImageSize,
  sgcImageUrl,
  sgcLayerByKey,
  sgcLayerId,
  sgcLegendUrl,
  sgcMetaUrl,
  linkPartsOf,
  nombreDeDepartamento,
  sgcSourceId,
  shortLinkText,
  subLayersFrom,
} from "./sgcLayers"

describe("el catálogo del SGC", () => {
  it("trae las capas de geología, sin repetir clave", () => {
    expect(SGC_LAYERS).toHaveLength(14)
    expect(new Set(SGC_KEYS).size).toBe(14)
  })

  it("los nombres caben en la fila del panel", () => {
    // «Mapa geológico de Colombia» se leía «Mapa geológico de Colo…», que no
    // distingue nada de «Mapa geológico…» de al lado. El encabezado del área ya
    // dice GEOLOGÍA · SGC; lo que hace falta en la fila es la escala.
    SGC_LAYERS.forEach(({ label }) => expect(label.length).toBeLessThanOrEqual(25))
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

  it("el mapa nacional no se despieza", () => {
    // Tiene dos capas dentro, pero no son dos temas independientes sino las dos
    // mitades de un mismo dibujo: encender solo una deja el mapa a medias o en
    // blanco. Ofrecer esa elección era ofrecer una forma de romperlo.
    expect(sgcLayerByKey("geologiaNacional").selectable).toBe(false)
    expect(sgcLayerByKey("geologiaDepartamentos").selectable).not.toBe(false)
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
    const url = sgcExportUrl(servicio, recuadro, "800,600")
    expect(url).toContain("bboxSR=3857")
    expect(url).toContain("imageSR=3857")
    expect(url).toContain(`bbox=${recuadro}`)
  })

  it("la pide transparente y en png32", () => {
    // Transparente porque una capa geológica se mira encima del satélite o del
    // relieve. Y png32 y no png porque las unidades geológicas usan muchos
    // colores, y la paleta de 256 los destroza sin avisar.
    const url = sgcExportUrl(servicio, recuadro, "800,600")
    expect(url).toContain("transparent=true")
    expect(url).toContain("format=png32")
    expect(url).toContain("f=image")
  })

  it("nunca nombra un índice de capa", () => {
    // Es la trampa nº 1 del proyecto. Dentro de «Geología por departamentos»,
    // «Fallas Geológicas» está en la 43, la 60 y la 177 según el departamento:
    // escribir un número aquí sería elegir un departamento al azar.
    SGC_LAYERS.forEach(({ service }) => {
      expect(sgcExportUrl(service, recuadro, "800,600")).not.toMatch(/layers=/)
    })
  })

  it("pasa el tamaño tal cual se lo dan", () => {
    expect(sgcExportUrl(servicio, recuadro, "800,600")).toContain("size=800,600")
  })
})

describe("sgcImageSize", () => {
  it("guarda la proporción exacta del recuadro", () => {
    // Si el tamaño no guarda la proporción del recuadro, ArcGIS ensancha el
    // recuadro por su cuenta para que cuadren: la imagen acaba cubriendo un
    // trozo de terreno distinto del que se pidió y el mapa sale desplazado sin
    // que nada falle. Es de lo más difícil de ver en una captura.
    const [w, h] = sgcImageSize([0, 0, 2000, 1000], [1440, 900])
    expect(w / h).toBeCloseTo(2, 2)
  })

  it("no se pasa del tope ni por ancho ni por alto", () => {
    expect(sgcImageSize([0, 0, 100000, 100], [9000, 9000], 2048)[0]).toBe(2048)
    // Un recuadro muy alto y estrecho: el que se pasa es el alto, y hay que
    // recortar por ahí. Sin esta rama, se pedían diez mil píxeles de alto.
    const [w, h] = sgcImageSize([0, 0, 100, 100000], [2048, 2048], 2048)
    expect(h).toBe(2048)
    expect(w).toBeLessThanOrEqual(2048)
  })

  it("aguanta un recuadro degenerado sin devolver cero", () => {
    // Un tamaño de cero píxeles hace que ArcGIS conteste un error, y llega como
    // «la capa no se ve» sin más pista.
    expect(sgcImageSize([0, 0, 0, 0], [800, 600])).toEqual([1, 1])
  })
})

describe("sgcImageUrl", () => {
  it("pide una sola imagen del recuadro que se está viendo", () => {
    // Y no teselas: con teselas, ArcGIS rotula cada una por separado y el número
    // de cada cuadrícula de la grilla salía escrito cuatro veces.
    const url = sgcImageUrl({ key: "planchas", bbox: [-1, -2, 3, 4], width: 800, height: 600 })
    expect(url).toMatch(/^\/api\/sgc\?/)
    expect(url).toContain("bbox=-1%2C-2%2C3%2C4")
    expect(url).toContain("tam=800%2C600")
    expect(url).not.toContain("{bbox")
  })

  it("nombra la capa por clave y nunca por dirección", () => {
    // Es lo que impide que la ruta acabe siendo un proxy abierto.
    const url = sgcImageUrl({ key: "geologiaNacional", bbox: [1, 2, 3, 4], width: 10, height: 10 })
    expect(url).toContain("capa=geologiaNacional")
    expect(url).not.toMatch(/url=|https?%3A/)
  })

  it("lleva las subcapas elegidas cuando las hay", () => {
    const url = sgcImageUrl({ key: "geologiaDepartamentos", bbox: [1, 2, 3, 4], width: 10, height: 10, sub: [4, 7] })
    expect(url).toContain("sub=4%2C7")
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

  it("saca un grupo por departamento con las capas que lleva dentro", () => {
    const grupos = subLayersFrom(departamentos)
    expect(grupos).toHaveLength(2)
    expect(grupos.map((g) => g.label)).toEqual(["Antioquia", "Boyacá"])
    expect(grupos.find((g) => g.label === "Boyacá").children.map((h) => h.label)).toEqual([
      "Unidades",
      "Fallas",
    ])
  })

  it("pide solo las hojas, nunca el grupo que las contiene", () => {
    // Pedirle a ArcGIS un grupo *y* su contenido devuelve la misma unidad dos
    // veces, y la ficha la enseñaba repetida. Además son las hojas las que
    // tienen nombre propio —«Fallas», «Municipios»—, que es lo único que se
    // puede ofrecer para apagar por separado.
    const boyaca = subLayersFrom(departamentos).find((g) => g.label === "Boyacá")
    expect(boyaca.ids).toEqual([2, 3])
    expect(boyaca.ids).not.toContain(boyaca.id)
  })

  it("dice cuál trae el servicio encendido de fábrica", () => {
    // Es la explicación de por qué solo se dibujaba Antioquia, y lo que permite
    // que las casillas arranquen marcadas en lo que de verdad hay en pantalla.
    const grupos = subLayersFrom(departamentos)
    expect(grupos.find((g) => g.label === "Antioquia").on).toBe(true)
    expect(grupos.find((g) => g.label === "Boyacá").on).toBe(false)
  })

  it("una hoja encendida dentro de un grupo apagado no cuenta como visible", () => {
    // ArcGIS marca la visibilidad capa por capa, y una hoja encendida dentro de
    // un grupo apagado no se dibuja. Sin esta cuenta, las casillas arrancaban
    // marcadas en cosas que no estaban en pantalla.
    const grupos = subLayersFrom({
      layers: [
        { id: 0, name: "Antioquia", parentLayerId: -1, subLayerIds: [1], defaultVisibility: true },
        { id: 1, name: "Unidades", parentLayerId: 0, defaultVisibility: true },
        { id: 2, name: "Boyacá", parentLayerId: -1, subLayerIds: [3], defaultVisibility: false },
        { id: 3, name: "Unidades", parentLayerId: 2, defaultVisibility: true },
      ],
    })
    expect(defaultSubSelection(grupos)).toEqual([1])
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

  it("no se cuelga si un grupo se referencia a sí mismo, y deja algo que encender", () => {
    const grupos = subLayersFrom({
      layers: [
        { id: 0, name: "A", parentLayerId: -1, subLayerIds: [1] },
        { id: 1, name: "B", parentLayerId: 0, subLayerIds: [0] },
        { id: 2, name: "C", parentLayerId: -1, subLayerIds: [3] },
        { id: 3, name: "D", parentLayerId: 2 },
      ],
    })
    expect(grupos.find((g) => g.label === "A").ids.length).toBeGreaterThan(0)
    expect(grupos.find((g) => g.label === "C").ids).toEqual([3])
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

describe("linkPartsOf", () => {
  it("convierte una dirección suelta en un enlace", () => {
    // El servicio de estado de la cartografía devuelve direcciones —la memoria
    // explicativa de una plancha—, y como texto plano obligan a copiarlas a mano.
    expect(linkPartsOf("https://www2.sgc.gov.co/plancha/123.pdf")).toEqual([
      { text: "https://www2.sgc.gov.co/plancha/123.pdf", href: "https://www2.sgc.gov.co/plancha/123.pdf" },
    ])
  })

  it("separa el texto de la dirección cuando vienen juntos", () => {
    const partes = linkPartsOf("Memoria: https://sgc.gov.co/a.pdf (2020)")
    expect(partes.map((p) => p.text)).toEqual(["Memoria: ", "https://sgc.gov.co/a.pdf", " (2020)"])
    expect(partes.filter((p) => p.href)).toHaveLength(1)
  })

  it("deja fuera el punto final, que es de la frase y no de la dirección", () => {
    // Con el punto dentro, el enlace lleva a una página que no existe.
    const [, enlace] = linkPartsOf("Ver https://sgc.gov.co/a.pdf.")
    expect(enlace.href).toBe("https://sgc.gov.co/a.pdf")
  })

  it("encuentra varias en el mismo campo", () => {
    const partes = linkPartsOf("http://a.co/1 y http://b.co/2")
    expect(partes.filter((p) => p.href).map((p) => p.href)).toEqual(["http://a.co/1", "http://b.co/2"])
  })

  it("un texto sin direcciones sale de una pieza y sin enlace", () => {
    expect(linkPartsOf("Cuarzomonzonita de Amagá")).toEqual([{ text: "Cuarzomonzonita de Amagá" }])
    expect(linkPartsOf("")).toEqual([{ text: "" }])
  })
})

describe("identifyResultsFrom, sin repetidos", () => {
  it("dos respuestas idénticas se enseñan una vez", () => {
    // La ficha enseñaba la misma unidad dos veces. Dos filas idénticas no
    // informan de nada: informan de un fallo que no existe.
    const repetido = { layerName: "Unidades", value: "Q-al", attributes: { Unidad: "Q-al" } }
    expect(identifyResultsFrom({ results: [repetido, repetido] })).toHaveLength(1)
  })

  it("pero dos unidades distintas de la misma capa siguen siendo dos", () => {
    const json = { results: [
      { layerName: "Unidades", value: "Q-al", attributes: { Unidad: "Q-al" } },
      { layerName: "Unidades", value: "K1-Sm", attributes: { Unidad: "K1-Sm" } },
    ] }
    expect(identifyResultsFrom(json)).toHaveLength(2)
  })
})

describe("shortLinkText", () => {
  it("una dirección corta se enseña entera", () => {
    expect(shortLinkText("https://sgc.gov.co/a")).toBe("https://sgc.gov.co/a")
  })

  it("cabe en el ancho de la tarjeta", () => {
    // La columna del valor mide unos 150 px a 11 px de letra: ahí caben
    // veintitantos caracteres. Con el tope de más, el recorte no servía de nada
    // y las direcciones seguían saliendo en tres renglones.
    expect(shortLinkText("https://www2.sgc.gov.co/plancha/146.pdf").length).toBeLessThanOrEqual(26)
  })

  it("una larga se resume en el sitio y el archivo", () => {
    // En una columna de quince ems, la dirección entera ocupa tres renglones
    // partidos por la mitad de las palabras, y lo que se lee no es nada.
    expect(shortLinkText("https://www2.sgc.gov.co/publicaciones/planchas/146.pdf")).toBe(
      "sgc.gov.co/…/146.pdf",
    )
  })

  it("el enlace en sí no se toca: solo cambia lo que se lee", () => {
    // Lo que se recorta es el texto. El destino sigue siendo el que mandó el
    // servicio, y va en el `title` y en el href.
    const largo = "https://www2.sgc.gov.co/publicaciones/planchas/146.pdf"
    expect(shortLinkText(largo)).not.toBe(largo)
    expect(largo.startsWith("https://")).toBe(true)
  })

  it("aguanta algo que no es una dirección analizable", () => {
    const raro = `http://${"x".repeat(80)}`
    expect(shortLinkText(raro).length).toBeLessThanOrEqual(26)
  })
})

describe("qué se enciende de fábrica dentro de un departamento", () => {
  const conLimites = {
    layers: [
      { id: 0, name: "Antioquia", parentLayerId: -1, subLayerIds: [1, 2, 3, 4], defaultVisibility: true },
      { id: 1, name: "Geología_UCG", parentLayerId: 0, defaultVisibility: true },
      { id: 2, name: "Fallas geológicas", parentLayerId: 0, defaultVisibility: true },
      { id: 3, name: "Límite municipal", parentLayerId: 0, defaultVisibility: true },
      { id: 4, name: "Límite departamental", parentLayerId: 0, defaultVisibility: true },
      { id: 5, name: "Boyacá", parentLayerId: -1, subLayerIds: [6], defaultVisibility: false },
      { id: 6, name: "Geología_UCG", parentLayerId: 5, defaultVisibility: true },
    ],
  }

  it("los límites municipales y departamentales quedan apagados", () => {
    // Encendidos de partida tapan la geología con una malla de líneas negras
    // justo cuando lo que se quiere ver es el color de las unidades.
    expect(defaultSubSelection(subLayersFrom(conLimites))).toEqual([1, 2])
  })

  it("pero siguen en la lista, para encenderlos a mano", () => {
    const antioquia = subLayersFrom(conLimites).find((g) => g.label === "Antioquia")
    expect(antioquia.children.map((h) => h.label)).toContain("Límite municipal")
    expect(antioquia.ids).toEqual([1, 2, 3, 4])
  })

  it("no se apaga una capa de geología por llevar «departamental» en el nombre", () => {
    // La regla busca «límite» y «municipio», no la palabra suelta: hay capas de
    // geología que la llevan, y apagarlas sería apagar el dato.
    const grupos = subLayersFrom({
      layers: [
        { id: 0, name: "Antioquia", parentLayerId: -1, subLayerIds: [1], defaultVisibility: true },
        { id: 1, name: "Geología departamental", parentLayerId: 0, defaultVisibility: true },
        { id: 2, name: "Boyacá", parentLayerId: -1, subLayerIds: [3], defaultVisibility: true },
        { id: 3, name: "Geología", parentLayerId: 2, defaultVisibility: true },
      ],
    })
    expect(defaultSubSelection(grupos)).toEqual([1, 3])
  })

  it("los rótulos se encienden aunque el servicio los traiga apagados", () => {
    // Sin ellos hay que ir a clic por unidad, que es justo lo que sobra.
    const grupos = subLayersFrom({
      layers: [
        { id: 0, name: "Antioquia", parentLayerId: -1, subLayerIds: [1, 2], defaultVisibility: true },
        { id: 1, name: "Geología", parentLayerId: 0, defaultVisibility: true },
        { id: 2, name: "Anotación de unidades", parentLayerId: 0, defaultVisibility: false },
        { id: 3, name: "Boyacá", parentLayerId: -1, subLayerIds: [4], defaultVisibility: false },
        { id: 4, name: "Geología", parentLayerId: 3, defaultVisibility: false },
      ],
    })
    expect(defaultSubSelection(grupos)).toEqual([1, 2])
  })
})

describe("departamentos repetidos", () => {
  const guajira = {
    layers: [
      { id: 0, name: "La Guajira 2015", parentLayerId: -1, subLayerIds: [1], defaultVisibility: false },
      { id: 1, name: "Geología", parentLayerId: 0 },
      { id: 2, name: "Guajira 2020", parentLayerId: -1, subLayerIds: [3], defaultVisibility: false },
      { id: 3, name: "Geología", parentLayerId: 2 },
      { id: 4, name: "Cesar", parentLayerId: -1, subLayerIds: [5], defaultVisibility: false },
      { id: 5, name: "Geología", parentLayerId: 4 },
    ],
  }

  it("se queda el levantamiento más reciente", () => {
    // Salían los dos y no había forma de saber cuál era cuál.
    const grupos = subLayersFrom(guajira)
    expect(grupos).toHaveLength(2)
    expect(grupos.find((g) => /Guajira/.test(g.label)).ids).toEqual([3])
  })

  it("y el nombre va sin el año", () => {
    // El año no ayuda a encontrar el departamento en una lista de treinta y dos.
    expect(subLayersFrom(guajira).map((g) => g.label)).toEqual(["Cesar", "Guajira"])
  })

  it("nombreDeDepartamento quita el año y los adornos que lo acompañan", () => {
    expect(nombreDeDepartamento("Norte de Santander (2019)")).toBe("Norte de Santander")
    expect(nombreDeDepartamento("Valle_del_Cauca_2020")).toBe("Valle del Cauca")
    expect(nombreDeDepartamento("Chocó")).toBe("Chocó")
  })
})

describe("los códigos de la base de datos", () => {
  it("los números internos de ArcGIS no llegan a la ficha", () => {
    // `UCG_P_` y `UCG_P_ID` ocupaban dos de las cuatro filas y no decían nada.
    const [resultado] = identifyResultsFrom({
      results: [{ layerName: "Geología_UCG", value: "Qal", attributes: {
        UCG_P_: "445", UCG_P_ID: "450", COD: "Qal",
      } }],
    })
    expect(resultado.attributes).toEqual([{ field: "COD", value: "Qal" }])
  })

  it("pero un campo con nombre de identificador y valor de texto sí es un dato", () => {
    // Las dos condiciones juntas —nombre de identificador *y* valor numérico—,
    // porque un `COD_ID` que vale «Qal» es información.
    const [resultado] = identifyResultsFrom({
      results: [{ layerName: "x", value: "y", attributes: { COD_ID: "Qal" } }],
    })
    expect(resultado.attributes).toEqual([{ field: "COD_ID", value: "Qal" }])
  })

  it("conserva el índice de la capa, que es la llave para traducirlos", () => {
    const [resultado] = identifyResultsFrom({
      results: [{ layerId: 12, layerName: "x", value: "y", attributes: { COD: "Qal" } }],
    })
    expect(resultado.layerId).toBe(12)
  })
})

describe("fieldInfoFrom", () => {
  const capa = {
    fields: [
      { name: "COD", alias: "Unidad geológica" },
      { name: "EDAD", alias: "EDAD" },
    ],
    drawingInfo: {
      renderer: {
        field1: "COD",
        uniqueValueInfos: [
          { value: "Qal", label: "Depósitos aluviales" },
          { value: "Kium", label: "Cuarzomonzonita de Amagá" },
          { value: "Xx", label: "" },
        ],
      },
    },
  }

  it("saca la tabla que empareja cada código con su descripción", () => {
    // Es la que ArcGIS usa para elegir el color, así que no hay que inventarse
    // ningún diccionario nuestro.
    expect(fieldInfoFrom(capa).meanings).toEqual({
      Qal: "Depósitos aluviales",
      Kium: "Cuarzomonzonita de Amagá",
    })
  })

  it("y los nombres que el servicio le puso a cada campo", () => {
    // Solo los que aportan algo: un alias igual al nombre interno es ruido.
    expect(fieldInfoFrom(capa).aliases).toEqual({ COD: "Unidad geológica" })
  })

  it("aguanta una capa sin simbología o un cuerpo de error", () => {
    expect(fieldInfoFrom({ error: {} })).toEqual({ field: "", aliases: {}, meanings: {} })
    expect(fieldInfoFrom(null).meanings).toEqual({})
  })
})

describe("describeValue", () => {
  it("acompaña el código, no lo sustituye", () => {
    // El código es lo que aparece en los informes y en los mapas impresos:
    // quitarlo sería quitar información.
    expect(describeValue("Qal", { Qal: "Depósitos aluviales" })).toBe("Qal — Depósitos aluviales")
  })

  it("sin diccionario deja el valor tal cual", () => {
    expect(describeValue("Qal", undefined)).toBe("Qal")
    expect(describeValue("Qal", {})).toBe("Qal")
  })

  it("no repite cuando el significado es el propio código", () => {
    expect(describeValue("Qal", { Qal: "Qal" })).toBe("Qal")
  })
})
