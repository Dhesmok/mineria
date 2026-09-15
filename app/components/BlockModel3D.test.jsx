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

  it("muestra la medida del bloque y los controles, sin rótulos de relleno", () => {
    render(
      <BlockModel3D
        isOpen={true}
        onClose={jest.fn()}
        rectangle={{ bbox: [-75.6, 6.2, -75.5, 6.3] }}
      />
    )

    // La medida del área es el único texto de la esquina: dice a qué escala se mira.
    expect(screen.getByText(/km/)).toBeInTheDocument()

    // Los deslizadores se identifican por su etiqueta accesible, no por un rótulo
    // impreso al lado: el icono y el número ya dicen de qué magnitud se trata.
    expect(screen.getByLabelText("Exageración vertical")).toBeInTheDocument()
    expect(
      screen.getByLabelText("Girar posición del sol para ver sombras dinámicas")
    ).toBeInTheDocument()

    // El título y la insignia nombraban lo que ya se está viendo; se quitaron.
    expect(screen.queryByText("Bloque 3D del Terreno")).not.toBeInTheDocument()
    expect(screen.queryByText("Relieve Real")).not.toBeInTheDocument()
  })

  it("anuncia el modo de colocar marcador fuera del propio botón", () => {
    render(
      <BlockModel3D
        isOpen={true}
        onClose={jest.fn()}
        rectangle={{ bbox: [-75.6, 6.2, -75.5, 6.3] }}
      />
    )

    const pinBtn = screen.getByTitle("Añadir marcador sobre el terreno")
    fireEvent.click(pinBtn)

    // El aviso vive en su propia píldora: el botón no cambia de ancho al activarse,
    // así que la fila de herramientas no se descoloca.
    expect(
      screen.getByText("Toca el terreno para colocar el marcador")
    ).toBeInTheDocument()

    fireEvent.click(screen.getByLabelText("Cancelar colocación de marcador"))
    expect(
      screen.queryByText("Toca el terreno para colocar el marcador")
    ).not.toBeInTheDocument()
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
      title: { on: true, color: "#894444", opacity: 0.7 },
      request: { on: true, color: "#F0C567", opacity: 0.5 },
      geologiaNacional: { on: true, opacity: 0.65 },
    }
    const loadedFeatures = [
      {
        layerKey: "title",
        geometry: {
          type: "Polygon",
          coordinates: [
            [
              [-75.58, 6.22],
              [-75.52, 6.22],
              [-75.52, 6.28],
              [-75.58, 6.28],
              [-75.58, 6.22],
            ],
          ],
        },
      },
    ]
    const mockPlancha = {
      canvas: document.createElement("canvas"),
      corners: [
        [-75.59, 6.29],
        [-75.51, 6.29],
        [-75.51, 6.21],
        [-75.59, 6.21],
      ],
    }

    const { container } = render(
      <BlockModel3D
        isOpen={true}
        onClose={jest.fn()}
        rectangle={{ bbox: [-75.6, 6.2, -75.5, 6.3] }}
        layerState={layerState}
        loadedFeatures={loadedFeatures}
        showLabels={false}
        plancha={mockPlancha}
        planchaOpacity={0.8}
      />
    )

    expect(container).toBeInTheDocument()
  })

  it("permite alternar el giro automático con el botón correspondiente", () => {
    render(
      <BlockModel3D
        isOpen={true}
        onClose={jest.fn()}
        rectangle={{ bbox: [-75.6, 6.2, -75.5, 6.3] }}
      />
    )

    const rotateBtn = screen.getByTitle("Iniciar giro automático")
    expect(rotateBtn).toBeInTheDocument()

    fireEvent.click(rotateBtn)
    expect(screen.getByTitle("Detener giro continuo")).toBeInTheDocument()

    fireEvent.click(screen.getByTitle("Detener giro continuo"))
    expect(screen.getByTitle("Iniciar giro automático")).toBeInTheDocument()
  })
})
