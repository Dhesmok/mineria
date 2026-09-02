import { whenSized } from "./whenSized"

/**
 * Lo que se comprueba aquí es exactamente lo que tumbaba el visor en el
 * teléfono: que nadie construya un mapa sobre un contenedor de cero píxeles.
 *
 * El error que salía —«Cannot read properties of undefined (reading '0')» dentro
 * de `unproject`— venía de que MapLibre no calcula su matriz de proyección sin
 * tamaño y la barra de escala la usa igualmente al engancharse. Ver la cabecera
 * de `whenSized.js`.
 */

/** Un elemento de mentira al que se le puede cambiar el tamaño a mano. */
const elemento = (width, height) => ({ clientWidth: width, clientHeight: height })

/** Un `ResizeObserver` de mentira que deja disparar el aviso cuando queramos. */
const observadorFalso = () => {
  const estado = { observando: [], desconectado: false, disparar: null }
  global.ResizeObserver = class {
    constructor(callback) {
      estado.disparar = callback
    }
    observe(el) {
      estado.observando.push(el)
    }
    disconnect() {
      estado.desconectado = true
    }
  }
  return estado
}

const sinResizeObserver = () => {
  delete global.ResizeObserver
}

afterEach(() => {
  delete global.ResizeObserver
})

describe("whenSized", () => {
  test("con tamaño, avisa en el acto y no monta ningún observador", () => {
    const observador = observadorFalso()
    const alListo = jest.fn()

    whenSized(elemento(390, 720), alListo)

    expect(alListo).toHaveBeenCalledTimes(1)
    expect(observador.observando).toEqual([])
  })

  test("sin tamaño, no avisa: es el caso que rompía el arranque", () => {
    observadorFalso()
    const alListo = jest.fn()

    whenSized(elemento(390, 0), alListo)

    expect(alListo).not.toHaveBeenCalled()
  })

  test("ancho cero también cuenta", () => {
    // `_calcMatrices()` de MapLibre pide las dos: `if (this._width && this._height)`.
    observadorFalso()
    const alListo = jest.fn()

    whenSized(elemento(0, 720), alListo)

    expect(alListo).not.toHaveBeenCalled()
  })

  test("espera y avisa cuando el contenedor crece", () => {
    const observador = observadorFalso()
    const alListo = jest.fn()
    const el = elemento(0, 0)

    whenSized(el, alListo)
    expect(alListo).not.toHaveBeenCalled()

    // Sigue sin medir: no se avisa todavía.
    observador.disparar()
    expect(alListo).not.toHaveBeenCalled()

    el.clientWidth = 390
    el.clientHeight = 720
    observador.disparar()
    expect(alListo).toHaveBeenCalledTimes(1)
  })

  test("avisa una sola vez, y deja de observar antes de avisar", () => {
    // El orden importa: quien recibe el aviso construye un mapa que cambia el
    // tamaño del propio elemento, y eso volvería a disparar al observador en
    // mitad de la construcción.
    const observador = observadorFalso()
    const el = elemento(0, 0)
    const alListo = jest.fn(() => {
      expect(observador.desconectado).toBe(true)
    })

    whenSized(el, alListo)
    el.clientWidth = 390
    el.clientHeight = 720
    observador.disparar()
    observador.disparar()

    expect(alListo).toHaveBeenCalledTimes(1)
  })

  test("lo que devuelve deja de esperar", () => {
    const observador = observadorFalso()
    const dejarDeEsperar = whenSized(elemento(0, 0), jest.fn())

    dejarDeEsperar()

    expect(observador.desconectado).toBe(true)
  })

  test("sin ResizeObserver arranca igual, que es mejor que no arrancar", () => {
    sinResizeObserver()
    const alListo = jest.fn()

    whenSized(elemento(0, 0), alListo)

    expect(alListo).toHaveBeenCalledTimes(1)
  })

  test("sin elemento no hace nada y no revienta", () => {
    const alListo = jest.fn()
    expect(() => whenSized(null, alListo)()).not.toThrow()
    expect(alListo).not.toHaveBeenCalled()
  })
})
