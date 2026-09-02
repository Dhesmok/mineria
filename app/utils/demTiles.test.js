import {
  DEM_MAX_ZOOM,
  DEM_MIN_ZOOM,
  MAX_TILES,
  TILE_SIZE,
  blankTile,
  boundsAroundCenter,
  cellSizeMeters,
  demZoomFor,
  elevationFromPixel,
  latToMercatorY,
  lngToMercatorX,
  mercatorXToLng,
  mercatorYToLat,
  mosaicCornersOf,
  pasteTile,
  radius3DForZoom,
  tileRangeFor,
  tileUrl,
  tilesOf,
} from "./demTiles"

/** Un rectángulo alrededor de Medellín, del tamaño que se pida en grados. */
const alrededorDeMedellin = (grados) => ({
  west: -75.6 - grados / 2,
  east: -75.6 + grados / 2,
  south: 6.24 - grados / 2,
  north: 6.24 + grados / 2,
})

describe("Mercator", () => {
  it("ida y vuelta deja el punto donde estaba", () => {
    const puntos = [
      [-75.6, 6.24],
      [0, 0],
      [179.9, -33.4],
      [-120, 60],
    ]
    puntos.forEach(([lng, lat]) => {
      expect(mercatorXToLng(lngToMercatorX(lng))).toBeCloseTo(lng, 9)
      expect(mercatorYToLat(latToMercatorY(lat))).toBeCloseTo(lat, 9)
    })
  })

  it("el centro del mundo cae en el centro", () => {
    expect(lngToMercatorX(0)).toBeCloseTo(0.5, 12)
    expect(latToMercatorY(0)).toBeCloseTo(0.5, 12)
  })

  it("el norte queda arriba", () => {
    // Y no al revés, que es el error que da mapas del revés sin que nada falle.
    expect(latToMercatorY(60)).toBeLessThan(latToMercatorY(-60))
  })
})

describe("cellSizeMeters", () => {
  it("en Colombia, el nivel 13 da celdas de unos 19 m", () => {
    // Es la comprobación de que el nivel elegido se parece a la resolución real
    // del modelo (~30 m): si diera 300 m, estaríamos pintando otra cosa.
    expect(cellSizeMeters(6.24, 13)).toBeGreaterThan(17)
    expect(cellSizeMeters(6.24, 13)).toBeLessThan(21)
  })

  it("cada nivel divide la celda por dos", () => {
    expect(cellSizeMeters(6.24, 12) / cellSizeMeters(6.24, 13)).toBeCloseTo(2, 9)
  })

  it("la misma celda es más pequeña lejos del ecuador", () => {
    // Mercator estira las distancias con la latitud. En Colombia el factor es
    // casi 1, pero escribirlo bien evita heredar un error silencioso en Chile.
    expect(cellSizeMeters(60, 13)).toBeLessThan(cellSizeMeters(6.24, 13))
  })
})

describe("demZoomFor", () => {
  it("un nivel por encima del zoom del mapa, por el convenio de MapLibre", () => {
    // **Es la prueba de un bug que ninguna comprobación sobre datos encontró.**
    // MapLibre cuenta el zoom con teselas de 512 px y estas son de 256, así que
    // su nivel 11 es el 12 de aquí. Sin el desfase la capa salía bien colocada y
    // con los colores correctos, pero a la mitad de resolución de lo que la
    // pantalla podía enseñar. Se vio midiendo en una captura, no en un test.
    expect(demZoomFor(11)).toBe(12)
    expect(demZoomFor(11.4)).toBe(12)
    expect(demZoomFor(11.6)).toBe(13)
  })

  it("y a ese nivel una celda mide lo que un píxel de pantalla", () => {
    // La comprobación del convenio, escrita como la relación que tiene que
    // cumplirse: el mundo de MapLibre a zoom Z mide 512·2^Z píxeles, y el de
    // estas teselas al nivel N mide 256·2^N. Para que una celda sea un píxel,
    // los dos tienen que dar lo mismo.
    const mapZoom = 11
    expect(256 * 2 ** demZoomFor(mapZoom)).toBe(512 * 2 ** mapZoom)
  })

  it("no pasa del máximo, porque más allá el dato no mejora", () => {
    // El origen es SRTM de ~30 m. El nivel 13 ya da celdas de 19 m; pedir el 14
    // sería estirar la misma información y decir «celdas 10 m» al lado del aviso
    // que dice que el modelo es de 30.
    expect(demZoomFor(18)).toBe(DEM_MAX_ZOOM)
  })

  it("ni baja del mínimo", () => {
    expect(demZoomFor(3)).toBe(DEM_MIN_ZOOM)
  })
})

describe("tileRangeFor", () => {
  it("cubre el rectángulo entero", () => {
    const limites = alrededorDeMedellin(0.05)
    const rango = tileRangeFor(limites, 13)
    const teselas = 2 ** rango.zoom

    expect(mercatorXToLng(rango.minX / teselas)).toBeLessThanOrEqual(limites.west)
    expect(mercatorXToLng((rango.maxX + 1) / teselas)).toBeGreaterThanOrEqual(limites.east)
    expect(mercatorYToLat(rango.minY / teselas)).toBeGreaterThanOrEqual(limites.north)
    expect(mercatorYToLat((rango.maxY + 1) / teselas)).toBeLessThanOrEqual(limites.south)
  })

  it("un área pequeña son una o dos teselas, no una pantalla entera", () => {
    const rango = tileRangeFor(alrededorDeMedellin(0.002), 13)
    expect(rango.tilesX * rango.tilesY).toBeLessThanOrEqual(4)
  })

  it("el mosaico mide lo que suman sus teselas", () => {
    const rango = tileRangeFor(alrededorDeMedellin(0.05), 13)
    expect(rango.cols).toBe(rango.tilesX * TILE_SIZE)
    expect(rango.rows).toBe(rango.tilesY * TILE_SIZE)
  })

  it("baja de nivel antes que pedir cien teselas", () => {
    // Es el freno que le faltaba a la versión anterior: lo que no tiene tope
    // acaba tumbando el navegador.
    const enorme = alrededorDeMedellin(3)
    const rango = tileRangeFor(enorme, DEM_MAX_ZOOM)
    expect(rango.tilesX * rango.tilesY).toBeLessThanOrEqual(MAX_TILES)
    expect(rango.zoom).toBeLessThan(DEM_MAX_ZOOM)
  })

  it("y el tope manda incluso por debajo del zoom mínimo", () => {
    // El reparto es a propósito: aquí se cuida la memoria; que el resultado
    // signifique algo lo cuida `slopeUnavailableReason`, que ni siquiera deja
    // dibujar tan lejos. Si las dos comprobaciones vivieran juntas, pedir el
    // mundo entero devolvería cien teselas con tal de no bajar del nivel 10.
    const rango = tileRangeFor({ west: -180, east: 180, south: -80, north: 80 }, DEM_MAX_ZOOM)
    expect(rango.tilesX * rango.tilesY).toBeLessThanOrEqual(MAX_TILES)
    expect(rango.zoom).toBeLessThan(DEM_MIN_ZOOM)
  })

  it("no pide una columna de más cuando el borde cae justo en la línea", () => {
    // Con el rectángulo terminando exactamente en el límite entre dos teselas,
    // redondear hacia arriba pediría una columna entera que no se ve.
    const teselas = 2 ** 13
    const limites = {
      west: mercatorXToLng(100 / teselas),
      east: mercatorXToLng(102 / teselas),
      north: mercatorYToLat(200 / teselas),
      south: mercatorYToLat(201 / teselas),
    }
    const rango = tileRangeFor(limites, 13)
    expect(rango.tilesX).toBe(2)
    expect(rango.tilesY).toBe(1)
  })
})

describe("mosaicCornersOf", () => {
  it("devuelve las esquinas en el orden que espera MapLibre", () => {
    // Arriba-izquierda, arriba-derecha, abajo-derecha, abajo-izquierda. Con otro
    // orden la imagen sale volteada y nadie avisa.
    const esquinas = mosaicCornersOf(tileRangeFor(alrededorDeMedellin(0.05), 13))
    const [ai, ad, bd, bi] = esquinas

    expect(esquinas).toHaveLength(4)
    expect(ai[0]).toBeLessThan(ad[0]) // el oeste a la izquierda
    expect(ai[1]).toBeGreaterThan(bi[1]) // el norte arriba
    expect(ad[0]).toBe(bd[0])
    expect(bd[1]).toBe(bi[1])
  })

  it("son las esquinas de las teselas, no las del rectángulo pedido", () => {
    // El mosaico siempre desborda lo que se ve. Colocarlo por el rectángulo
    // pedido lo dejaría desplazado media tesela.
    const limites = alrededorDeMedellin(0.05)
    const [ai] = mosaicCornersOf(tileRangeFor(limites, 13))
    expect(ai[0]).toBeLessThanOrEqual(limites.west)
    expect(ai[1]).toBeGreaterThanOrEqual(limites.north)
  })
})

describe("tilesOf", () => {
  it("una por cada hueco del mosaico, sin repetir sitio", () => {
    const rango = tileRangeFor(alrededorDeMedellin(0.05), 13)
    const teselas = tilesOf(rango)

    expect(teselas).toHaveLength(rango.tilesX * rango.tilesY)
    const sitios = new Set(teselas.map((t) => `${t.colOffset},${t.rowOffset}`))
    expect(sitios.size).toBe(teselas.length)
  })

  it("la primera va a la esquina de arriba a la izquierda", () => {
    const rango = tileRangeFor(alrededorDeMedellin(0.05), 13)
    const [primera] = tilesOf(rango)
    expect(primera).toMatchObject({ x: rango.minX, y: rango.minY, colOffset: 0, rowOffset: 0 })
  })
})

describe("tileUrl", () => {
  it("rellena la plantilla del proveedor", () => {
    expect(tileUrl("https://ejemplo/{z}/{x}/{y}.png", { z: 13, x: 1, y: 2 })).toBe(
      "https://ejemplo/13/1/2.png",
    )
  })
})

describe("elevationFromPixel", () => {
  it("decodifica el formato terrarium", () => {
    // 32768 es el cero: el formato guarda alturas negativas desplazándolas.
    expect(elevationFromPixel(128, 0, 0)).toBe(0)
    expect(elevationFromPixel(128, 100, 0)).toBe(100)
    expect(elevationFromPixel(127, 156, 0)).toBe(-100)
  })

  it("el canal azul son los decímetros y pico", () => {
    // Sin él, un terreno de 1500,5 m saldría de 1500 y las pendientes suaves se
    // volverían escalones.
    expect(elevationFromPixel(128, 0, 128)).toBeCloseTo(0.5, 9)
  })
})

describe("pasteTile y blankTile", () => {
  /** Una tesela cuyos píxeles codifican una altura conocida por fila. */
  const teselaDePrueba = () => {
    const rgba = new Uint8ClampedArray(TILE_SIZE * TILE_SIZE * 4)
    for (let fila = 0; fila < TILE_SIZE; fila++) {
      for (let col = 0; col < TILE_SIZE; col++) {
        const i = (fila * TILE_SIZE + col) * 4
        rgba[i] = 128 // 0 m de base
        rgba[i + 1] = fila // sube un metro por fila
        rgba[i + 2] = 0
        rgba[i + 3] = 255
      }
    }
    return rgba
  }

  it("pone cada fila de la tesela en su sitio del mosaico", () => {
    const cols = TILE_SIZE * 2
    const mosaico = new Float32Array(cols * TILE_SIZE)
    pasteTile(mosaico, cols, teselaDePrueba(), TILE_SIZE, 0)

    // La columna de la izquierda no se tocó; la de la derecha tiene la tesela.
    expect(mosaico[0]).toBe(0)
    expect(mosaico[TILE_SIZE]).toBe(0)
    expect(mosaico[5 * cols + TILE_SIZE]).toBe(5)
    expect(mosaico[5 * cols + TILE_SIZE + 200]).toBe(5)
  })

  it("una tesela que no llegó queda sin dato, no a cero", () => {
    // Cero es una altura. Un cuadrado a cero saldría rodeado de acantilados
    // perfectos y se leería como un dato.
    const cols = TILE_SIZE
    const mosaico = new Float32Array(cols * TILE_SIZE).fill(1500)
    blankTile(mosaico, cols, 0, 0)
    expect(Number.isNaN(mosaico[0])).toBe(true)
    expect(Number.isNaN(mosaico[cols * TILE_SIZE - 1])).toBe(true)
  })
})

describe("acotamiento 3D (radius3DForZoom y boundsAroundCenter)", () => {
  it("asigna radios decrecientes según el nivel de zoom para no saturar", () => {
    expect(radius3DForZoom(10)).toBe(6000)
    expect(radius3DForZoom(11)).toBe(4500)
    expect(radius3DForZoom(12)).toBe(3500)
    expect(radius3DForZoom(13)).toBe(2500)
    expect(radius3DForZoom(15)).toBe(2000)
  })

  it("calcula un recuadro simétrico alrededor del centro", () => {
    const centro = { lng: -75.5, lat: 6.2 }
    const bounds = boundsAroundCenter(centro, 2000)

    expect(bounds.west).toBeLessThan(centro.lng)
    expect(bounds.east).toBeGreaterThan(centro.lng)
    expect(bounds.south).toBeLessThan(centro.lat)
    expect(bounds.north).toBeGreaterThan(centro.lat)

    // El centro del recuadro coincide con el punto pedido
    expect((bounds.west + bounds.east) / 2).toBeCloseTo(centro.lng, 6)
    expect((bounds.south + bounds.north) / 2).toBeCloseTo(centro.lat, 6)
  })
})
