import {
  CLEARANCE_M,
  DEFAULT_FOV,
  cameraHeightAboveGround,
  maxZoomAboveTerrain,
  safeZoomFor,
} from "./camera3d"

/** La pantalla con la que se midieron los números de referencia. */
const PANTALLA = { latitude: 6.24, viewportHeight: 900, fov: DEFAULT_FOV }

describe("cameraHeightAboveGround", () => {
  it("es el desnivel que MapLibre suma sobre la cota del centro", () => {
    // **Estos números salen del navegador, y hubo que leerlos dos veces.**
    //
    // La primera lectura se hizo con el terreno recién encendido, y ahí
    // `getCameraAltitude()` devolvía exactamente estas cifras. De donde se
    // concluyó —mal— que MapLibre mide la cámara desde el nivel del mar.
    //
    // Con el terreno ya cargado y el mapa quieto, la misma llamada devuelve la
    // cota del centro **más** estas cifras. Comprobado sobre un terreno llano de
    // 1.800 m en siete combinaciones de zoom e inclinación, con un margen de 8 m.
    // O sea que MapLibre coloca la cámara sobre el suelo, como Google Earth, y lo
    // que da esta función es el desnivel respecto de ese suelo.
    //
    // La diferencia entre las dos lecturas no es académica: con la equivocada, el
    // visor se alejaba nivel y medio de zoom de más al entrar en 3D.
    expect(cameraHeightAboveGround({ ...PANTALLA, zoom: 13, pitch: 0 })).toBeCloseTo(12808, -2)
    expect(cameraHeightAboveGround({ ...PANTALLA, zoom: 13, pitch: 58 })).toBeCloseTo(6787, -2)
    expect(cameraHeightAboveGround({ ...PANTALLA, zoom: 18, pitch: 0 })).toBeCloseTo(400, -1)
    expect(cameraHeightAboveGround({ ...PANTALLA, zoom: 18, pitch: 58 })).toBeCloseTo(212, -1)
  })

  it("a zoom 17 e inclinada 45°, la cámara va a unos 566 m sobre el suelo", () => {
    // Es el caso que reportó el usuario, y explica qué pasaba de verdad: la
    // cámara no estaba bajo tierra en el punto que miraba —estaba medio kilómetro
    // por encima— sino metida dentro de las lomas de al lado.
    expect(cameraHeightAboveGround({ ...PANTALLA, zoom: 17, pitch: 45 })).toBeCloseTo(566, -1)
  })

  it("cada nivel de zoom baja la cámara a la mitad", () => {
    // Es la razón de que el problema aparezca «de repente» al acercarse: la
    // altura no baja poco a poco, se divide por dos en cada nivel.
    const arriba = cameraHeightAboveGround({ ...PANTALLA, zoom: 14, pitch: 0 })
    const abajo = cameraHeightAboveGround({ ...PANTALLA, zoom: 15, pitch: 0 })
    expect(arriba / abajo).toBeCloseTo(2, 9)
  })

  it("inclinar baja la cámara", () => {
    // Y no es un detalle: a 58° se queda al 53 % de la altura, así que el 3D
    // hunde la cámara medio nivel de zoom solo por inclinarse.
    const plana = cameraHeightAboveGround({ ...PANTALLA, zoom: 15, pitch: 0 })
    const inclinada = cameraHeightAboveGround({ ...PANTALLA, zoom: 15, pitch: 58 })
    expect(inclinada / plana).toBeCloseTo(Math.cos((58 * Math.PI) / 180), 9)
  })
})

describe("maxZoomAboveTerrain", () => {
  it("el zoom que devuelve deja la cámara justo con el margen pedido", () => {
    // La comprobación de que la inversión está bien hecha: se calcula el tope y
    // se vuelve a meter en la fórmula directa.
    const cima = 1050
    const tope = maxZoomAboveTerrain({ ...PANTALLA, pitch: 45, reliefMeters: cima })
    expect(cameraHeightAboveGround({ ...PANTALLA, zoom: tope, pitch: 45 })).toBeCloseTo(
      cima + CLEARANCE_M,
      6,
    )
  })

  it("cuanto más sobresale el relieve, más lejos hay que ponerse", () => {
    const suave = maxZoomAboveTerrain({ ...PANTALLA, pitch: 45, reliefMeters: 300 })
    const escarpado = maxZoomAboveTerrain({ ...PANTALLA, pitch: 45, reliefMeters: 2000 })
    expect(escarpado).toBeLessThan(suave)
  })

  it("y cuanto más se inclina la cámara, también", () => {
    // Es la razón de bajar la inclinación de entrada de 58° a 45°: además de
    // verse menos brusca, deja la cámara un tercio más alta y hay que alejarse
    // menos para salvar la misma loma.
    const poco = maxZoomAboveTerrain({ ...PANTALLA, pitch: 45, reliefMeters: 1050 })
    const mucho = maxZoomAboveTerrain({ ...PANTALLA, pitch: 72, reliefMeters: 1050 })
    expect(mucho).toBeLessThan(poco)
    expect(poco - maxZoomAboveTerrain({ ...PANTALLA, pitch: 58, reliefMeters: 1050 })).toBeCloseTo(
      Math.log2(Math.cos((45 * Math.PI) / 180) / Math.cos((58 * Math.PI) / 180)),
      9,
    )
  })

  it("sin altura conocida no inventa un tope", () => {
    // `null + 400` son 400 en JavaScript, así que un guardia puesto sobre la
    // suma dejaba pasar «no sé la altura» como si el terreno estuviera a cero, y
    // el mapa se alejaba por un número que nadie había medido.
    expect(maxZoomAboveTerrain({ ...PANTALLA, pitch: 58, reliefMeters: null })).toBe(Infinity)
    expect(maxZoomAboveTerrain({ ...PANTALLA, pitch: 58, reliefMeters: NaN })).toBe(Infinity)
    expect(maxZoomAboveTerrain({ ...PANTALLA, pitch: 58, reliefMeters: undefined })).toBe(
      Infinity,
    )
  })

  it("a nivel del mar el tope es solo el margen", () => {
    // Esta función responde «hasta dónde con este margen», sin opinar sobre si
    // conviene aplicarlo. Quien decide eso es `safeZoomFor`.
    const tope = maxZoomAboveTerrain({ ...PANTALLA, pitch: 58, reliefMeters: 0 })
    expect(cameraHeightAboveGround({ ...PANTALLA, zoom: tope, pitch: 58 })).toBeCloseTo(CLEARANCE_M, 6)
  })

  it("en un valle de Medellín el tope cae cerca de zoom 15, no de 14", () => {
    // El caso real que motivó todo esto, con la premisa ya corregida: el fondo
    // del valle a 1.500 m y las lomas a 2.200 son 700 m de desnivel, que con
    // exageración 1,5 se dibujan como 1.050. Con la premisa vieja —salvar los
    // 3.300 m de cota absoluta— el tope salía en 13,9: nivel y medio de zoom más
    // lejos de donde estaba el usuario, por nada.
    const tope = maxZoomAboveTerrain({ ...PANTALLA, pitch: 45, reliefMeters: 700 * 1.5 })
    expect(tope).toBeGreaterThan(15)
    expect(tope).toBeLessThan(16)
  })
})

describe("safeZoomFor", () => {
  it("aleja cuando hace falta", () => {
    const zoom = safeZoomFor({ ...PANTALLA, currentZoom: 18, pitch: 45, reliefMeters: 1050 })
    expect(zoom).toBeLessThan(18)
  })

  it("pero nunca acerca", () => {
    // Quien está mirando de lejos lo pidió así: entrar en 3D no tiene por qué
    // meterle el mapa en la cara.
    const zoom = safeZoomFor({ ...PANTALLA, currentZoom: 9, pitch: 45, reliefMeters: 1050 })
    expect(zoom).toBe(9)
  })

  it("y sin altura conocida deja el zoom como estaba", () => {
    // Peor que hoy, imposible: si el modelo no llegó, la vista se queda igual
    // que antes de este arreglo en vez de moverse por un número inventado.
    expect(safeZoomFor({ ...PANTALLA, currentZoom: 18, pitch: 45, reliefMeters: null })).toBe(18)
    expect(safeZoomFor({ ...PANTALLA, currentZoom: 18, pitch: 45, reliefMeters: NaN })).toBe(18)
  })

  it("no toca nada si el terreno de alrededor no sobresale", () => {
    // **Es la regla que evita restringir donde no pasaba nada.** Con el margen
    // aplicado siempre, mirar en 3D una llanura habría quedado limitado sin que
    // hubiera ningún problema que resolver. A zoom 18 e inclinada, la cámara va
    // 260 m sobre el suelo: de sobra para una llanura, insuficiente para una loma
    // de mil metros.
    expect(safeZoomFor({ ...PANTALLA, currentZoom: 18, pitch: 45, reliefMeters: 5 })).toBe(18)
    expect(
      safeZoomFor({ ...PANTALLA, currentZoom: 18, pitch: 45, reliefMeters: 1050 }),
    ).toBeLessThan(16)
  })

  it("cuando sí se mete, deja la cámara con el margen por encima", () => {
    const relieve = 1050
    const zoom = safeZoomFor({ ...PANTALLA, currentZoom: 18, pitch: 45, reliefMeters: relieve })
    expect(cameraHeightAboveGround({ ...PANTALLA, zoom, pitch: 45 })).toBeCloseTo(
      relieve + CLEARANCE_M,
      6,
    )
  })
})
