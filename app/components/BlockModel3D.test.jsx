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
        expedientCode="T-12345"
      />
    )

    expect(screen.getByText("Modelo Geológico 3D (Forge3D)")).toBeInTheDocument()
    expect(screen.getByText(/T-12345/)).toBeInTheDocument()
    expect(screen.getByText("Columna Estratigráfica")).toBeInTheDocument()
    expect(screen.getByText("Exageración:")).toBeInTheDocument()
    expect(screen.getByText("Corte interior")).toBeInTheDocument()
    expect(screen.getByText("Mediodía")).toBeInTheDocument()
  })

  it("llama a onClose al presionar la equis de cerrar", () => {
    const onClose = jest.fn()
    render(
      <BlockModel3D
        isOpen={true}
        onClose={onClose}
      />
    )

    const closeBtn = screen.getByTitle("Cerrar modelo de bloque 3D")
    fireEvent.click(closeBtn)
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it("permite cambiar la exageración vertical con el slider", () => {
    render(
      <BlockModel3D
        isOpen={true}
        onClose={jest.fn()}
      />
    )

    const slider = screen.getByDisplayValue("2")
    fireEvent.change(slider, { target: { value: "3.5" } })
    expect(screen.getByText("3.5×")).toBeInTheDocument()
  })

  it("permite activar el plano de corte transversal", () => {
    render(
      <BlockModel3D
        isOpen={true}
        onClose={jest.fn()}
      />
    )

    const cutBtn = screen.getByText("Corte interior")
    fireEvent.click(cutBtn)
    expect(screen.getByTitle("Mover plano de corte transversal")).toBeInTheDocument()
  })
})
