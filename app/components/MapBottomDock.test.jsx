import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { MapBottomDock } from "./MapBottomDock"

describe("MapBottomDock", () => {
  it("muestra los botones principales del centro de mando", () => {
    render(<MapBottomDock is3D={false} isDrawActive={false} />)
    expect(screen.getByRole("button", { name: /Dibujo/i })).toBeInTheDocument()
    expect(screen.getByRole("button", { name: /Terreno/i })).toBeInTheDocument()
    expect(screen.getByRole("button", { name: "2D" })).toBeInTheDocument()
    expect(screen.getByRole("button", { name: /Fondo/i })).toBeInTheDocument()
  })

  it("activa el botón de Descargar Área únicamente cuando hay un área dibujada", () => {
    const { rerender } = render(<MapBottomDock hasArea={false} />)
    expect(screen.queryByRole("button", { name: /Descargar área/i })).not.toBeInTheDocument()

    rerender(<MapBottomDock hasArea={true} />)
    expect(screen.getByRole("button", { name: /Descargar área/i })).toBeInTheDocument()
  })

  it("permite alternar el modo 3D", async () => {
    const user = userEvent.setup()
    const onToggle3D = jest.fn()
    render(<MapBottomDock is3D={false} onToggle3D={onToggle3D} />)

    await user.click(screen.getByRole("button", { name: "2D" }))
    expect(onToggle3D).toHaveBeenCalled()
  })
})
