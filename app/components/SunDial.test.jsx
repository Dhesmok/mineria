import React from "react"
import { render, screen, fireEvent } from "@testing-library/react"
import SunDial from "./SunDial"

// El dial traduce la posición del puntero a un ángulo con la caja del elemento, y en
// JSDOM esa caja mide cero: se le da una de 100×100 centrada en el origen, así que el
// centro del dial cae en (50, 50) y las cuentas de abajo se leen a simple vista.
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

const ETIQUETA = "Girar posición del sol para ver sombras dinámicas"

// JSDOM no implementa `PointerEvent`, así que `fireEvent.pointerDown(el, {clientX})`
// entrega un evento sin coordenadas y el dial recibiría NaN. Los eventos se arman a
// mano con sus coordenadas puestas encima, que es lo que trae el navegador de verdad.
function puntero(destino, tipo, clientX, clientY) {
  const ev = new Event(tipo, { bubbles: true, cancelable: true })
  Object.assign(ev, { clientX, clientY, pointerId: 1, isPrimary: true })
  destino.dispatchEvent(ev)
}

function dial() {
  // El aro es el único elemento con el bisel; el input va oculto al lado.
  return document.querySelector("[class*='bm3d-bezel']")
}

describe("SunDial", () => {
  afterEach(() => jest.restoreAllMocks())

  it("expone un control de rango para teclado y lector de pantalla", () => {
    const onChange = jest.fn()
    render(<SunDial value={0} onChange={onChange} label={ETIQUETA} />)

    const rango = screen.getByLabelText(ETIQUETA)
    expect(rango).toHaveAttribute("type", "range")

    fireEvent.change(rango, { target: { value: "225" } })
    expect(onChange).toHaveBeenCalledWith(225)
  })

  it("cuenta los grados como la brújula: 0° arriba y creciendo hacia la derecha", () => {
    conCaja()
    const onChange = jest.fn()
    render(<SunDial value={0} onChange={onChange} label={ETIQUETA} />)

    puntero(dial(), "pointerdown", 90, 50) // a la derecha
    expect(onChange).toHaveBeenLastCalledWith(90)

    puntero(dial(), "pointerdown", 50, 90) // abajo
    expect(onChange).toHaveBeenLastCalledWith(180)

    puntero(dial(), "pointerdown", 10, 50) // a la izquierda
    expect(onChange).toHaveBeenLastCalledWith(270)

    puntero(dial(), "pointerdown", 50, 10) // arriba
    expect(onChange).toHaveBeenLastCalledWith(0)
  })

  it("redondea al paso pedido", () => {
    conCaja()
    const onChange = jest.fn()
    render(<SunDial value={0} onChange={onChange} step={15} label={ETIQUETA} />)

    // 22° reales: con paso de 15 tiene que caer en 15, no quedarse en bruto
    puntero(dial(), "pointerdown", 50 + 40 * Math.sin(0.384), 50 - 40 * Math.cos(0.384))
    expect(onChange).toHaveBeenLastCalledWith(15)
  })

  it("sigue girando aunque el dedo salga del aro, y se suelta en la ventana", () => {
    // Trampa nº 17: el dial mide 54 px, así que el puntero se sale a la primera vuelta.
    // Si el «soltar» colgara del propio aro, el mando se quedaría pegado al puntero.
    conCaja()
    const onChange = jest.fn()
    render(<SunDial value={0} onChange={onChange} label={ETIQUETA} />)

    puntero(dial(), "pointerdown", 50, 10)
    onChange.mockClear()

    // Muy lejos del aro, pero exactamente a la derecha del centro
    puntero(window, "pointermove", 900, 50)
    expect(onChange).toHaveBeenLastCalledWith(90)

    puntero(window, "pointerup", 900, 50)
    onChange.mockClear()
    puntero(window, "pointermove", 50, 900)
    expect(onChange).not.toHaveBeenCalled()
  })

  it("deja de girar si el sistema cancela el gesto", () => {
    conCaja()
    const onChange = jest.fn()
    render(<SunDial value={0} onChange={onChange} label={ETIQUETA} />)

    puntero(dial(), "pointerdown", 50, 10)
    puntero(window, "pointercancel", 50, 10)
    onChange.mockClear()

    puntero(window, "pointermove", 900, 50)
    expect(onChange).not.toHaveBeenCalled()
  })
})
