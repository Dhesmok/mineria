import React from "react"
import { fireEvent, render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"

import { UserLayerDetails, UserLayerImport } from "./UserLayerImport"
import { LayerPanel } from "./LayerPanel"
import { buildUserLayer } from "../utils/userLayers"
import { DEFAULT_ORDER, THEME_LAYERS } from "../utils/themeAreas"

const capa = (extra = {}) =>
  buildUserLayer({
    id: "1",
    label: "Lindero La Ceiba",
    source: "lindero.dxf",
    featureCollection: {
      type: "FeatureCollection",
      features: [
        {
          type: "Feature",
          geometry: {
            type: "Polygon",
            coordinates: [[[-75.6, 6.2], [-75.5, 6.2], [-75.5, 6.3], [-75.6, 6.2]]],
          },
          properties: {},
        },
      ],
    },
    crsId: "4686",
    fillColor: "#e07a3f",
    ...extra,
  })

describe("la zona de carga", () => {
  it("dice qué se puede cargar y que los archivos no salen del navegador", () => {
    render(<UserLayerImport onFiles={() => {}} />)

    expect(screen.getByText(/Shapefile/)).toBeInTheDocument()
    expect(screen.getByText(/no\s+se suben a ningún servidor/)).toBeInTheDocument()
  })

  it("entrega al panel los archivos elegidos en el diálogo", async () => {
    const alElegir = jest.fn()
    render(<UserLayerImport onFiles={alElegir} />)

    const entrada = screen.getByLabelText("Elegir archivos para cargar en el mapa")
    const archivo = new File(["{}"], "capa.geojson", { type: "application/json" })
    fireEvent.change(entrada, { target: { files: [archivo] } })

    expect(alElegir).toHaveBeenCalled()
    expect(alElegir.mock.calls[0][0][0].name).toBe("capa.geojson")
  })

  /**
   * Arrastrar un archivo sobre el navegador **abre el archivo en una pestaña** y
   * se pierde el visor entero con lo que hubiera dibujado. Por eso hay que
   * cancelar el comportamiento por omisión en los dos eventos, no solo en el de
   * soltar: sin cancelar el `dragover`, el navegador no deja soltar nada.
   */
  it("acepta un archivo arrastrado y le quita al navegador el suyo", () => {
    const alSoltar = jest.fn()
    const { container } = render(<UserLayerImport onFiles={alSoltar} />)
    const zona = container.firstChild
    const archivo = new File(["{}"], "arrastrado.kml")

    const encima = new Event("dragover", { bubbles: true, cancelable: true })
    fireEvent(zona, encima)
    expect(encima.defaultPrevented).toBe(true)

    const soltado = new Event("drop", { bubbles: true, cancelable: true })
    soltado.dataTransfer = { files: [archivo] }
    fireEvent(zona, soltado)

    expect(soltado.defaultPrevented).toBe(true)
    expect(alSoltar.mock.calls[0][0][0].name).toBe("arrastrado.kml")
  })

  it("mientras lee no deja volver a pulsar", () => {
    render(<UserLayerImport loading onFiles={() => {}} />)
    expect(screen.getByRole("button", { name: /Leyendo archivos/ })).toBeDisabled()
  })

  it("enseña por qué falló cada archivo, con su nombre", () => {
    render(
      <UserLayerImport
        onFiles={() => {}}
        problems={[{ name: "plano.dwg", message: "Guárdalo como DXF" }]}
      />,
    )

    expect(screen.getByText("plano.dwg")).toBeInTheDocument()
    expect(screen.getByText(/Guárdalo como DXF/)).toBeInTheDocument()
  })
})

describe("la ficha de una capa cargada", () => {
  // `layer` se saca del resto a propósito: lo que llega es un trozo de ficha
  // —«crsGuessed: true»— y hay que construir la capa entera con él, no pasarlo
  // como si ya lo fuera.
  const montarFicha = ({ layer, ...extra } = {}) => {
    const props = {
      layer: capa(layer),
      onRemove: jest.fn(),
      onFocus: jest.fn(),
      onChooseCrs: jest.fn(),
      ...extra,
    }
    render(<UserLayerDetails {...props} />)
    return props
  }

  it("dice qué trae y de qué archivo salió", () => {
    montarFicha()
    expect(screen.getByText(/1 polígono/)).toBeInTheDocument()
    expect(screen.getByText("lindero.dxf")).toBeInTheDocument()
  })

  /**
   * Un plano colocado en el sitio equivocado es peor que un plano sin colocar: se
   * ve verosímil, se compara con los títulos y la conclusión sale mal. Cuando el
   * sistema es una suposición, hay que decirlo.
   */
  it("marca el sistema como supuesto y enseña el aviso de la lectura", () => {
    montarFicha({
      layer: {
        crsId: "3116",
        crsGuessed: true,
        warnings: ["El archivo no dice en qué sistema de coordenadas está."],
      },
    })

    expect(screen.getByRole("button", { name: /supuesto/ })).toBeInTheDocument()
    expect(screen.getByText(/no dice en qué sistema/)).toBeInTheDocument()
  })

  it("con el sistema confirmado no dice «supuesto»", () => {
    montarFicha()
    expect(screen.queryByText(/supuesto/)).not.toBeInTheDocument()
    expect(screen.getByRole("button", { name: /MAGNA-SIRGAS geográficas/ })).toBeInTheDocument()
  })

  // Fuera de Colombia no es un error —un plano puede ser de donde sea— pero sí es
  // lo primero que hay que mirar cuando una capa «no aparece».
  it("avisa cuando la capa acabó fuera de Colombia", () => {
    montarFicha({
      layer: {
        featureCollection: {
          type: "FeatureCollection",
          features: [
            { type: "Feature", geometry: { type: "Point", coordinates: [2.17, 41.38] }, properties: {} },
          ],
        },
      },
    })
    expect(screen.getByText(/fuera de Colombia/)).toBeInTheDocument()
  })

  it("permite elegir otro sistema y lo avisa con la clave de la capa", async () => {
    const user = userEvent.setup()
    const props = montarFicha({ layer: { crsId: "4686", crsGuessed: true } })

    await user.click(screen.getByRole("button", { name: /MAGNA-SIRGAS geográficas/ }))
    await user.click(screen.getByRole("button", { name: /Origen Nacional/ }))

    expect(props.onChooseCrs).toHaveBeenCalledWith("usuario:1", "9377")
  })

  it("lleva el mapa hasta la capa y la quita", async () => {
    const user = userEvent.setup()
    const props = montarFicha()

    await user.click(screen.getByRole("button", { name: /Encuadrar/ }))
    await user.click(screen.getByRole("button", { name: /Quitar/ }))

    expect(props.onFocus).toHaveBeenCalled()
    expect(props.onRemove).toHaveBeenCalledWith("usuario:1")
  })
})

/**
 * Y dentro del panel, que es donde se usa: la capa cargada tiene que aparecer en
 * su área con interruptor, color y opacidad como cualquier otra, y también en la
 * lista de «Activas» — que es donde se decide qué tapa a qué.
 */
describe("las capas cargadas dentro del panel", () => {
  const estadoBase = (cambios = {}) => ({
    ...Object.fromEntries(
      THEME_LAYERS.map(({ key, fillColor, lineColor }) => [
        key,
        { on: false, opacity: 0.6, fillColor, lineColor },
      ]),
    ),
    ...cambios,
  })

  const montarPanel = (extra = {}) => {
    const cargada = capa()
    render(
      <LayerPanel
        layers={estadoBase({
          [cargada.key]: { on: true, opacity: 0.6, fillColor: cargada.fillColor, lineColor: cargada.lineColor },
        })}
        order={[cargada.key, ...DEFAULT_ORDER]}
        onToggle={() => {}}
        onOpacity={() => {}}
        onColor={() => {}}
        onReorder={() => {}}
        areaHasFilter={() => false}
        onOpenFilters={() => {}}
        userLayers={[cargada]}
        onImportFiles={() => {}}
        onRemoveUserLayer={() => {}}
        onFocusUserLayer={() => {}}
        onChooseUserLayerCrs={() => {}}
        {...extra}
      />,
    )
    return cargada
  }

  it("el área «Mis capas» lleva la zona de carga y no el filtro", async () => {
    const user = userEvent.setup()
    montarPanel()

    await user.click(screen.getByRole("button", { name: "Capas de Mis capas" }))

    expect(screen.getByRole("button", { name: /Cargar otro archivo/ })).toBeInTheDocument()
    // No hay campos conocidos que filtrar ni servicio al que preguntar.
    expect(screen.queryByRole("button", { name: "Filtrar Mis capas" })).not.toBeInTheDocument()
  })

  it("la capa cargada aparece en su área con su fila", async () => {
    const user = userEvent.setup()
    const cargada = montarPanel()

    await user.click(screen.getByRole("button", { name: "Capas de Mis capas" }))

    expect(screen.getByRole("switch", { name: cargada.label })).toBeChecked()
    expect(screen.getByRole("button", { name: `Cambiar el color de ${cargada.label}` })).toBeInTheDocument()
  })

  /**
   * La lista de activas es una lista plana que resuelve cada clave con
   * `layerByKey`, y esa función solo conoce las capas del visor: sin el respaldo
   * que busca primero entre las cargadas, el panel entero reventaba con el primer
   * archivo encendido.
   */
  it("y también en «Activas», sin reventar por no estar en THEME_LAYERS", async () => {
    const user = userEvent.setup()
    const cargada = montarPanel()

    await user.click(screen.getByRole("button", { name: "Activas" }))

    expect(screen.getByRole("switch", { name: cargada.label })).toBeInTheDocument()
    expect(screen.getByText("1 activada")).toBeInTheDocument()
  })
})
