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

  it("hoy tienen servicio las de minería y las de geología", () => {
    // Minería son cuatro capas de la ANM y geología cinco del SGC. Las demás
    // áreas siguen pendientes de conseguir sus direcciones públicas.
    const porArea = LIVE_LAYERS.reduce((cuenta, l) => {
      cuenta[l.areaId] = (cuenta[l.areaId] ?? 0) + 1
      return cuenta
    }, {})
    expect(porArea).toEqual({ mineria: 4, geologia: 4 })
  })

  it("cada capa viva sabe de dónde saca sus datos, de una forma u otra", () => {
    // Hay dos formas y no una: las de la ANM llegan como polígonos —con `url` o
    // con `tenureName`— y las del SGC llegan ya dibujadas, como imagen. Escribir
    // la comprobación solo con la primera forma dejaba fuera a las segundas.
    THEME_LAYERS.forEach((layer) => {
      if (layer.pending) {
        expect(layer.url ?? layer.tenureName).toBeUndefined()
        expect(layer.raster).toBeFalsy()
      } else {
        expect(layer.raster || layer.url || layer.tenureName).toBeTruthy()
      }
    })
  })

  it("las capas ráster no ofrecen color, porque no lo eligen ellas", () => {
    // Llegan dibujadas por el SGC con su propia simbología. Un selector de color
    // ahí no cambiaría nada, y un control que no hace nada se lee como roto.
    const raster = THEME_LAYERS.filter((l) => l.raster)
    expect(raster.length).toBeGreaterThan(0)
    raster.forEach((layer) => {
      expect(layer.areaId).toBe("geologia")
      expect(layer.hint).toBeTruthy()
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

  it("cada área trae un icono dibujable y su color", () => {
    // Antes esto exigía exactamente tres trazos, que no era una propiedad de
    // nada: solo el número que resultó tener el primer icono. Al cambiar el de
    // Minería por un pico —cuatro trazos— la prueba falló sin que nada estuviera
    // mal. Lo que sí importa es que haya trazos y que sean rutas válidas: el
    // panel los mete tal cual en un `<path d=…>`, y una cadena que no empiece
    // por un comando de dibujo no pinta nada y no avisa.
    AREAS.forEach((area) => {
      const trazos = area.icon.filter(Boolean)
      expect(trazos.length).toBeGreaterThan(0)
      trazos.forEach((d) => expect(d).toMatch(/^[Mm]\s*-?[\d.]/))
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
