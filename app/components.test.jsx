import React from "react"
import { render, screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import Component from "./components"

jest.mock("./MapComponent", () => ({
  __esModule: true,
  default: () => <div data-testid="map" />,
}))

jest.mock("./utils/tenureLayers", () => ({
  ...jest.requireActual("./utils/tenureLayers"),
  findTenureLayerNumbers: jest.fn(async () => ({ "Título Vigente": 3, "Solicitud Vigente": 4 })),
}))

const suggestionResponse = (codes) => ({
  ok: true,
  json: async () => ({ features: codes.map((code) => ({ attributes: { TENURE_ID: code } })) }),
})

const typeInSearch = async (user, text) => {
  const input = screen.getByPlaceholderText("Ingrese el expediente")
  await user.click(input)
  await user.type(input, text)
  return input
}

describe("buscador de expedientes", () => {
  beforeEach(() => {
    jest.clearAllMocks()
    jest.spyOn(console, "error").mockImplementation(() => {})
    global.fetch = jest.fn(async () => suggestionResponse(["ABC-123", "ABC-456"]))
  })

  afterEach(() => {
    jest.restoreAllMocks()
  })

  it("no consulta el servicio con menos de tres caracteres", async () => {
    // Antes se disparaba en cada tecla: `LIKE 'A%'` barre el dataset nacional entero.
    const user = userEvent.setup()
    render(<Component />)

    await typeInSearch(user, "AB")

    await new Promise((resolve) => setTimeout(resolve, 400))
    expect(global.fetch).not.toHaveBeenCalled()
  })

  it("muestra las sugerencias a partir de tres caracteres", async () => {
    const user = userEvent.setup()
    render(<Component />)

    await typeInSearch(user, "ABC")

    expect(await screen.findByRole("listbox")).toBeInTheDocument()
    expect(screen.getAllByRole("option")).toHaveLength(2)
  })

  it("no reabre el desplegable después de elegir una sugerencia", async () => {
    // Regresión: elegir una sugerencia actualizaba expedientCode, lo que volvía a
    // disparar la consulta y reabría la lista 300 ms más tarde.
    const user = userEvent.setup()
    render(<Component />)

    await typeInSearch(user, "ABC")
    await user.click(await screen.findByText("ABC-123"))

    expect(screen.getByPlaceholderText("Ingrese el expediente")).toHaveValue("ABC-123")
    expect(screen.queryByRole("listbox")).not.toBeInTheDocument()

    await new Promise((resolve) => setTimeout(resolve, 400))
    expect(screen.queryByRole("listbox")).not.toBeInTheDocument()
  })

  it("permite elegir con el teclado", async () => {
    const user = userEvent.setup()
    render(<Component />)

    await typeInSearch(user, "ABC")
    await screen.findByRole("listbox")

    await user.keyboard("{ArrowDown}{ArrowDown}")
    expect(screen.getAllByRole("option")[1]).toHaveAttribute("aria-selected", "true")

    await user.keyboard("{Enter}")
    expect(screen.getByPlaceholderText("Ingrese el expediente")).toHaveValue("ABC-456")
    expect(screen.queryByRole("listbox")).not.toBeInTheDocument()
  })

  it("cierra el desplegable con Escape", async () => {
    const user = userEvent.setup()
    render(<Component />)

    await typeInSearch(user, "ABC")
    await screen.findByRole("listbox")

    await user.keyboard("{Escape}")
    await waitFor(() => expect(screen.queryByRole("listbox")).not.toBeInTheDocument())
  })

  it("deshabilita el slider de opacidad mientras la capa está apagada", async () => {
    render(<Component />)

    expect(screen.getByLabelText("Opacidad de Títulos Vigentes")).toBeDisabled()
    expect(screen.getByLabelText("Opacidad de Subcontratos")).toBeDisabled()
  })
})
