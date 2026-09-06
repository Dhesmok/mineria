import React from "react"
import { render, screen, fireEvent } from "@testing-library/react"
import BlockModel3D from "./BlockModel3D"

// Mock WebGLRenderer and OrbitControls for JSDOM
jest.mock("three", () => {
  const actualThree = jest.requireActual("three")
  return {
    ...actualThree,
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

jest.mock("three/addons/controls/OrbitControls.js", () => ({
  OrbitControls: jest.fn().mockImplementation(() => ({
    update: jest.fn(),
    dispose: jest.fn(),
    target: { set: jest.fn() },
  })),
}))

describe("BlockModel3D", () => {
  it("no se renderiza cuando isOpen es false", () => {
    const { container } = render(
      <BlockModel3D isOpen={false} onClose={jest.fn()} />
    )
    expect(container.firstChild).toBeNull()
  })

  it("renderiza la cabecera, leyenda y controles cuando isOpen es true", () => {
    render(
      <BlockModel3D
        isOpen={true}
        onClose={jest.fn()}
        rectangle={{ bbox: [-75.6, 6.2, -75.5, 6.3] }}
      />
    )

    expect(screen.getByText("Bloque 3D del Terreno")).toBeInTheDocument()
    expect(screen.getByText("Relieve Real")).toBeInTheDocument()
    expect(screen.getByText("Exageración:")).toBeInTheDocument()
    expect(screen.getByText("Ángulo Sol")).toBeInTheDocument()
  })

  it("llama a onClose al presionar la equis de cerrar", () => {
    const onClose = jest.fn()
    render(
      <BlockModel3D
        isOpen={true}
        onClose={onClose}
        rectangle={{ bbox: [-75.6, 6.2, -75.5, 6.3] }}
      />
    )

    const closeBtn = screen.getByTitle("Cerrar bloque 3D del terreno")
    fireEvent.click(closeBtn)
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it("permite cambiar la exageración vertical con el slider", () => {
    render(
      <BlockModel3D
        isOpen={true}
        onClose={jest.fn()}
        rectangle={{ bbox: [-75.6, 6.2, -75.5, 6.3] }}
      />
    )

    const slider = screen.getByLabelText("Exageración vertical")
    fireEvent.change(slider, { target: { value: "3.5" } })
    expect(screen.getByText("3.5×")).toBeInTheDocument()
  })

  it("permite cambiar el ángulo solar con el slider", () => {
    render(
      <BlockModel3D
        isOpen={true}
        onClose={jest.fn()}
        rectangle={{ bbox: [-75.6, 6.2, -75.5, 6.3] }}
      />
    )

    const sunSlider = screen.getByLabelText("Girar posición del sol para ver sombras dinámicas")
    fireEvent.change(sunSlider, { target: { value: "225" } })
    expect(screen.getByText("225°")).toBeInTheDocument()
  })

  it("permite alternar el tema de estudio sin fallar", () => {
    render(
      <BlockModel3D
        isOpen={true}
        onClose={jest.fn()}
        rectangle={{ bbox: [-75.6, 6.2, -75.5, 6.3] }}
      />
    )

    const themeBtn = screen.getByTitle("Cambiar a fondo claro")
    fireEvent.click(themeBtn)
    expect(screen.getByTitle("Cambiar a fondo oscuro")).toBeInTheDocument()
  })

  it("acepta layerState y loadedFeatures sin errores", () => {
    const layerState = {
      titles: { on: true, color: "#eab308", opacity: 0.7 },
      geology: { on: false, color: "#10b981", opacity: 0.5 },
    }
    const { container } = render(
      <BlockModel3D
        isOpen={true}
        onClose={jest.fn()}
        rectangle={{ bbox: [-75.6, 6.2, -75.5, 6.3] }}
        layerState={layerState}
        loadedFeatures={[]}
      />
    )

    expect(container).toBeInTheDocument()
  })
})
