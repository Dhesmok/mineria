import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { TopOmniBar } from "./TopOmniBar"

describe("TopOmniBar", () => {
  it("muestra el sistema de coordenadas seleccionado y el contador de capas", () => {
    render(
      <TopOmniBar
        selectedCoordinateSystem="9377"
        activeLayerCount={3}
        sidebarOpen={false}
      />,
    )
    expect(screen.getByText("Capas")).toBeInTheDocument()
    expect(screen.getByText("3")).toBeInTheDocument()
    expect(screen.getByText(/Origen Nacional \(CTM-12\)/i)).toBeInTheDocument()
  })

  it("permite abrir el menú de selección de CRS y cambiar de proyección", async () => {
    const user = userEvent.setup()
    const onSelectCrs = jest.fn()
    render(
      <TopOmniBar
        selectedCoordinateSystem="9377"
        onSelectCrs={onSelectCrs}
      />,
    )

    const crsButton = screen.getByRole("button", { name: /Origen Nacional \(CTM-12\)/i })
    await user.click(crsButton)

    // Debe mostrar la lista de sistemas de Colombia
    expect(screen.getByText("Sistemas Oficiales de Colombia")).toBeInTheDocument()
    const bogotaOption = screen.getByRole("button", { name: /Origen Bogotá \(antiguo\)/i })
    await user.click(bogotaOption)

    expect(onSelectCrs).toHaveBeenCalledWith("3116")
  })

  it("permite alternar entre Multiplicar y Normal", async () => {
    const user = userEvent.setup()
    const onBlendModeChange = jest.fn()
    render(
      <TopOmniBar
        blendMode="multiply"
        onBlendModeChange={onBlendModeChange}
      />,
    )

    const normalButton = screen.getByRole("button", { name: "Normal" })
    await user.click(normalButton)
    expect(onBlendModeChange).toHaveBeenCalledWith("normal")
  })
})
