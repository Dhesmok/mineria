import {
  LABEL_HEIGHT,
  LABEL_WIDTH,
  selectVisibleLabels,
} from "./labelPlacement"

/**
 * Proyección de mentira, pero honesta: `escala` píxeles por grado, con la Y al
 * revés como en cualquier pantalla. Basta para razonar sobre tamaños y choques.
 */
const proyeccion = (escala) => (lngLat) => ({
  x: 500 + lngLat[0] * escala,
  y: 500 - lngLat[1] * escala,
})

/** Un candidato cuadrado de `lado` grados centrado en (lng, lat). */
const figura = (text, lng, lat, lado) => ({
  text,
  anchor: [lng, lat],
  bbox: {
    west: lng - lado / 2,
    east: lng + lado / 2,
    south: lat - lado / 2,
    north: lat + lado / 2,
  },
})

const opciones = (escala, extra = {}) => ({
  project: proyeccion(escala),
  width: 1000,
  height: 1000,
  ...extra,
})

describe("selectVisibleLabels", () => {
  it("no etiqueta la figura en la que la etiqueta no cabe", () => {
    // Con 100 px por grado, un cuadrado de 0,1° mide 10 px de lado: menos que
    // el ancho y que el alto de una etiqueta.
    // En el centro de la pantalla, para que al acercar no se salga de cuadro.
    const pequena = figura("TIT-1", 0, 0, 0.1)
    expect(selectVisibleLabels([pequena], opciones(100))).toEqual([])

    // El mismo cuadrado, más cerca: 200 px de lado y ahí sí cabe.
    expect(selectVisibleLabels([pequena], opciones(2000))).toEqual([pequena])
  })

  it("el umbral es justo el tamaño de la etiqueta", () => {
    const lado = 1
    const justoDentro = figura("TIT-1", 2, 2, lado)
    // Escala tal que el lado mide exactamente el ancho de la etiqueta.
    expect(selectVisibleLabels([justoDentro], opciones(LABEL_WIDTH / lado))).toEqual([justoDentro])
    expect(selectVisibleLabels([justoDentro], opciones((LABEL_WIDTH - 1) / lado))).toEqual([])
  })

  it("descarta la que chocaría con una ya puesta, y conserva la más grande", () => {
    // Dos figuras casi en el mismo sitio: sus etiquetas se pisarían.
    const grande = figura("GRANDE", 1, 1, 2)
    const chica = figura("CHICA", 1.01, 1, 1)

    const elegidas = selectVisibleLabels([chica, grande], opciones(100))

    // Se elige por superficie en pantalla, no por el orden en que llegan: la
    // chica va primera en la lista y aun así pierde.
    expect(elegidas).toEqual([grande])
  })

  it("deja las dos cuando no se pisan", () => {
    const a = figura("A", 1, 1, 2)
    const b = figura("B", 5, 1, 2)
    expect(selectVisibleLabels([a, b], opciones(100)).map((f) => f.text).sort()).toEqual(["A", "B"])
  })

  it("descarta lo que queda fuera de la pantalla", () => {
    // En modo "toda la capa" lo cargado puede ser el país entero, y proyectar
    // mil etiquetas invisibles cuesta lo mismo que proyectar las visibles.
    const dentro = figura("DENTRO", 1, -1, 2)
    const fuera = figura("FUERA", 90, -1, 2)
    expect(selectVisibleLabels([dentro, fuera], opciones(100))).toEqual([dentro])
  })

  it("respeta el tope de etiquetas", () => {
    // Separadas lo justo para no chocar: sin tope saldrían las diez.
    const muchas = Array.from({ length: 10 }, (_, i) => figura(`T${i}`, i * 2, 1, 1.5))
    const elegidas = selectVisibleLabels(muchas, opciones(100, { maxLabels: 3 }))
    expect(elegidas).toHaveLength(3)
  })

  it("aguanta entradas incompletas sin reventar", () => {
    // `getLabelCoordinates` devuelve null en geometrías que no dejan ubicar la
    // etiqueta, y `bboxOfGeometry` en las vacías. Eso llega hasta aquí.
    const bueno = figura("OK", 1, 1, 2)
    const entrada = [null, { anchor: null, bbox: null }, { anchor: [1, 1] }, bueno]
    expect(selectVisibleLabels(entrada, opciones(100))).toEqual([bueno])
  })

  it("sin función de proyección no devuelve nada, en vez de fallar", () => {
    // Pasa de verdad: el mapa puede haberse destruido entre el momento en que
    // se pidió el redibujado y el momento en que se ejecuta.
    expect(selectVisibleLabels([figura("A", 1, 1, 2)], {})).toEqual([])
  })

  it("una etiqueta ancha y baja no cabe en una figura alargada en vertical", () => {
    // Un título largo y estrecho: tiene alto de sobra y ancho insuficiente.
    const alargada = {
      text: "TIT-1",
      anchor: [1, 1],
      bbox: { west: 0.9, east: 1.1, south: -5, north: 7 },
    }
    const escala = 100 // 20 px de ancho, 1200 de alto
    expect(20).toBeLessThan(LABEL_WIDTH)
    expect(1200).toBeGreaterThan(LABEL_HEIGHT)
    expect(selectVisibleLabels([alargada], opciones(escala))).toEqual([])
  })
})
