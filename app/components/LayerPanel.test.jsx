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
  {
    id: 2,
    label: "Antioquia",
    ids: [3, 4],
    on: true,
    children: [
      { id: 3, label: "Unidades geológicas", ids: [3], on: true },
      { id: 4, label: "Fallas", ids: [4], on: true },
    ],
  },
  {
    id: 7,
    label: "Boyacá",
    ids: [8, 9],
    on: false,
    children: [
      { id: 8, label: "Unidades geológicas", ids: [8], on: false },
      { id: 9, label: "Municipios", ids: [9], on: false },
    ],
  },
  { id: 11, label: "Chocó", ids: [12], on: false, children: [{ id: 12, label: "Unidades", ids: [12], on: false }] },
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

  it("sin nada marcado avisa de que la capa no dibuja nada", async () => {
    // Desmarcarlo todo tiene que dejar la capa en blanco, y hay que decirlo: si
    // no, se lee como que la capa dejó de funcionar.
    await abrirGeologia({ chosenSub: { geologiaDepartamentos: [] } })
    expect(screen.getByText(/esta capa no dibuja nada/)).toBeInTheDocument()
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

describe("las capas de dentro de un departamento", () => {
  const desplegar = async (extra) => {
    const user = await abrirGeologia(extra)
    await user.click(screen.getByRole("button", { name: /de 3/ }))
    return user
  }

  it("cada departamento se puede abrir para ver lo que lleva dentro", async () => {
    // Dentro de un departamento el SGC publica unidades, fallas, municipios y
    // drenajes. Quien mira la geología de Antioquia no quiere necesariamente los
    // municipios encima.
    const user = await desplegar()
    expect(screen.queryByRole("button", { name: "Fallas" })).not.toBeInTheDocument()

    await user.click(screen.getByRole("button", { name: "Capas de Antioquia" }))
    expect(screen.getByRole("button", { name: "Unidades geológicas" })).toBeInTheDocument()
    expect(screen.getByRole("button", { name: "Fallas" })).toBeInTheDocument()
  })

  it("y apagar solo una de ellas", async () => {
    const alternar = jest.fn()
    const user = await desplegar({ onToggleSubLayer: alternar })
    await user.click(screen.getByRole("button", { name: "Capas de Antioquia" }))
    await user.click(screen.getByRole("button", { name: "Fallas" }))

    expect(alternar).toHaveBeenCalledWith(
      "geologiaDepartamentos",
      expect.objectContaining({ label: "Fallas", ids: [4] }),
    )
  })

  it("un departamento a medias no se enseña ni marcado ni vacío", async () => {
    // Ni marcado ni vacío serían mentira, y es justo el estado que invita a
    // desplegarlo para ver qué falta.
    await desplegar({ chosenSub: { geologiaDepartamentos: [3] } })
    const antioquia = screen.getByRole("button", { name: "Antioquia" })
    expect(antioquia).toHaveAttribute("aria-pressed", "false")
    // El resumen cuenta departamentos dibujados, no completos: con los límites
    // apagados de fábrica ninguno lo está nunca, y «0 de 32 · 32 a medias» no
    // informa de nada.
    expect(screen.getByRole("button", { name: /^1 de 3$/ })).toBeInTheDocument()
  })

  it("no ofrece abrir un departamento con una sola capa dentro", async () => {
    // Un desplegable de un elemento es ruido: marcar el departamento ya es
    // marcar esa capa.
    await desplegar()
    expect(screen.queryByRole("button", { name: "Capas de Chocó" })).not.toBeInTheDocument()
  })
})

describe("el cuadrito de color", () => {
  it("no aparece en las capas del SGC, que llegan ya dibujadas", async () => {
    // Apagado ya se probó y no basta: un cuadrito gris junto a la capa sigue
    // pareciendo un botón, se sigue intentando pulsar, y no pasa nada.
    await abrirGeologia()
    expect(
      screen.queryByRole("button", { name: /Cambiar el color de Geología por departamentos/ }),
    ).not.toBeInTheDocument()
  })

  it("pero sí en las de la ANM, que lo eligen", async () => {
    montar()
    expect(
      screen.getByRole("button", { name: /Cambiar el color de Títulos Vigentes/ }),
    ).toBeInTheDocument()
  })
})
