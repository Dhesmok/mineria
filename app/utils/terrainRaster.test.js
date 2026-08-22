import {
  ASPECT_LEGEND,
  ASPECT_MIN_SLOPE,
  aspectColorFor,
  derivativeGridFrom,
  derivativePixels,
  resolutionNote,
  SLOPE_ALPHA,
  SLOPE_LEGEND,
  SLOPE_MIN_ZOOM,
  slopeColorFor,
  slopeGridFrom,
  slopePixels,
  slopeUnavailableReason,
} from "./terrainRaster"

/** Una rejilla que sube `porCelda` metros hacia el este. */
const rampaEste = (cols, rows, porCelda) => {
  const alturas = new Float32Array(cols * rows)
  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < cols; col++) alturas[row * cols + col] = col * porCelda
  }
  return alturas
}

describe("slopeGridFrom", () => {
  it("un plano que sube un metro por metro da 45° en todas partes", () => {
    const espaciado = 30
    const grid = slopeGridFrom(rampaEste(6, 5, espaciado), 6, 5, espaciado)
    grid.forEach((valor) => expect(valor).toBeCloseTo(45, 6))
  })

  it("terreno plano da cero", () => {
    const grid = slopeGridFrom(new Float32Array(20).fill(1500), 5, 4, 30)
    grid.forEach((valor) => expect(valor).toBe(0))
  })

  it("en los bordes extrapola, y no deja una franja falsa de terreno suave", () => {
    // Repetir la celda del borde deja el gradiente a la mitad en el anillo
    // exterior: en una ladera uniforme de 45°, el borde saldría de 26°, y con
    // una rejilla de 8 px eso es una franja falsa rodeando toda la pantalla.
    const grid = slopeGridFrom(rampaEste(4, 4, 30), 4, 4, 30)
    expect(grid.every((valor) => Number.isFinite(valor))).toBe(true)
    expect(grid[0]).toBeCloseTo(45, 6)
    expect(grid[grid.length - 1]).toBeCloseTo(45, 6)
  })

  it("donde falta una altura, no inventa un número", () => {
    const alturas = rampaEste(4, 4, 30)
    alturas[5] = NaN
    const grid = slopeGridFrom(alturas, 4, 4, 30)
    expect(Number.isNaN(grid[0])).toBe(true)
  })
})

describe("slopeColorFor", () => {
  it("cada tramo tiene su color", () => {
    expect(slopeColorFor(2)).toEqual([...SLOPE_LEGEND[0].color, SLOPE_ALPHA])
    expect(slopeColorFor(10)).toEqual([...SLOPE_LEGEND[1].color, SLOPE_ALPHA])
    expect(slopeColorFor(20)).toEqual([...SLOPE_LEGEND[2].color, SLOPE_ALPHA])
    expect(slopeColorFor(40)).toEqual([...SLOPE_LEGEND[3].color, SLOPE_ALPHA])
    expect(slopeColorFor(70)).toEqual([...SLOPE_LEGEND[4].color, SLOPE_ALPHA])
  })

  it("los cortes van al tramo de arriba", () => {
    // 5° exactos son «suave», no «plano»: si no, el límite pertenecería a los
    // dos tramos según de dónde se mire.
    expect(slopeColorFor(5)).toEqual([...SLOPE_LEGEND[1].color, SLOPE_ALPHA])
  })

  it("sin dato, transparente", () => {
    expect(slopeColorFor(NaN)).toEqual([0, 0, 0, 0])
    expect(slopeColorFor(null)).toEqual([0, 0, 0, 0])
  })

  it("deja ver el mapa por debajo", () => {
    expect(SLOPE_ALPHA).toBeLessThan(255)
    expect(SLOPE_ALPHA).toBeGreaterThan(80)
  })
})

describe("slopePixels", () => {
  it("cuatro bytes por celda, en orden", () => {
    const pixeles = slopePixels(new Float32Array([2, NaN]))
    expect(pixeles).toHaveLength(8)
    expect([...pixeles.slice(0, 4)]).toEqual([...SLOPE_LEGEND[0].color, SLOPE_ALPHA])
    expect([...pixeles.slice(4)]).toEqual([0, 0, 0, 0])
  })
})

describe("cuándo no se dibuja", () => {
  const bien = { zoom: 15, pitch: 0 }

  it("con el mapa plano y cerca, sí se dibuja", () => {
    expect(slopeUnavailableReason(bien)).toBeNull()
  })

  it("con la cámara inclinada, no, y dice por qué", () => {
    // Inclinada se ve hasta el horizonte, y cubrir eso con teselas obligaría a
    // bajar tanto el nivel que saldrían celdas de kilómetros.
    const motivo = slopeUnavailableReason({ ...bien, pitch: 45 })
    expect(motivo).toMatch(/mapa plano/)
  })

  it("y por debajo del zoom mínimo tampoco", () => {
    const motivo = slopeUnavailableReason({ ...bien, zoom: SLOPE_MIN_ZOOM - 1 })
    expect(motivo).toMatch(/Acerca el mapa/)
  })

  it("ya no depende de la escala de la pantalla", () => {
    // Es el cambio de fondo: la rejilla es la del modelo, así que estar más lejos
    // o más cerca dentro del rango ya no cambia si el dato vale o no. Antes, con
    // rejilla de pantalla, sí: la misma ladera daba números distintos.
    expect(slopeUnavailableReason({ zoom: SLOPE_MIN_ZOOM, pitch: 0 })).toBeNull()
    expect(slopeUnavailableReason({ zoom: 18, pitch: 0 })).toBeNull()
  })
})

describe("orientación", () => {
  it("una rampa hacia el este da laderas que miran al oeste", () => {
    const { aspect } = derivativeGridFrom(rampaEste(5, 5, 30), 5, 5, 30)
    aspect.forEach((valor) => expect(valor).toBeCloseTo(270, 5))
  })

  it("en terreno casi llano no dice nada", () => {
    // El azimut de una llanura lo decide el ruido del modelo, no el relieve:
    // dos celdas vecinas saldrían «norte» y «sur» por medio metro. Pintar eso
    // sería un confeti que parece información.
    const casiLlano = rampaEste(5, 5, 0.2)
    const { slope, aspect } = derivativeGridFrom(casiLlano, 5, 5, 30)
    expect(slope[12]).toBeLessThan(ASPECT_MIN_SLOPE)
    expect(Number.isNaN(aspect[12])).toBe(true)
  })

  it("la rampa de color cierra el círculo", () => {
    // El norte y el noroeste son vecinos: una escala que no vuelva al color de
    // partida deja un corte brusco justo en el norte, que se lee como un límite
    // de terreno donde no lo hay.
    expect(ASPECT_LEGEND[0].color).toEqual(ASPECT_LEGEND[ASPECT_LEGEND.length - 1].color)
    expect(aspectColorFor(1)).toEqual(aspectColorFor(359))
  })

  it("reparte los ocho rumbos", () => {
    expect(aspectColorFor(90)).toEqual([...ASPECT_LEGEND[2].color, 150])
    expect(aspectColorFor(180)).toEqual([...ASPECT_LEGEND[4].color, 150])
    expect(aspectColorFor(270)).toEqual([...ASPECT_LEGEND[6].color, 150])
  })

  it("sin dato, transparente", () => {
    expect(aspectColorFor(NaN)).toEqual([0, 0, 0, 0])
  })
})

describe("resolutionNote", () => {
  it("distingue interpolar de resumir", () => {
    // Es la distinción que motivó la ventana de información. Con celdas más
    // finas que el modelo, lo de en medio es invento suave; con celdas más
    // gruesas, cada una junta varias medidas. Decir «celdas 19 m» a secas se lee
    // como «este mapa tiene 19 m de detalle», que es lo contrario.
    expect(resolutionNote(19).interpolated).toBe(true)
    expect(resolutionNote(76).interpolated).toBe(false)
  })

  it("la ventana de medida son dos celdas, no una", () => {
    // El número que de verdad importa al leer una pendiente: el método mira las
    // vecinas, así que el valor de una celda promedia dos anchos de terreno.
    expect(resolutionNote(19).window).toBe(38)
    expect(resolutionNote(152).window).toBe(304)
  })

  it("redondea, porque nadie lee 19,04 m", () => {
    expect(resolutionNote(19.04).cell).toBe(19)
  })

  it("sin celda no hay nota que dar", () => {
    expect(resolutionNote(null)).toBeNull()
    expect(resolutionNote(0)).toBeNull()
    expect(resolutionNote(NaN)).toBeNull()
  })
})

describe("derivativePixels", () => {
  /** El color de una celda del resultado. */
  const colorEn = (pixeles, cols, col, fila) => {
    const p = (fila * cols + col) * 4
    return [...pixeles.slice(p, p + 4)]
  }

  /** Un terreno con relieve de verdad, para no probar sobre una rampa perfecta. */
  const relieve = (cols, rows) => {
    const alturas = new Float32Array(cols * rows)
    for (let fila = 0; fila < rows; fila++) {
      for (let col = 0; col < cols; col++) {
        alturas[fila * cols + col] =
          1500 + 260 * Math.sin(col / 4.3) + 190 * Math.cos(fila / 2.9) + 40 * Math.sin(col / 1.7 + fila)
      }
    }
    return alturas
  }

  it("da exactamente el mismo color que calcular los grados", () => {
    // **Esta es la prueba que sostiene todo el atajo.** La pasada rápida no llama
    // a `atan`: compara la magnitud del gradiente contra las tangentes de los
    // cortes de la leyenda. Eso no es una aproximación —la tangente crece
    // siempre—, pero «no es una aproximación» es justo el tipo de afirmación que
    // hay que comprobar y no creerse. Se compara celda a celda contra la vía
    // larga, la que sí calcula grados.
    const cols = 40
    const rows = 30
    const espaciado = 19
    const alturas = relieve(cols, rows)

    const { slope, aspect } = derivativeGridFrom(alturas, cols, rows, espaciado)
    const pendiente = derivativePixels(alturas, cols, rows, espaciado, "slope")
    const orientacion = derivativePixels(alturas, cols, rows, espaciado, "aspect")

    // Solo el interior: en el borde la vía larga extrapola y la rápida se pega a
    // la celda de al lado, a propósito y por motivos distintos.
    for (let fila = 1; fila < rows - 1; fila++) {
      for (let col = 1; col < cols - 1; col++) {
        const i = fila * cols + col
        expect(colorEn(pendiente, cols, col, fila)).toEqual(slopeColorFor(slope[i]))
        expect(colorEn(orientacion, cols, col, fila)).toEqual(aspectColorFor(aspect[i]))
      }
    }
  })

  it("acierta el tramo justo en el corte de la leyenda", () => {
    // Los bordes de tramo son donde una comparación mal puesta se nota, y donde
    // no se notaría nunca mirando el mapa.
    const espaciado = 30
    const enGrados = (grados) => {
      const porCelda = Math.tan((grados * Math.PI) / 180) * espaciado
      return rampaEste(5, 5, porCelda)
    }

    // 14,9° tiene que caer en el tramo «suave» y 15,1° en el de «moderada».
    expect(colorEn(derivativePixels(enGrados(14.9), 5, 5, espaciado), 5, 2, 2)).toEqual([
      ...SLOPE_LEGEND[1].color,
      SLOPE_ALPHA,
    ])
    expect(colorEn(derivativePixels(enGrados(15.1), 5, 5, espaciado), 5, 2, 2)).toEqual([
      ...SLOPE_LEGEND[2].color,
      SLOPE_ALPHA,
    ])
  })

  it("una celda sin dato no contagia más allá de sus vecinas", () => {
    // Una tesela que no llegó deja NaN. Lo que no puede pasar es que un hueco
    // apague media capa: solo las ocho celdas que lo tocan quedan transparentes.
    const cols = 11
    const rows = 11
    const alturas = relieve(cols, rows)
    alturas[5 * cols + 5] = NaN

    const pixeles = derivativePixels(alturas, cols, rows, 19, "slope")
    // Las ocho que lo tocan, transparentes.
    expect(colorEn(pixeles, cols, 4, 4)[3]).toBe(0)
    expect(colorEn(pixeles, cols, 5, 4)[3]).toBe(0)
    // La novena de al lado, pintada.
    expect(colorEn(pixeles, cols, 3, 5)[3]).toBe(SLOPE_ALPHA)
    // Y la celda del hueco **sí se pinta**, que sorprende hasta que se mira el
    // método: Horn mira las ocho de alrededor y nunca la del medio. La pendiente
    // de un punto la deciden sus vecinas, así que un hueco de una sola celda se
    // rellena solo. Es lo mismo que hace un SIG y no hay que arreglarlo.
    expect(colorEn(pixeles, cols, 5, 5)[3]).toBe(SLOPE_ALPHA)
  })

  it("el borde se pinta, no se deja en blanco", () => {
    // Un marco transparente alrededor de la capa se lee como una raya y no
    // significa nada.
    const cols = 12
    const rows = 9
    const pixeles = derivativePixels(relieve(cols, rows), cols, rows, 19, "slope")
    expect(colorEn(pixeles, cols, 0, 0)[3]).toBe(SLOPE_ALPHA)
    expect(colorEn(pixeles, cols, cols - 1, rows - 1)[3]).toBe(SLOPE_ALPHA)
  })

  it("en llano la orientación no pinta nada y la pendiente sí", () => {
    const llano = new Float32Array(64).fill(1500)
    const orientacion = derivativePixels(llano, 8, 8, 19, "aspect")
    const pendiente = derivativePixels(llano, 8, 8, 19, "slope")
    expect(colorEn(orientacion, 8, 4, 4)[3]).toBe(0)
    expect(colorEn(pendiente, 8, 4, 4)).toEqual([...SLOPE_LEGEND[0].color, SLOPE_ALPHA])
  })

  it("una rejilla demasiado pequeña no revienta", () => {
    expect(derivativePixels(new Float32Array(4), 2, 2, 19)).toHaveLength(16)
    expect(derivativePixels(relieve(5, 5), 5, 5, 0)).toHaveLength(100)
  })
})
