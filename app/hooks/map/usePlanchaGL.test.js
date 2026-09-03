import { renderHook, act, waitFor } from "@testing-library/react"

import { usePlanchaGL } from "./usePlanchaGL"

/**
 * Lo que se comprueba aquí es que **una plancha que tarda de más lo diga**.
 *
 * El visor se quedaba con el panel girando para siempre, sin un aviso ni un
 * número: el reloj de los 90 segundos abortaba la petición, y las tres guardas
 * de «si se abortó, salir» —puestas para callar cuando el usuario pide otra
 * plancha— se tragaban también el aviso del reloj. El mensaje de «tardó
 * demasiado» estaba escrito en el código y era inalcanzable.
 *
 * Que se rinda no es el fallo. El fallo es rendirse sin decirlo: son casi mil
 * hojas distintas y la única forma de arreglar la siguiente es que quien la vea
 * fallar pueda contar en qué se fue el tiempo.
 */

jest.mock("../../utils/planchaPdf", () => ({
  prepararPlancha: jest.fn(),
}))

import { prepararPlancha } from "../../utils/planchaPdf"

/** Un mapa de mentira con la fuente de la plancha ya declarada. */
const mapaFalso = () => {
  const fuente = { updateImage: jest.fn() }
  return {
    getLayer: () => ({}),
    getSource: () => fuente,
    setLayoutProperty: jest.fn(),
    setPaintProperty: jest.fn(),
    fuente,
  }
}

const montar = () => {
  const mapa = mapaFalso()
  const mapRef = { current: mapa }
  const utiles = renderHook(() => usePlanchaGL(mapRef, mapa, mapRef))
  return { ...utiles, mapa }
}

const PETICION = {
  url: "http://recordcenter.sgc.gov.co/plancha.pdf",
  titulo: "Plancha 132",
  cerca: [-74.9, 7.1],
}

describe("usePlanchaGL", () => {
  beforeEach(() => {
    jest.useFakeTimers()
    prepararPlancha.mockReset()
  })

  afterEach(() => {
    jest.useRealTimers()
    delete global.fetch
  })

  it("avisa cuando se acaba el tiempo descargando, en vez de girar para siempre", async () => {
    // Una descarga que no termina nunca: es lo que hace el SGC cuando la función
    // de la plataforma muere a mitad, o una conexión de campo.
    global.fetch = jest.fn(
      (_url, { signal }) =>
        new Promise((_, falla) => {
          signal.addEventListener("abort", () =>
            falla(Object.assign(new Error("abortada"), { name: "AbortError" })),
          )
        }),
    )

    const { result } = montar()
    act(() => {
      result.current.cargarPlancha(PETICION)
    })
    expect(result.current.plancha).toEqual({ cargando: true, titulo: "Plancha 132" })

    await act(async () => {
      jest.advanceTimersByTime(95000)
    })

    await waitFor(() => expect(result.current.plancha?.error).toBeTruthy())
    expect(result.current.plancha.cargando).toBeFalsy()
    // Y con el número, que es lo que sirve para saber dónde mirar.
    expect(result.current.plancha.error).toMatch(/descargando el PDF/)
    expect(result.current.plancha.detalle).toMatch(/90 s de tope/)
  })

  it("avisa también cuando el tiempo se va dibujando el PDF", async () => {
    // Este es el caso feo: la descarga sí terminó, así que el `fetch` ya no
    // puede fallar, y el reloj salta mientras el navegador rasteriza la hoja.
    global.fetch = jest.fn(async () => ({
      ok: true,
      arrayBuffer: async () => new ArrayBuffer(12_000_000),
    }))
    // Un dibujado que no acaba y que sí escucha la señal, como el de verdad.
    prepararPlancha.mockImplementation(
      (_archivo, _cerca, { signal }) =>
        new Promise((_, falla) => {
          signal.addEventListener("abort", () =>
            falla(Object.assign(new Error("cancelado"), { name: "AbortError" })),
          )
        }),
    )

    const { result } = montar()
    await act(async () => {
      result.current.cargarPlancha(PETICION)
    })

    await act(async () => {
      jest.advanceTimersByTime(95000)
    })

    await waitFor(() => expect(result.current.plancha?.error).toBeTruthy())
    expect(result.current.plancha.error).toMatch(/dibujando el PDF/)
    // Cuántos megas llegaron y cuánto se esperó: separa «la red va lenta» de
    // «este aparato no puede con la hoja», que es la pregunta que hay detrás.
    expect(result.current.plancha.detalle).toMatch(/MB/)
  })

  it("le pasa la señal al dibujado, para que se pueda parar a medio camino", async () => {
    // Sin esto el reloj abortaba el `fetch` —ya terminado— y el navegador seguía
    // rasterizando durante minutos una plancha que nadie iba a ver.
    global.fetch = jest.fn(async () => ({
      ok: true,
      arrayBuffer: async () => new ArrayBuffer(1000),
    }))
    prepararPlancha.mockResolvedValue({ ok: false, reason: "sin-rotulos", detail: "0 rótulos" })

    const { result } = montar()
    await act(async () => {
      result.current.cargarPlancha(PETICION)
    })

    expect(prepararPlancha).toHaveBeenCalledWith(
      expect.any(ArrayBuffer),
      PETICION.cerca,
      expect.objectContaining({ signal: expect.any(AbortSignal) }),
    )
  })

  it("se calla si lo que abortó fue pedir otra plancha", async () => {
    // Aquí el silencio sí es lo correcto: la segunda petición ya puso su propio
    // «cargando», y escribirle encima el fallo de la primera enseñaría un error
    // de algo que el usuario ya no está esperando.
    global.fetch = jest.fn(
      (_url, { signal }) =>
        new Promise((_, falla) => {
          signal.addEventListener("abort", () =>
            falla(Object.assign(new Error("abortada"), { name: "AbortError" })),
          )
        }),
    )

    const { result } = montar()
    act(() => {
      result.current.cargarPlancha(PETICION)
    })
    await act(async () => {
      result.current.cargarPlancha({ ...PETICION, titulo: "Plancha 133" })
    })

    expect(result.current.plancha).toEqual({ cargando: true, titulo: "Plancha 133" })
  })

  it("guarda en qué se fue el tiempo cuando sí sale bien", async () => {
    global.fetch = jest.fn(async () => ({
      ok: true,
      arrayBuffer: async () => new ArrayBuffer(1000),
    }))
    prepararPlancha.mockResolvedValue({
      ok: true,
      canvas: { width: 4096, height: 3400 },
      corners: [[0, 1], [1, 1], [1, 0], [0, 0]],
      tiempos: { medida: 2200, geo: 300, recorte: 5100 },
    })

    const { result } = montar()
    await act(async () => {
      result.current.cargarPlancha(PETICION)
    })

    expect(result.current.plancha.tiempos).toEqual(
      expect.objectContaining({ medida: 2200, recorte: 5100, descarga: expect.any(Number) }),
    )
  })
})
