import { render, screen } from "@testing-library/react"

import { PlanchaPanel } from "./PlanchaPanel"

/**
 * La ficha de la plancha puesta sobre el mapa.
 *
 * Lo que se comprueba es lo que hace falta para poder arreglar la siguiente hoja
 * que vaya mal: que los números salgan a la pantalla. Son casi mil hojas, cada
 * una hecha con el programa de su época, y quien se encuentra el fallo está en
 * campo con un teléfono y sin consola.
 */

const PLANCHA = {
  titulo: "Estado cartográfico · 132",
  canvas: { width: 4096, height: 3400 },
  crs: { label: "Origen Este-Central" },
  size: [45000, 40000],
  controlPoints: 19,
  residual: 0.4,
  frameComplete: true,
}

describe("PlanchaPanel", () => {
  it("dice en qué se fue el tiempo, separando la red del dibujado", () => {
    // Es la pregunta que hay detrás de «va lentísimo»: si manda la descarga, el
    // problema está en el SGC o en la conexión; si manda el dibujado, en el
    // aparato. Sin separarlos las dos cosas se ven igual.
    render(
      <PlanchaPanel
        plancha={{ ...PLANCHA, tiempos: { descarga: 42000, medida: 2200, geo: 300, recorte: 5100 } }}
        opacity={1}
      />,
    )

    expect(screen.getByText(/42\.0 s descarga/)).toBeInTheDocument()
    expect(screen.getByText(/7\.3 s dibujado/)).toBeInTheDocument()
  })

  it("no enseña la línea del tiempo si no hay medidas", () => {
    render(<PlanchaPanel plancha={PLANCHA} opacity={1} />)
    expect(screen.queryByText("Tardó")).not.toBeInTheDocument()
  })

  it("enseña el aviso y su detalle cuando falla", () => {
    render(
      <PlanchaPanel
        plancha={{
          titulo: "Plancha 193",
          error: "Se acabó el tiempo dibujando el PDF.",
          detalle: "95 s esperando, con 90 s de tope · 38.2 MB bajados en 61 s",
        }}
        opacity={1}
      />,
    )

    expect(screen.getByText("Se acabó el tiempo dibujando el PDF.")).toBeInTheDocument()
    expect(screen.getByText(/38\.2 MB bajados en 61 s/)).toBeInTheDocument()
  })

  it("enseña la barra de progreso, porcentaje y botón de cancelar mientras carga", () => {
    const onCancelar = jest.fn()
    render(
      <PlanchaPanel
        plancha={{
          titulo: "Plancha 132",
          cargando: true,
          progreso: { etapa: "descarga", porcentaje: 35, detalle: "8.5 MB de 24.1 MB (35%)" },
        }}
        opacity={1}
        onCancelar={onCancelar}
      />,
    )

    expect(screen.getByText("8.5 MB de 24.1 MB (35%)")).toBeInTheDocument()
    expect(screen.getByText("35%")).toBeInTheDocument()
    expect(screen.getByRole("button", { name: "Cancelar" })).toBeInTheDocument()
  })
})
