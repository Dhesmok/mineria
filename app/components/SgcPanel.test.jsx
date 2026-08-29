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

/** Una consulta ya resuelta y sin resultados: lo mínimo para que salga la tarjeta. */
const consultaVacia = { loading: false, results: [] }

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
  it("no aparece mientras no se ha tocado el mapa", () => {
    // Es un popup, no un panel fijo. La versión anterior se quedaba puesta
    // diciendo «toca el mapa»: ocupaba sitio permanentemente para no decir nada,
    // y una tarjeta que está siempre deja de leerse.
    const { container } = render(<SgcPanel activeKeys={["geologiaNacional"]} />)
    expect(container).toBeEmptyDOMElement()
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
    expect(screen.getByText(/Geología 1:500\.000/)).toBeInTheDocument()
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

  it("los enlaces de un campo se pueden tocar", async () => {
    // El servicio de estado de la cartografía devuelve la memoria explicativa de
    // cada plancha como una dirección. Como texto plano hay que copiarla a mano.
    render(
      <SgcPanel
        activeKeys={["estadoCartografia"]}
        featureInfo={{
          loading: false,
          results: [
            {
              layerKey: "estadoCartografia",
              layerName: "Planchas",
              value: "Plancha 146",
              attributes: [{ field: "Memoria", value: "Ver https://sgc.gov.co/146.pdf" }],
            },
          ],
        }}
      />,
    )

    const enlace = screen.getByRole("link")
    expect(enlace).toHaveAttribute("href", "https://sgc.gov.co/146.pdf")
    expect(enlace).toHaveAttribute("target", "_blank")
    // `noreferrer` además de `noopener`: la página que se abre no tiene por qué
    // saber desde dónde se llegó.
    expect(enlace).toHaveAttribute("rel", expect.stringContaining("noreferrer"))
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
    render(
      <SgcPanel
        activeKeys={["geologiaNacional"]}
        featureInfo={consultaVacia}
        legends={{ geologiaNacional: leyendaDeAntioquia }}
      />,
    )

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
        featureInfo={consultaVacia}
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

  it("sin nada marcado no enseña leyenda, porque la capa no dibuja nada", async () => {
    const user = userEvent.setup()
    render(
      <SgcPanel
        activeKeys={["geologiaDepartamentos"]}
        featureInfo={consultaVacia}
        subLayers={{ geologiaDepartamentos: [{ id: 3, label: "Antioquia", ids: [3, 4], on: true }] }}
        chosenSub={{ geologiaDepartamentos: [] }}
        legends={{ geologiaDepartamentos: [...leyendaDeAntioquia, ...leyendaDeBoyaca] }}
      />,
    )

    await user.click(screen.getByRole("button", { name: /Simbología/ }))
    expect(screen.queryByText("Q-al")).not.toBeInTheDocument()
    expect(screen.getByText(/no devolvió simbología/)).toBeInTheDocument()
  })

  it("lo dice cuando el servicio no devolvió simbología", async () => {
    const user = userEvent.setup()
    render(
      <SgcPanel
        activeKeys={["geologiaNacional"]}
        featureInfo={consultaVacia}
        legends={{ geologiaNacional: [] }}
      />,
    )
    await user.click(screen.getByRole("button", { name: /Simbología/ }))
    expect(screen.getByText(/no devolvió simbología/)).toBeInTheDocument()
  })
})

describe("los códigos de la base de datos", () => {
  /**
   * Lo que devolvía la ficha era esto:
   *
   *     UCG_P_ 445 · UCG_P_ID 450 · COD Qal
   *
   * Tres filas, dos de ellas números internos de ArcGIS, y la única con dato
   * decía «Qal» sin más. Un geólogo sabe qué es Qal, pero el visor puede
   * decirlo: el propio servicio publica esa tabla en su simbología.
   */
  const conCodigo = {
    loading: false,
    results: [
      {
        layerKey: "geologiaDepartamentos",
        layerId: 12,
        layerName: "Geología_UCG",
        value: "Qal",
        attributes: [{ field: "COD", value: "Qal" }],
      },
    ],
  }

  it("enseña el nombre del campo que el servicio publica, no el interno", () => {
    render(
      <SgcPanel
        activeKeys={["geologiaDepartamentos"]}
        featureInfo={conCodigo}
        fieldInfo={{ "geologiaDepartamentos:12": { aliases: { COD: "Unidad" }, meanings: {} } }}
      />,
    )
    expect(screen.getByText("Unidad")).toBeInTheDocument()
    expect(screen.queryByText("COD")).not.toBeInTheDocument()
  })

  it("y el significado del código junto al código", () => {
    render(
      <SgcPanel
        activeKeys={["geologiaDepartamentos"]}
        featureInfo={conCodigo}
        fieldInfo={{
          "geologiaDepartamentos:12": {
            aliases: {},
            meanings: { Qal: "Depósitos aluviales" },
          },
        }}
      />,
    )
    // El código no se sustituye, se acompaña: es lo que aparece en los informes
    // y en los mapas impresos, así que quitarlo sería quitar información.
    expect(screen.getByText("Qal — Depósitos aluviales")).toBeInTheDocument()
  })

  it("sin diccionario, la ficha es exactamente la de antes", () => {
    // El significado llega en una segunda petición. Si el servicio no contesta,
    // se queda el código pelado: peor que con, nunca peor que antes.
    render(<SgcPanel activeKeys={["geologiaDepartamentos"]} featureInfo={conCodigo} />)
    expect(screen.getByText("COD")).toBeInTheDocument()
    expect(screen.getAllByText("Qal").length).toBeGreaterThan(0)
  })
})
