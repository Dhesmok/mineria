import React from "react"
import { render, screen, fireEvent } from "@testing-library/react"
import BlockModel3D from "./BlockModel3D"

/**
 * El sol de la escena: de dónde viene y de qué color es.
 *
 * Las dos cosas que se comprueban aquí salieron mal a la vez en la primera versión, y
 * ninguna se veía desde los datos —había luz, había sombra, no fallaba nada—:
 *
 * 1. La luz se teñía de naranja según el azimut, como si girar el sol alrededor del
 *    bloque fuera pasar de la mañana a la tarde. Al comparar dos azimuts no se sabía
 *    si una ladera se veía más clara por su pendiente o por el color que le tocó.
 * 2. El azimut se aplicaba con los ejes cambiados, así que el dial marcaba un norte
 *    que la escena iluminaba desde el este: 90° de desfase.
 *
 * El norte del bloque es -Z y el este es +X. Sale de cómo se muestrea la malla —la
 * primera fila en `maxLat`, la primera columna en `minLng`— y del giro de -90° sobre X
 * que la tumba. Si alguien toca ese muestreo, esta prueba es la que avisa.
 */

const soles = []

jest.mock("three", () => {
  const actualThree = jest.requireActual("three")

  class DirectionalLightEspia extends actualThree.DirectionalLight {
    constructor(...args) {
      super(...args)
      // eslint-disable-next-line no-undef
      global.__solesDelBloque.push(this)
    }
  }

  return {
    ...actualThree,
    DirectionalLight: DirectionalLightEspia,
    WebGLRenderer: jest.fn().mockImplementation(() => ({
      setSize: jest.fn(),
      setPixelRatio: jest.fn(),
      render: jest.fn(),
      dispose: jest.fn(),
      domElement: document.createElement("canvas"),
      shadowMap: {},
    })),
  }
})

jest.mock("three/addons/controls/OrbitControls.js", () => ({
  OrbitControls: jest.fn().mockImplementation(() => ({
    update: jest.fn(),
    dispose: jest.fn(),
    target: { set: jest.fn() },
  })),
}))

HTMLCanvasElement.prototype.getContext = jest.fn(() => ({
  fillStyle: "",
  fillRect: jest.fn(),
  createLinearGradient: jest.fn(() => ({ addColorStop: jest.fn() })),
  beginPath: jest.fn(),
  moveTo: jest.fn(),
  lineTo: jest.fn(),
  stroke: jest.fn(),
  fillText: jest.fn(),
  fill: jest.fn(),
  closePath: jest.fn(),
  roundRect: jest.fn(),
  rect: jest.fn(),
}))

global.__solesDelBloque = soles

const AZIMUT = "Girar posición del sol para ver sombras dinámicas"
const ALTURA = "Altura del sol sobre el horizonte"

function montar() {
  soles.length = 0
  render(
    <BlockModel3D
      isOpen={true}
      onClose={jest.fn()}
      rectangle={{ bbox: [-75.6, 6.2, -75.5, 6.3] }}
      elevationAt={({ lat }) => 1000 + (lat - 6.2) * 4000}
    />,
  )
  expect(soles.length).toBeGreaterThan(0)
  return soles[soles.length - 1]
}

/** Dirección del sol vista desde el bloque, normalizada, para leerla por ejes. */
function direccion(sol) {
  return sol.position.clone().normalize()
}

describe("Sol de la escena 3D", () => {
  it("coloca el sol donde dice el azimut: 0° al norte (-Z) y 90° al este (+X)", () => {
    const sol = montar()

    fireEvent.change(screen.getByLabelText(ALTURA), { target: { value: "10" } })

    fireEvent.change(screen.getByLabelText(AZIMUT), { target: { value: "0" } })
    let d = direccion(sol)
    expect(d.z).toBeLessThan(-0.9)
    expect(Math.abs(d.x)).toBeLessThan(0.05)

    fireEvent.change(screen.getByLabelText(AZIMUT), { target: { value: "90" } })
    d = direccion(sol)
    expect(d.x).toBeGreaterThan(0.9)
    expect(Math.abs(d.z)).toBeLessThan(0.05)

    fireEvent.change(screen.getByLabelText(AZIMUT), { target: { value: "180" } })
    d = direccion(sol)
    expect(d.z).toBeGreaterThan(0.9)

    fireEvent.change(screen.getByLabelText(AZIMUT), { target: { value: "270" } })
    d = direccion(sol)
    expect(d.x).toBeLessThan(-0.9)
  })

  it("sube y baja el sol con la altura, sin tocar su rumbo", () => {
    const sol = montar()

    fireEvent.change(screen.getByLabelText(AZIMUT), { target: { value: "90" } })

    fireEvent.change(screen.getByLabelText(ALTURA), { target: { value: "10" } })
    const bajo = sol.position.clone()

    fireEvent.change(screen.getByLabelText(ALTURA), { target: { value: "80" } })
    const alto = sol.position.clone()

    expect(alto.y).toBeGreaterThan(bajo.y)
    // Los dos siguen viniendo del este: la altura no gira el sol
    expect(bajo.x).toBeGreaterThan(0)
    expect(alto.x).toBeGreaterThan(0)
    expect(Math.abs(bajo.z)).toBeLessThan(0.01)
    expect(Math.abs(alto.z)).toBeLessThan(0.01)
    // Y el sol no se acerca ni se aleja al subirlo: gira sobre una esfera
    expect(alto.length()).toBeCloseTo(bajo.length(), 5)
  })

  it("mantiene la luz blanca y de intensidad fija en todo el recorrido", () => {
    const sol = montar()
    const intensidad = sol.intensity

    for (const grados of ["0", "45", "135", "225", "315"]) {
      fireEvent.change(screen.getByLabelText(AZIMUT), { target: { value: grados } })
      expect(sol.color.getHex()).toBe(0xffffff)
      expect(sol.intensity).toBe(intensidad)
    }

    for (const grados of ["10", "45", "85"]) {
      fireEvent.change(screen.getByLabelText(ALTURA), { target: { value: grados } })
      expect(sol.color.getHex()).toBe(0xffffff)
      expect(sol.intensity).toBe(intensidad)
    }
  })

  it("arranca con la convención del sombreado: noroeste a 45°", () => {
    const sol = montar()
    const d = direccion(sol)

    expect(d.x).toBeLessThan(0) // al oeste
    expect(d.z).toBeLessThan(0) // al norte
    expect(sol.position.y).toBeGreaterThan(0)
    expect(screen.getByText("315°")).toBeInTheDocument()
    expect(screen.getByText("45°")).toBeInTheDocument()
  })
})
