import { ANM_LAYERS } from "./anmLayers"
import {
  AREAS,
  DEFAULT_ORDER,
  LIVE_LAYERS,
  THEME_LAYERS,
  areaById,
  initialLayerState,
  layerByKey,
} from "./themeAreas"

describe("themeAreas", () => {
  it("no inventa las capas de minería: son las mismas de ANM_LAYERS", () => {
    // Dos listas de capas mineras que se puedan separar es el camino directo a
    // que el panel enseñe una cosa y el mapa consulte otra.
    const mineria = THEME_LAYERS.filter((layer) => layer.areaId === "mineria")
    expect(mineria.map((l) => l.key)).toEqual(ANM_LAYERS.map((l) => l.key))
    mineria.forEach((layer, i) => {
      expect(layer.fillColor).toBe(ANM_LAYERS[i].fillColor)
      expect(layer.lineColor).toBe(ANM_LAYERS[i].lineColor)
    })
  })

  it("da a cada capa un área que existe", () => {
    THEME_LAYERS.forEach((layer) => {
      expect(areaById(layer.areaId)).toBeDefined()
    })
  })

  it("no repite ninguna clave", () => {
    // Una clave repetida haría que dos capas compartieran interruptor y color.
    const claves = THEME_LAYERS.map((layer) => layer.key)
    expect(new Set(claves).size).toBe(claves.length)
  })

  it("solo las capas de minería tienen servicio hoy", () => {
    expect(LIVE_LAYERS.every((layer) => layer.url || layer.tenureName)).toBe(true)
    expect(LIVE_LAYERS.map((l) => l.areaId)).toEqual(["mineria", "mineria", "mineria", "mineria"])
  })

  it("ninguna capa pendiente trae dirección, y ninguna viva está marcada pendiente", () => {
    THEME_LAYERS.forEach((layer) => {
      if (layer.pending) {
        expect(layer.url ?? layer.tenureName).toBeUndefined()
      } else {
        expect(layer.url || layer.tenureName).toBeTruthy()
      }
    })
  })

  it("el orden de pintado nombra todas las capas y ninguna de más", () => {
    // Si faltara una, esa capa no se colocaría nunca y quedaría donde el estilo
    // la dejó; si sobrara, moveLayer reventaría con un id que no existe.
    expect([...DEFAULT_ORDER].sort()).toEqual(THEME_LAYERS.map((l) => l.key).sort())
  })

  it("solo Minería tiene el buscador habilitado", () => {
    // El buscador pregunta por campos de la ANM; en las demás áreas encontraría
    // cero y parecería roto.
    expect(AREAS.filter((a) => a.searchable).map((a) => a.id)).toEqual(["mineria"])
    AREAS.forEach((area) => expect(typeof area.searchable).toBe("boolean"))
  })

  it("cada área tiene tres trazos de icono", () => {
    AREAS.forEach((area) => {
      expect(area.icon).toHaveLength(3)
      expect(area.color).toMatch(/^#[0-9A-Fa-f]{6}$/)
    })
  })

  it("busca una capa por su clave", () => {
    expect(layerByKey("title").label).toBe("Títulos Vigentes")
    expect(layerByKey("no-existe")).toBeUndefined()
  })

  it("arranca con todas apagadas y con su color de fábrica", () => {
    const estado = initialLayerState()
    expect(Object.keys(estado)).toHaveLength(THEME_LAYERS.length)
    THEME_LAYERS.forEach((layer) => {
      expect(estado[layer.key]).toEqual({
        on: false,
        opacity: 0.6,
        fillColor: layer.fillColor,
        lineColor: layer.lineColor,
      })
    })
  })
})
