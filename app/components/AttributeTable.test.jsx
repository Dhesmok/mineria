import { render, screen, fireEvent } from "@testing-library/react"
import { AttributeTable } from "./AttributeTable"

const generateFeatures = (count) =>
  Array.from({ length: count }, (_, i) => ({
    layerKey: "title",
    properties: {
      CODIGO_EXPEDIENTE: `EXP-${String(i + 1).padStart(4, "0")}`,
      TITULO_ESTADO: i % 2 === 0 ? "VIGENTE" : "EN TRAMITE",
      MODALIDAD: "CONTRATO",
      ETAPA: "EXPLORACION",
      AREA_HA: (i + 1) * 10,
      SOLICITANTES_O_TITULARES: `TITULAR ${i + 1}`,
      FECHA_DE_EXPEDICION: "1600000000000",
    },
  }))

describe("AttributeTable", () => {
  it("muestra mensaje vacío si no hay registros", () => {
    render(<AttributeTable features={[]} onPick={jest.fn()} onClose={jest.fn()} />)
    expect(screen.getByText("El filtro no dejó pasar ningún registro.")).toBeInTheDocument()
    expect(screen.getByText("0 registros")).toBeInTheDocument()
  })

  it("renderiza registros de la primera página y no excede PAGE_SIZE", () => {
    const features = generateFeatures(120)
    render(<AttributeTable features={features} onPick={jest.fn()} onClose={jest.fn()} />)

    expect(screen.getByText("120 registros")).toBeInTheDocument()
    expect(screen.getByText("EXP-0001")).toBeInTheDocument()
    expect(screen.getByText("EXP-0050")).toBeInTheDocument()
    expect(screen.queryByText("EXP-0051")).not.toBeInTheDocument()

    expect(screen.getByText("1 / 3")).toBeInTheDocument()
    expect(
      screen.getByText((_content, element) =>
        element?.tagName.toLowerCase() === "span" && element?.textContent?.startsWith("Mostrando"),
      ),
    ).toBeInTheDocument()
  })

  it("permite navegar a la página siguiente y anterior", () => {
    const features = generateFeatures(120)
    render(<AttributeTable features={features} onPick={jest.fn()} onClose={jest.fn()} />)

    const nextBtn = screen.getByRole("button", { name: "Página siguiente" })
    const prevBtn = screen.getByRole("button", { name: "Página anterior" })

    expect(prevBtn).toBeDisabled()
    expect(nextBtn).not.toBeDisabled()

    fireEvent.click(nextBtn)

    expect(screen.getByText("2 / 3")).toBeInTheDocument()
    expect(screen.getByText("EXP-0051")).toBeInTheDocument()
    expect(screen.queryByText("EXP-0001")).not.toBeInTheDocument()
    expect(prevBtn).not.toBeDisabled()

    fireEvent.click(prevBtn)
    expect(screen.getByText("1 / 3")).toBeInTheDocument()
    expect(screen.getByText("EXP-0001")).toBeInTheDocument()
  })

  it("llama a onPick con la fila seleccionada al hacer clic", () => {
    const onPick = jest.fn()
    const features = generateFeatures(5)
    render(<AttributeTable features={features} onPick={onPick} onClose={jest.fn()} />)

    const firstRow = screen.getByText("EXP-0001")
    fireEvent.click(firstRow)

    expect(onPick).toHaveBeenCalledTimes(1)
    expect(onPick.mock.calls[0][0].properties.CODIGO_EXPEDIENTE).toBe("EXP-0001")
  })

  it("cierra con la tecla Escape", () => {
    const onClose = jest.fn()
    render(<AttributeTable features={generateFeatures(5)} onPick={jest.fn()} onClose={onClose} />)

    fireEvent.keyDown(document, { key: "Escape" })
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it("permite ordenar por columna", () => {
    const features = [
      {
        layerKey: "title",
        properties: { CODIGO_EXPEDIENTE: "B-001", AREA_HA: 50 },
      },
      {
        layerKey: "title",
        properties: { CODIGO_EXPEDIENTE: "A-002", AREA_HA: 10 },
      },
    ]

    render(<AttributeTable features={features} onPick={jest.fn()} onClose={jest.fn()} />)

    // Por defecto ordenado por expediente asc ("A-002" primero)
    const expedientes = screen.getAllByText(/^[AB]-00[12]$/).map((el) => el.textContent)
    expect(expedientes).toEqual(["A-002", "B-001"])

    // Al pulsar el botón de ordenar expediente, invierte a desc
    const sortBtn = screen.getByRole("button", { name: /Expediente/ })
    fireEvent.click(sortBtn)

    const expedientesDesc = screen.getAllByText(/^[AB]-00[12]$/).map((el) => el.textContent)
    expect(expedientesDesc).toEqual(["B-001", "A-002"])
  })
})
