import {
  CLEARANCE_M,
  DEFAULT_FOV,
  cameraAltitude,
  maxZoomAboveTerrain,
  safeZoomFor,
} from "./camera3d"

/** La pantalla con la que se midieron los números de referencia. */
const PANTALLA = { latitude: 6.24, viewportHeight: 900, fov: DEFAULT_FOV }

describe("cameraAltitude", () => {
  it("coincide con lo que reporta MapLibre", () => {
    // **Estos números no son teoría: salen de leer `getCameraAltitude()` en el
    // navegador** con un lienzo de 1440×900 sobre Medellín. Si esta fórmula se
    // desvía de la de MapLibre, el 3D se corregiría hacia un sitio equivocado y
    // no habría forma de notarlo mirando el mapa.
    expect(cameraAltitude({ ...PANTALLA, zoom: 13, pitch: 0 })).toBeCloseTo(12808, -2)
    expect(cameraAltitude({ ...PANTALLA, zoom: 13, pitch: 58 })).toBeCloseTo(6787, -2)
    expect(cameraAltitude({ ...PANTALLA, zoom: 18, pitch: 0 })).toBeCloseTo(400, -1)
    expect(cameraAltitude({ ...PANTALLA, zoom: 18, pitch: 58 })).toBeCloseTo(212, -1)
  })

  it("cada nivel de zoom baja la cámara a la mitad", () => {
    // Es la razón de que el problema aparezca «de repente» al acercarse: la
    // altura no baja poco a poco, se divide por dos en cada nivel.
    const arriba = cameraAltitude({ ...PANTALLA, zoom: 14, pitch: 0 })
    const abajo = cameraAltitude({ ...PANTALLA, zoom: 15, pitch: 0 })
    expect(arriba / abajo).toBeCloseTo(2, 9)
  })

  it("inclinar baja la cámara", () => {
    // Y no es un detalle: a 58° se queda al 53 % de la altura, así que el 3D
    // hunde la cámara medio nivel de zoom solo por inclinarse.
    const plana = cameraAltitude({ ...PANTALLA, zoom: 15, pitch: 0 })
    const inclinada = cameraAltitude({ ...PANTALLA, zoom: 15, pitch: 58 })
    expect(inclinada / plana).toBeCloseTo(Math.cos((58 * Math.PI) / 180), 9)
  })
})

describe("maxZoomAboveTerrain", () => {
  it("el zoom que devuelve deja la cámara justo con el margen pedido", () => {
    // La comprobación de que la inversión está bien hecha: se calcula el tope y
    // se vuelve a meter en la fórmula directa.
    const cima = 2700
    const tope = maxZoomAboveTerrain({ ...PANTALLA, pitch: 58, terrainTopMeters: cima })
    expect(cameraAltitude({ ...PANTALLA, zoom: tope, pitch: 58 })).toBeCloseTo(
      cima + CLEARANCE_M,
      6,
    )
  })

  it("cuanto más alto el terreno, más lejos hay que ponerse", () => {
    const bajo = maxZoomAboveTerrain({ ...PANTALLA, pitch: 58, terrainTopMeters: 1000 })
    const alto = maxZoomAboveTerrain({ ...PANTALLA, pitch: 58, terrainTopMeters: 5000 })
    expect(alto).toBeLessThan(bajo)
  })

  it("y cuanto más se inclina la cámara, también", () => {
    const poco = maxZoomAboveTerrain({ ...PANTALLA, pitch: 30, terrainTopMeters: 2700 })
    const mucho = maxZoomAboveTerrain({ ...PANTALLA, pitch: 72, terrainTopMeters: 2700 })
    expect(mucho).toBeLessThan(poco)
  })

  it("sin altura conocida no inventa un tope", () => {
    // `null + 400` son 400 en JavaScript, así que un guardia puesto sobre la
    // suma dejaba pasar «no sé la altura» como si el terreno estuviera a cero, y
    // el mapa se alejaba por un número que nadie había medido.
    expect(maxZoomAboveTerrain({ ...PANTALLA, pitch: 58, terrainTopMeters: null })).toBe(Infinity)
    expect(maxZoomAboveTerrain({ ...PANTALLA, pitch: 58, terrainTopMeters: NaN })).toBe(Infinity)
    expect(maxZoomAboveTerrain({ ...PANTALLA, pitch: 58, terrainTopMeters: undefined })).toBe(
      Infinity,
    )
  })

  it("a nivel del mar el tope es solo el margen", () => {
    // Esta función responde «hasta dónde con este margen», sin opinar sobre si
    // conviene aplicarlo. Quien decide eso es `safeZoomFor`.
    const tope = maxZoomAboveTerrain({ ...PANTALLA, pitch: 58, terrainTopMeters: 0 })
    expect(cameraAltitude({ ...PANTALLA, zoom: tope, pitch: 58 })).toBeCloseTo(CLEARANCE_M, 6)
  })

  it("en Medellín, a 58°, el tope cae cerca de zoom 14", () => {
    // El caso real que motivó todo esto: cota 1.800 con exageración 1,5 son
    // 2.700 m de superficie dibujada. A zoom 15 la cámara está a 1.697 m, o sea
    // mil metros dentro del cerro.
    const tope = maxZoomAboveTerrain({ ...PANTALLA, pitch: 58, terrainTopMeters: 1800 * 1.5 })
    expect(tope).toBeGreaterThan(13.5)
    expect(tope).toBeLessThan(15)
  })
})

describe("safeZoomFor", () => {
  it("aleja cuando hace falta", () => {
    const zoom = safeZoomFor({
      ...PANTALLA,
      currentZoom: 18,
      pitch: 58,
      terrainTopMeters: 2700,
    })
    expect(zoom).toBeLessThan(18)
  })

  it("pero nunca acerca", () => {
    // Quien está mirando de lejos lo pidió así: entrar en 3D no tiene por qué
    // meterle el mapa en la cara.
    const zoom = safeZoomFor({
      ...PANTALLA,
      currentZoom: 9,
      pitch: 58,
      terrainTopMeters: 2700,
    })
    expect(zoom).toBe(9)
  })

  it("y sin altura conocida deja el zoom como estaba", () => {
    // Peor que hoy, imposible: si el modelo no llegó, la vista se queda igual
    // que antes de este arreglo en vez de moverse por un número inventado.
    expect(safeZoomFor({ ...PANTALLA, currentZoom: 18, pitch: 58, terrainTopMeters: null })).toBe(18)
    expect(safeZoomFor({ ...PANTALLA, currentZoom: 18, pitch: 58, terrainTopMeters: NaN })).toBe(18)
  })

  it("no toca nada si la cámara ya está por encima del terreno", () => {
    // **Es la regla que evita restringir donde no pasaba nada.** Con el margen
    // aplicado siempre, mirar en 3D una playa —terreno a cota cero— habría
    // quedado limitado a zoom 17 sin que hubiera ningún problema que resolver.
    // A zoom 18 e inclinada, la cámara está a 212 m: por encima de una playa, y
    // por debajo de un cerro de 2.700.
    const playa = safeZoomFor({ ...PANTALLA, currentZoom: 18, pitch: 58, terrainTopMeters: 5 })
    expect(playa).toBe(18)

    const cerro = safeZoomFor({ ...PANTALLA, currentZoom: 18, pitch: 58, terrainTopMeters: 2700 })
    expect(cerro).toBeLessThan(15)
  })

  it("cuando sí se mete, deja la cámara con el margen por encima", () => {
    const cima = 2700
    const zoom = safeZoomFor({ ...PANTALLA, currentZoom: 18, pitch: 58, terrainTopMeters: cima })
    expect(cameraAltitude({ ...PANTALLA, zoom, pitch: 58 })).toBeCloseTo(cima + CLEARANCE_M, 6)
  })
})
