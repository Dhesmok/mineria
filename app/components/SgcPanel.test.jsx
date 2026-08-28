import React from "react"
import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"

import { SgcPanel, activeSgcKeys } from "./SgcPanel"

/**
 * Lo que se comprueba aquí es una sola cosa dicha de varias maneras: **una capa
 * geológica que solo se dibuja no sirve**. El usuario lo dijo con estas palabras
 * —«arrojan imágenes que sin información o simbología o pop ups, no sirve para
 * nada prácticamente»— y estas pruebas son la traducción de esa frase.
 */

const leyendaDeAntioquia = [
  {
    layerId: 4,
    layerName: "Unidades geológicas",
    items: [{ label: "Q-al", image: "data:image/png;base64,AAAA" }],
  },
]

const leyendaDeBoyaca = [
  {
    layerId: 9,
    layerName: "Unidades de Boyacá",
    items: [{ label: "K1-Sm", image: "data:image/png;base64,BBBB" }],
  },
]

describe("activeSgcKeys", () => {
  it("devuelve solo las encendidas, en el orden del catálogo", () => {
    expect(activeSgcKeys({ planchas: { on: true }, geologiaNacional: { on: true } })).toEqual([
      "geologiaNacional",
      "planchas",
    ])
  })

  it("con nada encendido no devuelve nada", () => {
    expect(activeSgcKeys({ planchas: { on: false } })).toEqual([])
    expect(activeSgcKeys(undefined)).toEqual([])
  })
})

describe("la tarjeta de geología", () => {
  it("no aparece si no hay ninguna capa del SGC encendida", () => {
    // Un panel permanente que casi nunca tiene algo que decir es ruido en una
    // columna que ya lleva la leyenda de pendiente y la ventana del 3D.
    const { container } = render(<SgcPanel activeKeys={[]} />)
    expect(container).toBeEmptyDOMElement()
  })

  it("invita a tocar el mapa mientras no se ha preguntado nada", () => {
    render(<SgcPanel activeKeys={["geologiaNacional"]} />)
    expect(screen.getByText(/Toca el mapa/)).toBeInTheDocument()
  })

  it("enseña los atributos del punto tocado y de qué capa salen", () => {
    render(
      <SgcPanel
        activeKeys={["geologiaNacional"]}
        featureInfo={{
          loading: false,
          results: [
            {
              layerKey: "geologiaNacional",
              layerName: "Unidades geológicas",
              value: "K1-Sm",
              attributes: [
                { field: "Unidad", value: "K1-Sm" },
                { field: "Edad", value: "Cretácico" },
              ],
            },
          ],
        }}
      />,
    )

    // Dos veces: como titular de la respuesta y como uno de los campos. ArcGIS
    // marca al publicar cuál es el campo que resume el registro, y ese es el que
    // encabeza la ficha; la lista de abajo es el registro completo.
    expect(screen.getAllByText("K1-Sm")).toHaveLength(2)
    expect(screen.getByText("Cretácico")).toBeInTheDocument()
    // De qué capa salió importa tanto como el dato: con el mapa nacional y una
    // plancha encendidas a la vez, dos respuestas distintas al mismo punto no
    // son una contradicción, son dos escalas.
    expect(screen.getByText(/Mapa geológico de Colombia/)).toBeInTheDocument()
  })

  it("distingue «no hay dato aquí» de «no he preguntado»", () => {
    // Un hueco de cartografía es una respuesta legítima, y si se enseñara la
    // tarjeta vacía se leería como un fallo del visor.
    render(<SgcPanel activeKeys={["geologiaNacional"]} featureInfo={{ loading: false, results: [] }} />)
    expect(screen.getByText(/No hay unidades cartografiadas/)).toBeInTheDocument()
  })

  it("avisa mientras el SGC responde", () => {
    // Estos servicios tardan segundos. Sin el aviso, el clic parece no haber
    // hecho nada y el usuario vuelve a tocar.
    render(<SgcPanel activeKeys={["geologiaNacional"]} featureInfo={{ loading: true, results: [] }} />)
    expect(screen.getByText("Consultando…")).toBeInTheDocument()
  })

  it("se puede cerrar la ficha", async () => {
    const user = userEvent.setup()
    const cerrar = jest.fn()
    render(
      <SgcPanel
        activeKeys={["geologiaNacional"]}
        featureInfo={{ loading: false, results: [] }}
        onDismiss={cerrar}
      />,
    )
    await user.click(screen.getByRole("button", { name: /Cerrar la consulta/ }))
    expect(cerrar).toHaveBeenCalled()
  })
})

describe("la simbología", () => {
  it("viene plegada y se abre con los símbolos del propio servicio", async () => {
    const user = userEvent.setup()
    render(<SgcPanel activeKeys={["geologiaNacional"]} legends={{ geologiaNacional: leyendaDeAntioquia }} />)

    expect(screen.queryByText("Q-al")).not.toBeInTheDocument()
    await user.click(screen.getByRole("button", { name: /Simbología/ }))

    expect(screen.getByText("Q-al")).toBeInTheDocument()
    // El símbolo es el que manda el SGC, no una aproximación nuestra: en un mapa
    // geológico el color *es* el dato.
    expect(screen.getByRole("presentation", { hidden: true })).toHaveAttribute(
      "src",
      "data:image/png;base64,AAAA",
    )
  })

  it("solo enseña la leyenda de los departamentos marcados", async () => {
    // Con los treinta y dos, la lista serían cientos de filas de las que casi
    // ninguna está en pantalla: la leyenda dejaría de ayudar a leer el mapa.
    const user = userEvent.setup()
    render(
      <SgcPanel
        activeKeys={["geologiaDepartamentos"]}
        subLayers={{
          geologiaDepartamentos: [
            { id: 3, label: "Antioquia", ids: [3, 4], on: true },
            { id: 8, label: "Boyacá", ids: [8, 9], on: false },
          ],
        }}
        chosenSub={{ geologiaDepartamentos: [3, 4] }}
        legends={{ geologiaDepartamentos: [...leyendaDeAntioquia, ...leyendaDeBoyaca] }}
      />,
    )

    await user.click(screen.getByRole("button", { name: /Simbología/ }))
    expect(screen.getByText("Q-al")).toBeInTheDocument()
    expect(screen.queryByText("K1-Sm")).not.toBeInTheDocument()
  })

  it("sin nada marcado no filtra, porque el servicio dibuja lo suyo", async () => {
    const user = userEvent.setup()
    render(
      <SgcPanel
        activeKeys={["geologiaDepartamentos"]}
        subLayers={{ geologiaDepartamentos: [{ id: 3, label: "Antioquia", ids: [3, 4], on: true }] }}
        chosenSub={{ geologiaDepartamentos: [] }}
        legends={{ geologiaDepartamentos: [...leyendaDeAntioquia, ...leyendaDeBoyaca] }}
      />,
    )

    await user.click(screen.getByRole("button", { name: /Simbología/ }))
    expect(screen.getByText("Q-al")).toBeInTheDocument()
    expect(screen.getByText("K1-Sm")).toBeInTheDocument()
  })

  it("lo dice cuando el servicio no devolvió simbología", async () => {
    const user = userEvent.setup()
    render(<SgcPanel activeKeys={["geologiaNacional"]} legends={{ geologiaNacional: [] }} />)
    await user.click(screen.getByRole("button", { name: /Simbología/ }))
    expect(screen.getByText(/no devolvió simbología/)).toBeInTheDocument()
  })
})
