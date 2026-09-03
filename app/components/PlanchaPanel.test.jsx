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
})
