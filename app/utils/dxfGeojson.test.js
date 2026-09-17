import DxfParser from "dxf-parser"

import { describeSkipped, dxfToFeatures } from "./dxfGeojson"

/**
 * Las pruebas parten de **texto DXF de verdad**, no de objetos inventados con la
 * forma que suponemos que tiene `dxf-parser`.
 *
 * Es la diferencia entre probar nuestro código y probar nuestra idea del formato:
 * los códigos de grupo del DXF —el 70 que dice si una polilínea está cerrada, el
 * 50 y el 51 de los ángulos de un arco, el 41 de la escala de una inserción— son
 * exactamente la parte que uno recuerda mal. Escribirlos como los escribe AutoCAD
 * y dejar que la librería los interprete es lo único que comprueba que el
 * conversor entiende lo que de verdad le va a llegar.
 */
const dxf = (...lineas) =>
  [
    "0", "SECTION", "2", "ENTITIES",
    ...lineas,
    "0", "ENDSEC",
    "0", "EOF",
  ].join("\n") + "\n"

const conBloques = (bloques, entidades) =>
  [
    "0", "SECTION", "2", "BLOCKS",
    ...bloques,
    "0", "ENDSEC",
    "0", "SECTION", "2", "ENTITIES",
    ...entidades,
    "0", "ENDSEC",
    "0", "EOF",
  ].join("\n") + "\n"

const leer = (texto) => dxfToFeatures(new DxfParser().parseSync(texto))

const lwpolilinea = (cerrada, puntos, capa = "LINDERO") => [
  "0", "LWPOLYLINE", "8", capa, "90", String(puntos.length), "70", cerrada ? "1" : "0",
  ...puntos.flatMap(([x, y]) => ["10", String(x), "20", String(y)]),
]

describe("polilíneas", () => {
  // Un lindero en CAD es una polilínea cerrada, y cerrada quiere decir polígono:
  // es lo que permite medirle el área y verlo relleno como los títulos.
  it("una polilínea cerrada es un polígono, con el primer punto repetido al final", () => {
    const { features } = leer(
      dxf(...lwpolilinea(true, [[1000000, 1100000], [1001000, 1100000], [1001000, 1101000]])),
    )

    expect(features).toHaveLength(1)
    expect(features[0].geometry.type).toBe("Polygon")

    const anillo = features[0].geometry.coordinates[0]
    expect(anillo).toHaveLength(4)
    expect(anillo[0]).toEqual(anillo[3])
    expect(features[0].properties.CAPA).toBe("LINDERO")
    expect(features[0].properties.TIPO).toBe("LWPOLYLINE")
  })

  it("una polilínea abierta es una línea", () => {
    const { features } = leer(dxf(...lwpolilinea(false, [[0, 0], [100, 0], [100, 100]])))
    expect(features[0].geometry.type).toBe("LineString")
    expect(features[0].geometry.coordinates).toHaveLength(3)
  })

  // Con dos vértices no hay anillo posible. Devolver un polígono degenerado
  // sería peor: MapLibre lo descarta sin decir nada y la figura desaparece.
  it("una polilínea cerrada de dos puntos se queda en línea", () => {
    const { features } = leer(dxf(...lwpolilinea(true, [[0, 0], [100, 0]])))
    expect(features[0].geometry.type).toBe("LineString")
  })

  it("descarta los vértices repetidos seguidos", () => {
    const { features } = leer(
      dxf(...lwpolilinea(true, [[0, 0], [0, 0], [100, 0], [100, 100]])),
    )
    expect(features[0].geometry.coordinates[0]).toHaveLength(4)
  })

  // La POLYLINE vieja, con sus vértices como entidades aparte. Los planos de los
  // años noventa están llenos de ellas.
  it("lee la POLYLINE antigua igual que la moderna", () => {
    const { features } = leer(
      dxf(
        "0", "POLYLINE", "8", "VIA", "70", "1",
        "0", "VERTEX", "10", "0", "20", "0",
        "0", "VERTEX", "10", "100", "20", "0",
        "0", "VERTEX", "10", "100", "20", "100",
        "0", "SEQEND",
      ),
    )
    expect(features[0].geometry.type).toBe("Polygon")
    expect(features[0].properties.CAPA).toBe("VIA")
  })
})

describe("las demás entidades", () => {
  it("una LINE es una línea de dos puntos", () => {
    const { features } = leer(
      dxf("0", "LINE", "8", "EJE", "10", "0", "20", "0", "30", "0", "11", "500", "21", "500", "31", "0"),
    )
    expect(features[0].geometry.type).toBe("LineString")
    expect(features[0].geometry.coordinates).toEqual([
      [0, 0],
      [500, 500],
    ])
  })

  it("un POINT es un punto", () => {
    const { features } = leer(dxf("0", "POINT", "8", "MOJONES", "10", "1000", "20", "2000"))
    expect(features[0].geometry).toEqual({ type: "Point", coordinates: [1000, 2000] })
  })

  // El texto no se dibuja —el estilo del visor no tiene tipografías cargadas—
  // pero tirarlo sería perder los números de los mojones y las cotas.
  it("un TEXT entra como punto con su texto en los atributos", () => {
    const { features } = leer(
      dxf("0", "TEXT", "8", "ROTULOS", "10", "10", "20", "20", "1", "Mojon 4"),
    )
    expect(features[0].geometry.type).toBe("Point")
    expect(features[0].properties.TEXTO).toBe("Mojon 4")
  })

  it("un CIRCLE es un polígono cerrado alrededor de su centro", () => {
    const { features } = leer(
      dxf("0", "CIRCLE", "8", "POZO", "10", "1000", "20", "1000", "40", "500"),
    )
    const anillo = features[0].geometry.coordinates[0]

    expect(features[0].geometry.type).toBe("Polygon")
    expect(anillo[0]).toEqual(anillo[anillo.length - 1])
    // Todos los vértices a la distancia del radio: es un círculo, no un óvalo.
    anillo.forEach(([x, y]) => {
      expect(Math.hypot(x - 1000, y - 1000)).toBeCloseTo(500, 6)
    })
  })

  /**
   * El arco que cruza el cero es la trampa del formato: `dxf-parser` entrega los
   * ángulos en radianes y el final puede venir *antes* que el principio. Sin
   * sumarle la vuelta, los 30° que van de 350° a 20° se dibujarían como los 330°
   * que sobran — el arco sale por el lado contrario.
   */
  it("un ARC que cruza el cero se dibuja por el lado corto", () => {
    const { features } = leer(
      dxf("0", "ARC", "8", "CURVA", "10", "0", "20", "0", "40", "100", "50", "350", "51", "20"),
    )
    const linea = features[0].geometry.coordinates

    expect(features[0].geometry.type).toBe("LineString")
    // Empieza en 350° y acaba en 20°, los dos a radio 100.
    expect(linea[0][0]).toBeCloseTo(100 * Math.cos((350 * Math.PI) / 180), 6)
    expect(linea[linea.length - 1][1]).toBeCloseTo(100 * Math.sin((20 * Math.PI) / 180), 6)
    // Y todo el arco se queda en el lado derecho, que es el corto: ningún punto
    // pasa al oeste del centro.
    linea.forEach(([x]) => expect(x).toBeGreaterThan(0))
  })
})

/**
 * Los bloques: la razón por la que un plano hecho con la plantilla de una empresa
 * se cargaba vacío. Una INSERT no dibuja nada por sí misma —dice «pon aquí el
 * bloque tal»— y sin desplegarla no sale ni una figura.
 */
describe("inserciones de bloque", () => {
  const cuadro = [
    "0", "BLOCK", "2", "CUADRO", "10", "0", "20", "0",
    ...lwpolilinea(true, [[0, 0], [100, 0], [100, 100], [0, 100]], "CUADRO"),
    "0", "ENDBLK",
  ]

  it("despliega el bloque en el sitio de la inserción", () => {
    const { features } = leer(
      conBloques(cuadro, [
        "0", "INSERT", "8", "INSERTOS", "2", "CUADRO",
        "10", "1000000", "20", "1100000",
      ]),
    )

    expect(features).toHaveLength(1)
    expect(features[0].geometry.coordinates[0][0]).toEqual([1000000, 1100000])
    expect(features[0].geometry.coordinates[0][2]).toEqual([1000100, 1100100])
  })

  it("aplica la escala y el giro de la inserción", () => {
    const { features } = leer(
      conBloques(cuadro, [
        "0", "INSERT", "8", "INSERTOS", "2", "CUADRO",
        "10", "0", "20", "0", "41", "2", "42", "2", "50", "90",
      ]),
    )

    // El cuadro de 100 escalado al doble y girado 90°: la esquina que estaba en
    // (100, 0) acaba en (0, 200).
    const [x, y] = features[0].geometry.coordinates[0][1]
    expect(x).toBeCloseTo(0, 6)
    expect(y).toBeCloseTo(200, 6)
  })

  // El punto base del bloque no siempre es el origen, y sin descontarlo el bloque
  // sale desplazado justo esa distancia.
  it("descuenta el punto base del bloque", () => {
    const conBase = [
      "0", "BLOCK", "2", "DESPLAZADO", "10", "50", "20", "50",
      ...lwpolilinea(true, [[50, 50], [150, 50], [150, 150], [50, 150]], "DESPLAZADO"),
      "0", "ENDBLK",
    ]

    const { features } = leer(
      conBloques(conBase, ["0", "INSERT", "8", "I", "2", "DESPLAZADO", "10", "1000", "20", "1000"]),
    )
    expect(features[0].geometry.coordinates[0][0]).toEqual([1000, 1000])
  })

  it("una inserción de un bloque que no existe se cuenta como no leída", () => {
    const { features, skipped } = leer(
      conBloques([], ["0", "INSERT", "8", "I", "2", "FANTASMA", "10", "0", "20", "0"]),
    )
    expect(features).toHaveLength(0)
    expect(skipped.INSERT).toBe(1)
  })
})

describe("lo que no se sabe leer", () => {
  /**
   * Se cuenta y se dice, en vez de desaparecer. Un CAD del que salen tres líneas
   * de doscientas entidades es un archivo que no se cargó, y quien lo abre tiene
   * que enterarse por el panel y no por el mapa medio vacío.
   */
  it("cuenta las entidades que no tienen conversor", () => {
    const { features, skipped } = leer(
      dxf(
        "0", "SPLINE", "8", "CURVAS", "10", "0", "20", "0",
        "0", "SPLINE", "8", "CURVAS", "10", "1", "20", "1",
        "0", "POINT", "8", "MOJONES", "10", "5", "20", "5",
      ),
    )

    expect(features).toHaveLength(1)
    expect(skipped.SPLINE).toBe(2)
  })

  it("lo resume en una frase con los tipos tal como los escribe AutoCAD", () => {
    const frase = describeSkipped({ SPLINE: 12, HATCH: 3 })
    expect(frase).toContain("15")
    expect(frase).toContain("12 SPLINE")
    expect(frase).toContain("3 HATCH")
  })

  it("no dice nada cuando se leyó todo", () => {
    expect(describeSkipped({})).toBeNull()
    expect(describeSkipped({ SPLINE: 0 })).toBeNull()
  })

  it("aguanta un archivo sin entidades", () => {
    expect(dxfToFeatures(null)).toEqual({ features: [], skipped: {} })
    expect(dxfToFeatures({})).toEqual({ features: [], skipped: {} })
  })
})
