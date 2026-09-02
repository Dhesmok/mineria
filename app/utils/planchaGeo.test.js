import {
  chooseOrigin,
  detectFrame,
  detectGridLines,
  fitGridAxis,
  georeferencePlancha,
  gridLabelsFrom,
  gridSeries,
  pairSeries,
  parseGridValue,
} from "./planchaGeo"

/**
 * Una plancha de mentira, dibujada a mano.
 *
 * Reproduce lo único que el módulo mira de una hoja real: un marco negro, una
 * cuadrícula gris por dentro y los rótulos de los márgenes con el corrimiento que
 * tienen de verdad —van centrados bajo su línea, así que su ancla queda a media
 * palabra a la izquierda—. Con eso se puede comprobar la cadena entera sin
 * arrastrar un PDF de veinticuatro megas al repositorio.
 *
 * Los números son los de la plancha 132 (Yolombó), que es sobre la que se
 * diseñó todo: 60 × 40 km en el Origen Bogotá, rotulada cada 5 km.
 */
const dibujarPlancha = ({
  width = 900,
  height = 700,
  marco = { left: 80, right: 680, top: 60, bottom: 460 },
  este0 = 880000,
  norte0 = 1200000,
  paso = 5000,
  metrosPorPixel = 100,
  sesgoRotulo = 7,
  ruido = [],
  indice = false,
  escalaGrafica = false,
} = {}) => {
  const gray = new Uint8Array(width * height).fill(255)
  const pinta = (x, y, v) => {
    if (x >= 0 && x < width && y >= 0 && y < height) gray[y * width + x] = v
  }

  // El marco: tres píxeles de grueso y negro, **centrados en la coordenada**,
  // que es como se imprime una línea de verdad. Dibujarlo hacia adentro correría
  // el borde medio píxel y el recorte saldría cincuenta metros desplazado.
  for (let y = marco.top - 1; y <= marco.bottom + 1; y += 1) {
    for (let g = -1; g <= 1; g += 1) {
      pinta(marco.left + g, y, 0)
      pinta(marco.right + g, y, 0)
    }
  }
  for (let x = marco.left - 1; x <= marco.right + 1; x += 1) {
    for (let g = -1; g <= 1; g += 1) {
      pinta(x, marco.top + g, 0)
      pinta(x, marco.bottom + g, 0)
    }
  }

  const pasoPx = paso / metrosPorPixel
  const items = []

  // Las verticales, grises, y su rótulo debajo del marco.
  for (let x = marco.left + pasoPx; x < marco.right; x += pasoPx) {
    for (let y = marco.top + 3; y < marco.bottom - 2; y += 1) pinta(Math.round(x), y, 150)
    const valor = este0 + Math.round(((x - marco.left) / pasoPx) * paso)
    items.push({ text: `${valor / 1000}.`, x: x - sesgoRotulo, y: marco.bottom + 12 })
  }
  // El primero y el último caen sobre el propio marco: se rotulan igual, que es
  // lo que hace una hoja de verdad.
  items.push({ text: `${este0 / 1000}.`, x: marco.left - sesgoRotulo, y: marco.bottom + 12 })

  // Las horizontales, y su rótulo al costado.
  for (let y = marco.bottom - pasoPx; y > marco.top; y -= pasoPx) {
    for (let x = marco.left + 3; x < marco.right - 2; x += 1) pinta(x, Math.round(y), 150)
    const valor = norte0 + Math.round(((marco.bottom - y) / pasoPx) * paso)
    items.push({ text: `${(valor / 1000).toLocaleString("es")}.`, x: marco.left - 40, y: y + 3 })
  }
  items.push({ text: `${(norte0 / 1000).toLocaleString("es")}.`, x: marco.left - 40, y: marco.bottom + 3 })

  // El índice de localización que llevan las hojas del SGC por el borde de
  // arriba: `1 2 3 … 12`, para decir «la mina está en el D-7». Son números en
  // progresión perfecta, separados exactamente el paso de la cuadrícula.
  if (indice) {
    let n = 1
    for (let x = marco.left + pasoPx / 2; x < marco.right; x += pasoPx) {
      items.push({ text: String(n), x, y: marco.top - 10 })
      n += 1
    }
  }

  // Y la escala gráfica del corte geológico: metros redondos, también en fila.
  if (escalaGrafica) {
    for (let n = 1; n <= 6; n += 1) {
      items.push({ text: `${n}.000`, x: 300 + n * 30, y: height - 30 })
    }
  }

  return { gray, width, height, items: [...items, ...ruido], marco, metrosPorPixel }
}

describe("parseGridValue", () => {
  test("un rótulo abreviado son miles", () => {
    expect(parseGridValue("880.")).toBe(880000)
    expect(parseGridValue("1.240.")).toBe(1240000)
  })

  test("uno completo se toma tal cual", () => {
    expect(parseGridValue("880.000")).toBe(880000)
    expect(parseGridValue("1.200.000 m.N")).toBe(1200000)
    expect(parseGridValue("940.000 m.E")).toBe(940000)
  })

  test("lo que no es un número no lo es", () => {
    expect(parseGridValue("74°45'W")).toBeNull()
    expect(parseGridValue("Qal")).toBeNull()
    expect(parseGridValue("")).toBeNull()
    expect(parseGridValue(null)).toBeNull()
  })
})

describe("gridSeries", () => {
  const fila = [
    { value: 880000, x: 100, y: 500 },
    { value: 885000, x: 150, y: 500 },
    { value: 890000, x: 200, y: 501 },
    { value: 895000, x: 250, y: 500 },
    { value: 900000, x: 300, y: 500 },
  ]

  test("encuentra la fila de estes", () => {
    const [serie] = gridSeries(fila, { fijo: "y", movil: "x", sentido: +1, tolerancia: 5 })
    expect(serie.labels.map((r) => r.value)).toEqual([880000, 885000, 890000, 895000, 900000])
    expect(serie.scale).toBeCloseTo(0.01, 6)
  })

  test("aguanta intrusos en la misma fila", () => {
    // Es el caso real: el rótulo de la esquina, que es un norte, y un trozo de la
    // retícula geográfica, caen a la misma altura que los estes.
    const conRuido = [
      ...fila,
      { value: 1240000, x: 30, y: 500 },
      { value: 74000, x: 275, y: 500 },
    ]
    const [serie] = gridSeries(conRuido, { fijo: "y", movil: "x", sentido: +1, tolerancia: 5 })
    expect(serie.labels.map((r) => r.value)).toEqual([880000, 885000, 890000, 895000, 900000])
  })

  test("no inventa una serie con menos de cinco rótulos", () => {
    expect(gridSeries(fila.slice(0, 4), { fijo: "y", movil: "x", sentido: +1, tolerancia: 5 })).toEqual([])
  })

  test("rechaza la serie que va al revés", () => {
    expect(gridSeries(fila, { fijo: "y", movil: "x", sentido: -1, tolerancia: 5 })).toEqual([])
  })

  test("un número demasiado pequeño no es una coordenada", () => {
    // El índice de localización del borde —`1 2 3 … 12`— forma una progresión
    // impecable, y por magnitud no puede ser un este de ningún origen del país.
    const indice = [1, 2, 3, 4, 5, 6].map((n) => ({ value: n * 1000, x: n * 50, y: 40 }))
    expect(gridSeries(indice, { fijo: "y", movil: "x", sentido: +1, tolerancia: 5 })).toEqual([])
  })
})

describe("pairSeries", () => {
  const serie = (scale, n) => ({ scale, labels: new Array(n).fill(null) })

  test("empareja las dos series cuya escala coincide", () => {
    const elegida = pairSeries(
      [serie(0.142, 12), serie(0.02835, 10)],
      [serie(-0.02832, 9)],
    )
    expect(elegida.estes.scale).toBeCloseTo(0.02835, 5)
  })

  test("descarta la escala gráfica del corte, que va tres órdenes lejos", () => {
    expect(pairSeries([serie(3.1e-5, 8)], [serie(-0.02832, 9)])).toBeNull()
  })

  test("sin ninguna pareja que concuerde, ninguna", () => {
    expect(pairSeries([], [serie(-0.02832, 9)])).toBeNull()
  })
})

describe("detectGridLines", () => {
  test("encuentra las líneas grises y no el marco", () => {
    const hoja = dibujarPlancha()
    const lineas = detectGridLines(hoja.gray, {
      width: hoja.width,
      height: hoja.height,
      vertical: true,
      left: hoja.marco.left,
      right: hoja.marco.right,
      top: hoja.marco.top + 20,
      bottom: hoja.marco.bottom - 20,
      separacion: 4,
    })
    // Once líneas interiores en una hoja de sesenta kilómetros rotulada cada cinco.
    expect(lineas).toHaveLength(11)
    expect(lineas[0]).toBeCloseTo(130, 0)
    expect(lineas[10]).toBeCloseTo(630, 0)
  })
})

describe("fitGridAxis", () => {
  test("empareja líneas con rótulos y ajusta", () => {
    const rotulos = [
      { value: 885000, x: 123 },
      { value: 890000, x: 173 },
      { value: 895000, x: 223 },
      { value: 900000, x: 273 },
      { value: 905000, x: 323 },
    ]
    const ajuste = fitGridAxis([130, 180, 230, 280, 330], rotulos, { movil: "x" })
    expect(ajuste.scale).toBeCloseTo(0.01, 6)
    expect(ajuste.residual).toBeLessThan(0.01)
    expect(ajuste.count).toBe(5)
  })

  test("tira la línea que no es de la cuadrícula", () => {
    const rotulos = [
      { value: 885000, x: 123 },
      { value: 890000, x: 173 },
      { value: 895000, x: 223 },
      { value: 900000, x: 273 },
      { value: 905000, x: 323 },
    ]
    // La de 214 es un contacto geológico recto que el detector recogió: cae cerca
    // del rótulo de 895.000 pero peor que la de verdad, así que sobra.
    const ajuste = fitGridAxis([130, 180, 214, 230, 280, 330], rotulos, { movil: "x" })
    expect(ajuste.residual).toBeLessThan(0.01)
  })
})

describe("detectFrame", () => {
  test("da con el marco cuando cae sobre la cuadrícula", () => {
    const hoja = dibujarPlancha()
    const marco = detectFrame(hoja.gray, {
      width: hoja.width,
      height: hoja.height,
      lineasX: [130, 180, 230, 280, 330, 380, 430, 480, 530, 580, 630],
      lineasY: [110, 160, 210, 260, 310, 360, 410],
    })
    expect(marco.complete).toBe(true)
    expect(marco.left).toBeCloseTo(80, 0)
    expect(marco.right).toBeCloseTo(680, 0)
    expect(marco.top).toBeCloseTo(60, 0)
    expect(marco.bottom).toBeCloseTo(460, 0)
  })
})

describe("chooseOrigin", () => {
  test("elige el huso que deja la hoja donde se tocó", () => {
    // 910.000 / 1.220.000 en el Origen Bogotá cae en el nordeste de Antioquia.
    const elegido = chooseOrigin([910000, 1220000], [-74.87, 6.6])
    expect(elegido.crs.id).toBe("3116")
    expect(elegido.km).toBeLessThan(5)
  })

  test("no coloca la hoja si ningún huso la deja cerca", () => {
    expect(chooseOrigin([910000, 1220000], [-72.0, 4.0])).toBeNull()
  })
})

describe("georeferencePlancha", () => {
  test("de una hoja dibujada saca sus cuatro esquinas", () => {
    const hoja = dibujarPlancha()
    const resultado = georeferencePlancha({
      items: hoja.items,
      gray: hoja.gray,
      width: hoja.width,
      height: hoja.height,
      cerca: [-74.87, 6.6],
    })

    expect(resultado.ok).toBe(true)
    expect(resultado.crs.id).toBe("3116")
    expect(resultado.frameComplete).toBe(true)
    // El recorte tiene que dar los 60 × 40 km que se dibujaron, al metro.
    expect(resultado.bounds.oeste).toBeCloseTo(880000, -1)
    expect(resultado.bounds.este).toBeCloseTo(940000, -1)
    expect(resultado.bounds.sur).toBeCloseTo(1200000, -1)
    expect(resultado.bounds.norte).toBeCloseTo(1240000, -1)
    expect(resultado.corners).toHaveLength(4)
    // Las esquinas, en el orden que pide MapLibre: NO, NE, SE, SO.
    const [no, ne, se, so] = resultado.corners
    expect(no[0]).toBeLessThan(ne[0])
    expect(no[1]).toBeGreaterThan(so[1])
    expect(se[0]).toBeCloseTo(ne[0], 2)
  })

  test("los números de la leyenda no se confunden con la cuadrícula", () => {
    // Una escala gráfica del corte geológico, en el margen de abajo: cinco
    // números en fila que no forman progresión con la cuadrícula.
    const ruido = [1, 2, 3, 4, 5, 6].map((n) => ({
      text: `${n}.000`,
      x: 200 + n * 30,
      y: 620,
    }))
    const hoja = dibujarPlancha({ ruido })
    const resultado = georeferencePlancha({
      items: hoja.items,
      gray: hoja.gray,
      width: hoja.width,
      height: hoja.height,
      cerca: [-74.87, 6.6],
    })
    expect(resultado.ok).toBe(true)
    expect(resultado.bounds.oeste).toBeCloseTo(880000, -1)
  })

  test("el índice de localización del borde no se confunde con los estes", () => {
    // El fallo de la plancha 21 (Fonseca). Los `1 2 3 … 12` del borde forman una
    // progresión perfecta separada exactamente el paso de la cuadrícula, y
    // ganaban a los estes de verdad por ser más numerosos.
    const hoja = dibujarPlancha({ indice: true })
    const resultado = georeferencePlancha({
      items: hoja.items,
      gray: hoja.gray,
      width: hoja.width,
      height: hoja.height,
      cerca: [-74.87, 6.6],
    })
    expect(resultado.ok).toBe(true)
    expect(resultado.bounds.oeste).toBeCloseTo(880000, -1)
    expect(resultado.bounds.este).toBeCloseTo(940000, -1)
  })

  test("la escala gráfica del corte tampoco", () => {
    // `1.000 2.000 3.000` metros pasan el filtro de magnitud —salen a uno, dos y
    // tres millones— pero su escala aparente está tres órdenes lejos de la de
    // los nortes, y ahí se caen.
    const hoja = dibujarPlancha({ escalaGrafica: true })
    const resultado = georeferencePlancha({
      items: hoja.items,
      gray: hoja.gray,
      width: hoja.width,
      height: hoja.height,
      cerca: [-74.87, 6.6],
    })
    expect(resultado.ok).toBe(true)
    expect(resultado.bounds.oeste).toBeCloseTo(880000, -1)
  })

  test("el marco pegado a la última línea de la cuadrícula se encuentra igual", () => {
    // El segundo fallo de Fonseca: su marco cae a diez píxeles de la última
    // línea, y la búsqueda pasaba de largo y se quedaba con el borde de la
    // franja del índice, un kilómetro más allá.
    const hoja = dibujarPlancha({ marco: { left: 80, right: 690, top: 50, bottom: 460 } })
    const resultado = georeferencePlancha({
      items: hoja.items,
      gray: hoja.gray,
      width: hoja.width,
      height: hoja.height,
      cerca: [-74.87, 6.6],
    })
    expect(resultado.ok).toBe(true)
    expect(resultado.frameComplete).toBe(true)
    // El marco va diez píxeles —mil metros— más allá de la última línea.
    expect(resultado.bounds.este).toBeCloseTo(941000, -2)
    expect(resultado.bounds.norte).toBeCloseTo(1241000, -2)
  })

  test("una hoja sin capa de texto se rechaza en vez de colocarse a ojo", () => {
    const hoja = dibujarPlancha()
    const resultado = georeferencePlancha({
      items: [],
      gray: hoja.gray,
      width: hoja.width,
      height: hoja.height,
      cerca: [-74.87, 6.6],
    })
    expect(resultado.ok).toBe(false)
    expect(resultado.reason).toBe("sin-rotulos")
    // Y dice con qué números falló: es lo que permite arreglar la hoja siguiente
    // sin tener el archivo delante.
    expect(resultado.detail).toMatch(/con forma de coordenada/)
  })

  test("una cuadrícula que no cae cerca del clic no se coloca", () => {
    const hoja = dibujarPlancha()
    const resultado = georeferencePlancha({
      items: hoja.items,
      gray: hoja.gray,
      width: hoja.width,
      height: hoja.height,
      cerca: [-70.0, 2.0],
    })
    expect(resultado.ok).toBe(false)
    expect(resultado.reason).toBe("origen-desconocido")
  })
})

describe("gridLabelsFrom", () => {
  test("se queda solo con lo que es un número y tiene sitio", () => {
    const rotulos = gridLabelsFrom([
      { text: "880.", x: 10, y: 20 },
      { text: "Qal", x: 30, y: 40 },
      { text: "885.", x: 50 },
    ])
    expect(rotulos).toEqual([{ value: 880000, x: 10, y: 20 }])
  })
})
