import React from "react"
import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { MobileBottomBar } from "./MobileBottomBar"

describe("MobileBottomBar", () => {
  test("renderiza los 4 botones principales con accesibilidad adecuada", () => {
    render(<MobileBottomBar activePanel={null} onSelectPanel={() => {}} />)

    expect(screen.getByRole("navigation", { name: "Controles principales para móvil" })).toBeInTheDocument()
    expect(screen.getByRole("button", { name: "Capas" })).toBeInTheDocument()
    expect(screen.getByRole("button", { name: "Herramientas" })).toBeInTheDocument()
    expect(screen.getByRole("button", { name: "Buscar" })).toBeInTheDocument()
    // «3D / GPS» se quitó: repetía dos botones que ya están sobre el mapa.
    expect(screen.queryByRole("button", { name: "3D / GPS" })).not.toBeInTheDocument()
  })

  test("marca el botón activo según activePanel", () => {
    render(<MobileBottomBar activePanel="layers" onSelectPanel={() => {}} />)

    const layersBtn = screen.getByRole("button", { name: "Capas" })
    expect(layersBtn).toHaveAttribute("aria-pressed", "true")

    const toolsBtn = screen.getByRole("button", { name: "Herramientas" })
    expect(toolsBtn).toHaveAttribute("aria-pressed", "false")
  })

  test("muestra el badge cuando hay capas activas", () => {
    render(<MobileBottomBar activePanel={null} activeLayersCount={3} onSelectPanel={() => {}} />)

    expect(screen.getByRole("button", { name: "Capas (3 activas)" })).toBeInTheDocument()
    expect(screen.getByText("3")).toBeInTheDocument()
  })

  test("dispara la selección al pulsar un botón", async () => {
    const user = userEvent.setup()
    const handleSelect = jest.fn()

    render(<MobileBottomBar activePanel={null} onSelectPanel={handleSelect} />)

    await user.click(screen.getByRole("button", { name: "Herramientas" }))
    expect(handleSelect).toHaveBeenCalledWith("tools")

    await user.click(screen.getByRole("button", { name: "Buscar" }))
    expect(handleSelect).toHaveBeenCalledWith("expediente")
  })
})
