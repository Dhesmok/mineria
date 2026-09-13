import React from "react"
import { render, screen, fireEvent } from "@testing-library/react"
import BlockCompass from "./BlockCompass"

describe("BlockCompass", () => {
  it("renderiza la brújula y sus controles principales", () => {
    render(<BlockCompass />)

    expect(screen.getByLabelText("Reorientar bloque 3D al Norte")).toBeInTheDocument()
    expect(screen.getByLabelText("Reorientar al Norte")).toBeInTheDocument()
    expect(screen.getByLabelText("Alternar vista cenital")).toBeInTheDocument()
    expect(screen.getByText("N")).toBeInTheDocument()
    expect(screen.getByText("E")).toBeInTheDocument()
    expect(screen.getByText("S")).toBeInTheDocument()
    expect(screen.getByText("O")).toBeInTheDocument()
  })

  it("llama a onResetNorth al hacer clic en el dial principal", () => {
    const onResetNorth = jest.fn()
    render(<BlockCompass onResetNorth={onResetNorth} />)

    const mainBtn = screen.getByLabelText("Reorientar bloque 3D al Norte")
    fireEvent.click(mainBtn)
    expect(onResetNorth).toHaveBeenCalledTimes(1)
    expect(onResetNorth).toHaveBeenCalledWith(false)
  })

  it("llama a onToggleCenital al hacer doble clic en el dial principal", () => {
    const onToggleCenital = jest.fn()
    render(<BlockCompass onToggleCenital={onToggleCenital} />)

    const mainBtn = screen.getByLabelText("Reorientar bloque 3D al Norte")
    fireEvent.doubleClick(mainBtn)
    expect(onToggleCenital).toHaveBeenCalledTimes(1)
  })

  it("llama a onToggleCenital al hacer clic en el botón de vista cenital", () => {
    const onToggleCenital = jest.fn()
    render(<BlockCompass onToggleCenital={onToggleCenital} isCenital={false} />)

    const topBtn = screen.getByLabelText("Alternar vista cenital")
    fireEvent.click(topBtn)
    expect(onToggleCenital).toHaveBeenCalledTimes(1)
  })

  it("muestra 3D en el botón cuando isCenital es true", () => {
    render(<BlockCompass isCenital={true} />)
    expect(screen.getByText("3D")).toBeInTheDocument()
  })
})