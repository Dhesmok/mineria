import React from "react"
import { render, screen, waitFor, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import Component from "./components"

jest.mock("./MapComponentGL", () => ({
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

/**
 * El buscador dejó de estar fijo en el panel: sale de la lupa del encabezado de
 * Minería, porque solo sirve para esa área. Abrirlo es parte de la prueba.
 */
const openSearch = async (user) => {
  await user.click(screen.getByRole("button", { name: /Buscar en Minería/ }))
  return screen.getByPlaceholderText("Ingrese el expediente")
}

const typeInSearch = async (user, text) => {
  const input =
    screen.queryByPlaceholderText("Ingrese el expediente") ?? (await openSearch(user))
  await user.click(input)
  await user.type(input, text)
  return input
}

/**
 * Despliega un área del panel, que ahora arranca plegada salvo Minería.
 *
 * Por nombre exacto y no por parecido: en el encabezado hay tres botones cuyo
 * nombre contiene el del área —desplegar, filtrar y buscar—.
 */
const openArea = async (user, nombre) => {
  await user.click(screen.getByRole("button", { name: `Capas de ${nombre}` }))
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

    // Dentro del desplegable y no en toda la página: un <select> normal —el del
    // sistema de coordenadas— también tiene opciones con rol "option", y
    // buscarlas sueltas contaba las suyas como sugerencias de expediente.
    const listbox = await screen.findByRole("listbox")
    expect(within(listbox).getAllByRole("option")).toHaveLength(2)
  })

  it("no reabre el desplegable después de elegir una sugerencia", async () => {
    // Regresión: elegir una sugerencia actualizaba expedientCode, lo que volvía a
    // disparar la consulta y reabría la lista 300 ms más tarde. Ahora elegir
    // además busca y cierra el buscador, así que la lista no puede reaparecer
    // ni sola ni al volver a abrirlo con el mismo código.
    const user = userEvent.setup()
    render(<Component />)

    await typeInSearch(user, "ABC")
    await user.click(await screen.findByText("ABC-123"))

    expect(screen.queryByRole("dialog", { name: "Buscar expediente" })).not.toBeInTheDocument()
    // La búsqueda se lanzó de verdad: aparecen las acciones sobre el resultado.
    expect(screen.getByRole("button", { name: /Borrar/ })).toBeInTheDocument()

    await new Promise((resolve) => setTimeout(resolve, 400))
    expect(screen.queryByRole("listbox")).not.toBeInTheDocument()

    const input = await openSearch(user)
    expect(input).toHaveValue("ABC-123")

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
    // Enter sobre la marcada hace lo mismo que el clic: busca y cierra.
    expect(screen.queryByRole("listbox")).not.toBeInTheDocument()
    expect(screen.queryByRole("dialog", { name: "Buscar expediente" })).not.toBeInTheDocument()

    expect(await openSearch(user)).toHaveValue("ABC-456")
  })

  it("cierra el desplegable con Escape", async () => {
    const user = userEvent.setup()
    render(<Component />)

    await typeInSearch(user, "ABC")
    await screen.findByRole("listbox")

    await user.keyboard("{Escape}")
    await waitFor(() => expect(screen.queryByRole("listbox")).not.toBeInTheDocument())
  })

  it("la barra de opacidad solo existe con la capa encendida", async () => {
    // Antes estaba siempre, deshabilitada. Con trece capas eso son trece barras
    // muertas ocupando la lista, así que ahora aparece al encender la capa.
    const user = userEvent.setup()
    render(<Component />)

    expect(screen.queryByLabelText("Opacidad de Títulos Vigentes")).not.toBeInTheDocument()

    await user.click(screen.getByRole("switch", { name: "Títulos Vigentes" }))

    expect(screen.getByLabelText("Opacidad de Títulos Vigentes")).toBeInTheDocument()
  })
})

describe("panel de capas por áreas", () => {
  it("agrupa las capas bajo su área", async () => {
    render(<Component />)

    expect(screen.getByText("Minería")).toBeInTheDocument()
    expect(screen.getByText("Geología")).toBeInTheDocument()
    expect(screen.getByText("Hidrocarburos")).toBeInTheDocument()
    expect(screen.getByText("Cartografía")).toBeInTheDocument()
    // Las cuatro de la ANM están conectadas; el contador lo dice.
    expect(screen.getByText("0/4")).toBeInTheDocument()
  })

  it("deja apagadas las capas cuyo servicio todavía no existe", async () => {
    const user = userEvent.setup()
    render(<Component />)

    // Minería viene desplegada; las demás hay que abrirlas.
    expect(screen.getByRole("switch", { name: "Títulos Vigentes" })).toBeEnabled()

    await openArea(user, "Geología")
    expect(screen.getByRole("switch", { name: "Planchas geológicas" })).toBeDisabled()
  })

  it("solo deja un área desplegada a la vez", async () => {
    // Con las cuatro abiertas el panel medía más que la pantalla y había que
    // desplazarse para cualquier cosa.
    const user = userEvent.setup()
    render(<Component />)

    expect(screen.getByRole("switch", { name: "Títulos Vigentes" })).toBeInTheDocument()

    await openArea(user, "Geología")
    expect(screen.queryByRole("switch", { name: "Títulos Vigentes" })).not.toBeInTheDocument()
    expect(screen.getByRole("switch", { name: "Planchas geológicas" })).toBeInTheDocument()
  })

  it("la lupa solo está habilitada en Minería", async () => {
    // El buscador pregunta por campos de la ANM; en las demás áreas encontraría
    // cero y parecería roto.
    render(<Component />)

    expect(screen.getByRole("button", { name: /Buscar en Minería/ })).toBeEnabled()
    expect(screen.getByRole("button", { name: /Buscar en Geología/ })).toBeDisabled()
    expect(screen.getByRole("button", { name: /Buscar en Cartografía/ })).toBeDisabled()
  })

  it("en Activas solo salen las capas encendidas, en orden", async () => {
    const user = userEvent.setup()
    render(<Component />)

    await user.click(screen.getByRole("switch", { name: "Títulos Vigentes" }))
    await user.click(screen.getByRole("button", { name: "Activas" }))

    expect(screen.getByRole("switch", { name: "Títulos Vigentes" })).toBeInTheDocument()
    expect(screen.queryByRole("switch", { name: "Subcontratos" })).not.toBeInTheDocument()
    expect(screen.getByText(/Arrastra para ordenar/)).toBeInTheDocument()
  })

  it("solo se puede reordenar en Activas", async () => {
    // En "Todas" las filas van agrupadas por área, y un orden de pintado global
    // contradiría a ese agrupamiento: por eso ahí no hay asas de arrastre.
    const user = userEvent.setup()
    render(<Component />)

    await user.click(screen.getByRole("switch", { name: "Títulos Vigentes" }))
    expect(screen.queryByRole("button", { name: /Reordenar/ })).not.toBeInTheDocument()

    await user.click(screen.getByRole("button", { name: "Activas" }))
    expect(screen.getByRole("button", { name: "Reordenar Títulos Vigentes" })).toBeInTheDocument()
  })

  it("el selector de color cambia el color de la capa", async () => {
    const user = userEvent.setup()
    render(<Component />)

    const boton = screen.getByRole("button", { name: "Cambiar el color de Títulos Vigentes" })
    // El color va en el cuadrito de dentro; el botón que lo envuelve solo existe
    // para dar un blanco de 24 px al dedo.
    const cuadrito = boton.querySelector("span")
    expect(cuadrito).toHaveStyle({ backgroundColor: "#A46F48" })

    await user.click(boton)
    await user.click(await screen.findByRole("button", { name: "Usar el color #3D5A80" }))

    expect(cuadrito).toHaveStyle({ backgroundColor: "#3D5A80" })
    // Y el contorno se deriva oscureciendo, no se queda con el de antes.
    // (61, 90, 128) al 65 % es (40, 59, 83).
    expect(cuadrito).toHaveStyle({ border: "1.5px solid #283b53" })
  })

  it("no deja tocar el color de una capa sin servicio", async () => {
    const user = userEvent.setup()
    render(<Component />)
    await openArea(user, "Cartografía")
    expect(screen.getByRole("button", { name: "Cambiar el color de Predios" })).toBeDisabled()
  })
})
