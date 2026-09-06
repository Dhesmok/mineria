import React from "react"
import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { MobileBottomSheet } from "./MobileBottomSheet"

describe("MobileBottomSheet", () => {
  test("no renderiza nada si isOpen/open es falso", () => {
    const { container } = render(
      <MobileBottomSheet isOpen={false} title="Panel de prueba">
        <div>Contenido</div>
      </MobileBottomSheet>
    )
    expect(container.firstChild).toBeNull()
  })

  test("renderiza el diálogo accesible y el título cuando isOpen es verdadero", () => {
    render(
      <MobileBottomSheet isOpen={true} title="Capas del mapa">
        <p>Lista de capas</p>
      </MobileBottomSheet>
    )

    const dialog = screen.getByRole("dialog", { name: "Capas del mapa" })
    expect(dialog).toBeInTheDocument()
    expect(screen.getByText("Capas del mapa")).toBeInTheDocument()
    expect(screen.getByText("Lista de capas")).toBeInTheDocument()
  })

  test("llama a onClose al pulsar el botón de cerrar", async () => {
    const user = userEvent.setup()
    const handleClose = jest.fn()

    render(
      <MobileBottomSheet isOpen={true} title="Herramientas" onClose={handleClose}>
        <div>Contenido</div>
      </MobileBottomSheet>
    )

    const closeBtn = screen.getByRole("button", { name: "Cerrar panel inferior" })
    await user.click(closeBtn)

    expect(handleClose).toHaveBeenCalledTimes(1)
  })

  test("cierra con la tecla Escape", async () => {
    const user = userEvent.setup()
    const handleClose = jest.fn()

    render(
      <MobileBottomSheet isOpen={true} title="Herramientas" onClose={handleClose}>
        <div>Contenido</div>
      </MobileBottomSheet>
    )

    await user.keyboard("{Escape}")
    expect(handleClose).toHaveBeenCalledTimes(1)
  })
})
