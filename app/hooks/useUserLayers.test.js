import { act, renderHook } from "@testing-library/react"

import { useUserLayers } from "./useUserLayers"
import { fromGeographic } from "../utils/crs"

/**
 * Lo que decide este hook es **en qué sistema de coordenadas está cada archivo**,
 * que es la única pregunta difícil de toda la carga. La lectura de los formatos
 * tiene sus propias pruebas en `utils/fileImport.test.js`, así que aquí se
 * sustituye por una lista de capas ya leídas: lo que se prueba es la decisión.
 */
const leidas = { layers: [], problems: [] }

jest.mock("../utils/fileImport", () => ({
  readGeoFiles: jest.fn(async () => leidas),
}))

const punto = (x, y) => ({
  type: "FeatureCollection",
  features: [{ type: "Feature", geometry: { type: "Point", coordinates: [x, y] }, properties: {} }],
})

const SEGOVIA = [-74.7, 7.08]

const responder = (layers, problems = []) => {
  leidas.layers = layers
  leidas.problems = problems
}

const cargar = async (layers, problems) => {
  responder(layers, problems)
  const añadidas = []
  const { result } = renderHook(() => useUserLayers({ onLayerAdded: (capa) => añadidas.push(capa) }))

  await act(async () => {
    await result.current.importFiles([{ name: "lo-que-sea" }])
  })

  return { result, añadidas }
}

describe("qué sistema se le atribuye a cada archivo", () => {
  /** 1. El archivo lo dice y los números lo confirman: no hay nada que preguntar. */
  it("un KML se dibuja como geográfico y sin avisos", async () => {
    const { result } = await cargar([
      { name: "ruta.kml", featureCollection: punto(-74.7, 7.08), crs: "4686", warnings: [] },
    ])

    const capa = result.current.userLayers[0]
    expect(capa.crsId).toBe("4686")
    expect(capa.crsGuessed).toBe(false)
    expect(capa.warnings).toEqual([])
  })

  /**
   * 2. El archivo dice que es geográfico y los números dicen que no.
   *
   * Pasa cuando proj4 no entiende el `.prj` de un shapefile: la librería de
   * lectura **deja las coordenadas como estaban, sin avisar**. No se le puede
   * creer al archivo sin mirar los números — es la trampa nº 2 de CLAUDE.md, la
   * llamada que en vez de fallar devuelve algo verosímil.
   */
  it("no le cree a un archivo que se declara geográfico con coordenadas planas", async () => {
    const [x, y] = fromGeographic(SEGOVIA, "3116")
    const { result } = await cargar([
      { name: "titulos.shp", featureCollection: punto(x, y), crs: "4686", warnings: [] },
    ])

    const capa = result.current.userLayers[0]
    expect(capa.crsId).toBe("3116")
    expect(capa.crsGuessed).toBe(true)
    expect(capa.warnings.join(" ")).toMatch(/\.prj/)
    // Y queda dibujada donde debe, no en el Atlántico.
    expect(capa.bbox[0]).toBeCloseTo(SEGOVIA[0], 5)
  })

  /** 3. El archivo no dice nada: el caso del DXF. */
  it("adivina el sistema de un CAD y lo marca como suposición", async () => {
    const [x, y] = fromGeographic(SEGOVIA, "9377")
    const { result } = await cargar([
      { name: "lindero.dxf", featureCollection: punto(x, y), crs: null, warnings: [] },
    ])

    const capa = result.current.userLayers[0]
    expect(capa.crsId).toBe("9377")
    expect(capa.crsGuessed).toBe(true)
    expect(capa.warnings.join(" ")).toContain("Origen Nacional")
    expect(capa.bbox[1]).toBeCloseTo(SEGOVIA[1], 5)
  })

  it("cuenta cuántos sistemas encajaban cuando hay más de uno", async () => {
    const [x, y] = fromGeographic(SEGOVIA, "3116")
    const { result } = await cargar([
      { name: "lindero.dxf", featureCollection: punto(x, y), crs: null, warnings: [] },
    ])

    expect(result.current.userLayers[0].warnings.join(" ")).toMatch(/sistemas que también/)
  })

  /**
   * Cuando no encaja ninguno —un CAD en coordenadas locales— se dibuja donde
   * caiga y se dice. Callarlo sería lo peor: una capa en el golfo de Guinea con
   * el mapa en Antioquia parece que no cargó.
   */
  it("con coordenadas locales lo confiesa en vez de inventar un sistema", async () => {
    const { result } = await cargar([
      { name: "local.dxf", featureCollection: punto(420, 310), crs: null, warnings: [] },
    ])

    const capa = result.current.userLayers[0]
    expect(capa.crsGuessed).toBe(true)
    expect(capa.warnings.join(" ")).toMatch(/no se pudo deducir/i)
    expect(capa.farFromColombia).toBe(true)
  })
})

describe("la lista de capas", () => {
  it("las nuevas van de primeras y avisa para que el panel les dé estado", async () => {
    const { result, añadidas } = await cargar([
      { name: "a.geojson", featureCollection: punto(-75, 6), crs: "4686", warnings: [] },
      { name: "b.geojson", featureCollection: punto(-74, 7), crs: "4686", warnings: [] },
    ])

    expect(result.current.userLayers.map((c) => c.label)).toEqual(["a", "b"])
    expect(añadidas).toHaveLength(2)
    // Cada una con su clave y su color, distintos entre sí.
    expect(new Set(añadidas.map((c) => c.key)).size).toBe(2)
    expect(new Set(añadidas.map((c) => c.fillColor)).size).toBe(2)
  })

  /**
   * Cargar dos veces el mismo archivo —lo que uno hace al corregir un plano y
   * volver a exportarlo— tiene que dar dos capas y no una que pise a la otra.
   */
  it("el mismo archivo cargado dos veces son dos capas distintas", async () => {
    const capa = { name: "lindero.dxf", featureCollection: punto(-75, 6), crs: "4686", warnings: [] }
    const { result } = await cargar([capa])

    await act(async () => {
      await result.current.importFiles([{ name: "lindero.dxf" }])
    })

    const claves = result.current.userLayers.map((c) => c.key)
    expect(claves).toHaveLength(2)
    expect(new Set(claves).size).toBe(2)
  })

  it("quitar una capa la saca de la lista y lo avisa", async () => {
    responder([{ name: "a.geojson", featureCollection: punto(-75, 6), crs: "4686", warnings: [] }])
    const quitadas = []
    const { result } = renderHook(() => useUserLayers({ onLayerRemoved: (key) => quitadas.push(key) }))

    await act(async () => {
      await result.current.importFiles([{ name: "a.geojson" }])
    })
    const key = result.current.userLayers[0].key
    act(() => result.current.removeLayer(key))

    expect(result.current.userLayers).toEqual([])
    expect(quitadas).toEqual([key])
  })

  it("cambiar el sistema a mano reproyecta desde el archivo y quita el aviso", async () => {
    const [x, y] = fromGeographic(SEGOVIA, "3116")
    const { result } = await cargar([
      { name: "lindero.dxf", featureCollection: punto(x, y), crs: null, warnings: [] },
    ])

    const key = result.current.userLayers[0].key
    act(() => result.current.setLayerCrs(key, "9377"))

    const capa = result.current.userLayers[0]
    expect(capa.crsId).toBe("9377")
    expect(capa.crsGuessed).toBe(false)
    // Los mismos números del archivo leídos en otro sistema caen en otro sitio:
    // es exactamente lo que el usuario está comprobando al cambiarlo.
    expect(capa.bbox[0]).not.toBeCloseTo(SEGOVIA[0], 2)
  })

  it("los problemas de lectura llegan al panel y se pueden descartar", async () => {
    const { result } = await cargar([], [{ name: "plano.dwg", message: "Guárdalo como DXF" }])

    expect(result.current.problems).toHaveLength(1)
    act(() => result.current.clearProblems())
    expect(result.current.problems).toEqual([])
  })

  it("no deja el panel en «leyendo» para siempre si algo falla", async () => {
    const { readGeoFiles } = require("../utils/fileImport")
    readGeoFiles.mockImplementationOnce(async () => {
      throw new Error("se rompió algo nuestro")
    })

    const { result } = renderHook(() => useUserLayers({}))
    await act(async () => {
      await result.current.importFiles([{ name: "x.geojson" }])
    })

    expect(result.current.loading).toBe(false)
    expect(result.current.problems[0].message).toContain("se rompió algo nuestro")
  })

  it("no hace nada si no se seleccionó ningún archivo", async () => {
    const { result } = renderHook(() => useUserLayers({}))
    await act(async () => {
      expect(await result.current.importFiles([])).toEqual([])
    })
    expect(result.current.loading).toBe(false)
  })
})
