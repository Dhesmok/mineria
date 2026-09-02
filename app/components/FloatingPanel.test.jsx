import { correccionAPantalla } from "./FloatingPanel"

/**
 * Lo que se prueba aquí es lo único que de verdad importa de esta corrección:
 * **que converja**.
 *
 * El visor no abría en el teléfono. Reventaba con «Maximum update depth
 * exceeded» dentro de este `setPos`, y solo en el móvil: la pantalla de un
 * teléfono tiene densidad fraccionaria, el navegador redondea la posición usada
 * a píxeles físicos, y la corrección volvía a salir distinta de cero para
 * siempre. En un escritorio con densidad entera el resto sale cero y no se veía.
 *
 * Por eso las pruebas no comprueban un número: **simulan el bucle** —corregir,
 * mover, volver a medir— con el redondeo del teléfono metido dentro, y exigen
 * que pare.
 */

const MARGEN = 8

/**
 * Un panel al que se le puede pedir que se mueva, con el redondeo de una
 * pantalla real: la posición que se pide no es la que queda.
 *
 * @param {number} densidad píxeles físicos por píxel CSS (2,75 en muchos Android)
 */
const panel = ({ top, left, width, height, densidad }) => {
  const alPixelFisico = (v) => Math.round(v * densidad) / densidad
  let caja = { top, left, width, height }
  return {
    medir: () => ({
      top: alPixelFisico(caja.top),
      left: alPixelFisico(caja.left),
      right: alPixelFisico(caja.left + caja.width),
      bottom: alPixelFisico(caja.top + caja.height),
      width: caja.width,
      height: caja.height,
    }),
    mover: ({ x, y }) => {
      caja = { ...caja, top: caja.top + y, left: caja.left + x }
    },
  }
}

/** Corrige hasta que no haya nada que corregir, o se rinde. */
const corregirHastaQuePare = (elPanel, ventana, tope = 20) => {
  for (let vuelta = 0; vuelta < tope; vuelta += 1) {
    const mover = correccionAPantalla(elPanel.medir(), ventana)
    if (!mover.x && !mover.y) return { vueltas: vuelta, caja: elPanel.medir() }
    elPanel.mover(mover)
  }
  return { vueltas: Infinity, caja: elPanel.medir() }
}

describe("correccionAPantalla", () => {
  const ventana = { width: 390, height: 720 }

  test("un panel que ya cabe no se mueve", () => {
    const caja = { top: 100, left: 100, right: 300, bottom: 400, width: 200, height: 300 }
    expect(correccionAPantalla(caja, ventana)).toEqual({ x: 0, y: 0 })
  })

  test("lo mete cuando se sale por la derecha y por abajo", () => {
    const caja = { top: 600, left: 300, right: 500, bottom: 900, width: 200, height: 300 }
    const mover = correccionAPantalla(caja, ventana)
    expect(caja.right + mover.x).toBeLessThanOrEqual(ventana.width - MARGEN)
    expect(caja.top + mover.y).toBeGreaterThanOrEqual(MARGEN)
  })

  test("si no cabe entero, lo que queda dentro es la barra de arriba", () => {
    // Un panel más alto que la pantalla: se sacrifica el borde de abajo, no el
    // de arriba, que es por donde se agarra y se cierra.
    const caja = { top: 300, left: 20, right: 220, bottom: 1300, width: 200, height: 1000 }
    const mover = correccionAPantalla(caja, ventana)
    expect(caja.top + mover.y).toBe(MARGEN)
  })

  describe("converge", () => {
    // 2,75 y 3 son densidades de Android; 2 es un iPhone; 1 un escritorio.
    // 1,5 y 1,25 son portátiles con escalado de Windows, que es donde el resto
    // de redondeo es más grande.
    test.each([1, 1.25, 1.5, 2, 2.625, 2.75, 3])("con densidad de pantalla %s", (densidad) => {
      const elPanel = panel({ top: 640, left: 250, width: 300, height: 500, densidad })
      const { vueltas, caja } = corregirHastaQuePare(elPanel, ventana)

      // Que pare es lo que evita el «Maximum update depth exceeded».
      expect(vueltas).toBeLessThan(20)
      // Y que además haya hecho su trabajo.
      expect(caja.right).toBeLessThanOrEqual(ventana.width - MARGEN + 1)
      expect(caja.top).toBeGreaterThanOrEqual(MARGEN - 1)
    })

    test("desde una posición con decimales, que es lo que da un rect real", () => {
      const elPanel = panel({ top: 703.37, left: 261.91, width: 300, height: 500, densidad: 2.75 })
      expect(corregirHastaQuePare(elPanel, ventana).vueltas).toBeLessThan(20)
    })

    test("y con la pantalla más pequeña que el panel en las dos direcciones", () => {
      const elPanel = panel({ top: 50, left: 50, width: 500, height: 900, densidad: 2.75 })
      expect(corregirHastaQuePare(elPanel, { width: 320, height: 568 }).vueltas).toBeLessThan(20)
    })
  })

  test("una corrección de menos de un píxel no se pide", () => {
    // Es el resto que deja el redondeo a píxeles físicos, y pedirlo era lo que
    // no dejaba parar al bucle.
    const caja = { top: 100, left: 100, right: 382.4, bottom: 400, width: 282.4, height: 300 }
    expect(correccionAPantalla(caja, { width: 390, height: 720 })).toEqual({ x: 0, y: 0 })
  })
})
