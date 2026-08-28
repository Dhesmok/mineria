import React from "react"
import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"

import { LayerPanel } from "./LayerPanel"
import { DEFAULT_ORDER, THEME_LAYERS } from "../utils/themeAreas"

/**
 * La lista de departamentos dentro de «Geología por departamentos».
 *
 * **Por qué existe.** Esa capa dibujaba solo Antioquia. No era un fallo nuestro:
 * el servicio del SGC trae ese departamento encendido de fábrica y los otros
 * treinta y uno apagados, y lo estábamos exportando tal cual. La lista sale del
 * propio servicio, así que estas pruebas la alimentan como si viniera de él.
 */

const departamentos = [
  { id: 3, label: "Antioquia", ids: [3, 4], on: true },
  { id: 8, label: "Boyacá", ids: [8, 9], on: false },
  { id: 12, label: "Chocó", ids: [12], on: false },
]

/**
 * El panel espera el estado de **todas** las capas, no solo el de la que se
 * mira: recorre el orden completo para pintar cada área. Se arma aquí entero
 * para no probar contra una forma del estado que la aplicación nunca produce.
 */
const estadoBase = (cambios = {}) =>
  Object.fromEntries(
    THEME_LAYERS.map(({ key, fillColor, lineColor }) => [
      key,
      { on: false, opacity: 0.6, fillColor, lineColor, ...(cambios[key] ?? {}) },
    ]),
  )

const montar = ({ layers, ...extra } = {}) =>
  render(
    <LayerPanel
      layers={estadoBase({ geologiaDepartamentos: { on: true }, ...layers })}
      order={DEFAULT_ORDER}
      onToggle={() => {}}
      onOpacity={() => {}}
      onColor={() => {}}
      onReorder={() => {}}
      areaHasFilter={() => false}
      subLayers={{ geologiaDepartamentos: departamentos }}
      chosenSub={{ geologiaDepartamentos: [3, 4] }}
      {...extra}
    />,
  )

/**
 * El panel arranca con Minería desplegada y las demás áreas plegadas, así que
 * llegar a la capa es parte de la prueba.
 */
const abrirGeologia = async (extra) => {
  const user = userEvent.setup()
  montar(extra)
  await user.click(screen.getByRole("button", { name: "Capas de Geología" }))
  return user
}

describe("las subcapas de una capa del SGC", () => {
  it("dice cuántas hay marcadas de cuántas, sin desplegar la lista", async () => {
    // Treinta y dos filas abiertas de entrada empujarían el resto del panel
    // fuera de la pantalla.
    await abrirGeologia()
    expect(screen.getByRole("button", { name: /1 de 3/ })).toHaveAttribute(
      "aria-expanded",
      "false",
    )
    expect(screen.queryByRole("button", { name: "Boyacá" })).not.toBeInTheDocument()
  })

  it("al desplegarla enseña lo que el servicio dijo tener, marcado lo que se ve", async () => {
    const user = await abrirGeologia()
    await user.click(screen.getByRole("button", { name: /1 de 3/ }))

    expect(screen.getByRole("button", { name: "Antioquia" })).toHaveAttribute(
      "aria-pressed",
      "true",
    )
    expect(screen.getByRole("button", { name: "Boyacá" })).toHaveAttribute("aria-pressed", "false")
    expect(screen.getByRole("button", { name: "Chocó" })).toBeInTheDocument()
  })

  it("marcar un departamento avisa con su grupo entero, no solo con su índice", async () => {
    // Un departamento son varias capas dentro del servicio —unidades, fallas,
    // estructuras— y encender solo la primera dibujaría media geología.
    const alternar = jest.fn()
    const user = await abrirGeologia({ onToggleSubLayer: alternar })

    await user.click(screen.getByRole("button", { name: /1 de 3/ }))
    await user.click(screen.getByRole("button", { name: "Boyacá" }))

    expect(alternar).toHaveBeenCalledWith(
      "geologiaDepartamentos",
      expect.objectContaining({ label: "Boyacá", ids: [8, 9] }),
    )
  })

  it("sin nada marcado explica por qué se ve un solo departamento", async () => {
    // Es justo el desconcierto que motivó todo esto: el mapa pintado y la lista
    // diciendo «ninguno».
    await abrirGeologia({ chosenSub: { geologiaDepartamentos: [] } })
    expect(screen.getByText(/el servicio dibuja solo lo que trae por omisión/)).toBeInTheDocument()
  })

  it("no aparece con la capa apagada", async () => {
    // Elegir departamentos de una capa que no se está viendo no significa nada.
    await abrirGeologia({ layers: { geologiaDepartamentos: { on: false } } })
    expect(screen.queryByRole("button", { name: /de 3/ })).not.toBeInTheDocument()
  })

  it("ni cuando el servicio no ofreció nada que elegir", async () => {
    // El mapa nacional es una sola capa: un desplegable de un elemento es ruido.
    await abrirGeologia({ subLayers: { geologiaDepartamentos: [] } })
    expect(screen.queryByRole("button", { name: /de 3/ })).not.toBeInTheDocument()
  })
})
