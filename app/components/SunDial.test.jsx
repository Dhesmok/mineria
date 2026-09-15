import React from "react"
import { render, screen, fireEvent } from "@testing-library/react"
import SunDial, { ALT_MIN, ALT_MAX, puntoEnCarta } from "./SunDial"

// El disco traduce la posición del puntero a un par de ángulos usando su caja, y en
// JSDOM esa caja mide cero: se le da una de 100×100 en el origen, así que el centro cae
// en (50, 50), el horizonte a 42 px de él y las cuentas se leen a simple vista.
function conCaja() {
  jest.spyOn(HTMLDivElement.prototype, "getBoundingClientRect").mockReturnValue({
    left: 0,
    top: 0,
    width: 100,
    height: 100,
    right: 100,
    bottom: 100,
    x: 0,
    y: 0,
    toJSON: () => {},
  })
}

const AZIMUT = "Girar posición del sol para ver sombras dinámicas"
const ALTURA = "Altura del sol sobre el horizonte"

// JSDOM no implementa `PointerEvent`, así que `fireEvent.pointerDown(el, {clientX})`
// entrega un evento sin coordenadas y el disco recibiría NaN. Los eventos se arman a
// mano con sus coordenadas puestas encima, que es lo que trae el navegador de verdad.
function puntero(destino, tipo, clientX, clientY) {
  const ev = new Event(tipo, { bubbles: true, cancelable: true })
  Object.assign(ev, { clientX, clientY, pointerId: 1, isPrimary: true })
  destino.dispatchEvent(ev)
}

function disco() {
  return document.querySelector("[class*='bm3d-bezel']")
}

function pintar(props = {}) {
  const onChange = jest.fn()
  render(<SunDial azimuth={0} altitude={45} onChange={onChange} azimuthLabel={AZIMUT} altitudeLabel={ALTURA} {...props} />)
  return onChange
}

describe("SunDial", () => {
  afterEach(() => jest.restoreAllMocks())

  it("expone los dos ángulos como controles de rango para teclado y lector", () => {
    const onChange = pintar({ azimuth: 100, altitude: 30 })

    fireEvent.change(screen.getByLabelText(AZIMUT), { target: { value: "225" } })
    expect(onChange).toHaveBeenLastCalledWith(225, 30)

    fireEvent.change(screen.getByLabelText(ALTURA), { target: { value: "70" } })
    expect(onChange).toHaveBeenLastCalledWith(100, 70)
  })

  it("cuenta el azimut como la brújula: 0° arriba y creciendo hacia la derecha", () => {
    conCaja()
    const onChange = pintar()

    puntero(disco(), "pointerdown", 90, 50) // a la derecha
    expect(onChange).toHaveBeenLastCalledWith(90, expect.any(Number))

    puntero(disco(), "pointerdown", 50, 90) // abajo
    expect(onChange).toHaveBeenLastCalledWith(180, expect.any(Number))

    puntero(disco(), "pointerdown", 10, 50) // a la izquierda
    expect(onChange).toHaveBeenLastCalledWith(270, expect.any(Number))

    puntero(disco(), "pointerdown", 50, 10) // arriba
    expect(onChange).toHaveBeenLastCalledWith(0, expect.any(Number))
  })

  it("lee la altura en la distancia al centro: el borde es el horizonte y el centro el cenit", () => {
    conCaja()
    const onChange = pintar()

    // En el centro: sol en la vertical, acotado al máximo útil
    puntero(disco(), "pointerdown", 50, 50)
    expect(onChange).toHaveBeenLastCalledWith(expect.any(Number), ALT_MAX)

    // Fuera del disco: sol en el horizonte, acotado al mínimo útil
    puntero(disco(), "pointerdown", 50, 200)
    expect(onChange).toHaveBeenLastCalledWith(180, ALT_MIN)

    // A media distancia del radio útil (42 px): 45° de altura
    puntero(disco(), "pointerdown", 50, 50 - 21)
    expect(onChange).toHaveBeenLastCalledWith(0, 45)
  })

  it("conserva el azimut cuando el puntero cae justo en el centro", () => {
    // En el centro no hay dirección que leer: inventarse una haría saltar el azimut a
    // cero al subir el sol del todo, y con él las sombras de la escena.
    conCaja()
    const onChange = pintar({ azimuth: 215, altitude: 20 })

    puntero(disco(), "pointerdown", 50, 50)
    expect(onChange).toHaveBeenLastCalledWith(215, ALT_MAX)
  })

  it("sigue girando aunque el dedo salga del aro, y se suelta en la ventana", () => {
    // Trampa nº 17: el disco mide 66 px, así que el puntero se sale al primer giro. Si
    // el «soltar» colgara del propio aro, el mando se quedaría pegado al puntero.
    conCaja()
    const onChange = pintar()

    puntero(disco(), "pointerdown", 50, 10)
    onChange.mockClear()

    puntero(window, "pointermove", 900, 50)
    expect(onChange).toHaveBeenLastCalledWith(90, ALT_MIN)

    puntero(window, "pointerup", 900, 50)
    onChange.mockClear()
    puntero(window, "pointermove", 50, 900)
    expect(onChange).not.toHaveBeenCalled()
  })

  it("deja de girar si el sistema cancela el gesto", () => {
    conCaja()
    const onChange = pintar()

    puntero(disco(), "pointerdown", 50, 10)
    puntero(window, "pointercancel", 50, 10)
    onChange.mockClear()

    puntero(window, "pointermove", 900, 50)
    expect(onChange).not.toHaveBeenCalled()
  })

  it("dibuja el sol donde lo pone la carta: el cenit en el centro y el horizonte en el borde", () => {
    expect(puntoEnCarta(0, 90)).toMatchObject({ x: 50, y: 50 })

    const horizonteNorte = puntoEnCarta(0, 0, 42)
    expect(horizonteNorte.x).toBeCloseTo(50)
    expect(horizonteNorte.y).toBeCloseTo(8)

    const horizonteEste = puntoEnCarta(90, 0, 42)
    expect(horizonteEste.x).toBeCloseTo(92)
    expect(horizonteEste.y).toBeCloseTo(50)
  })
})
