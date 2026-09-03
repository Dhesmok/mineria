import {
  PREFS_KEY,
  defaultPreferences,
  readPreferences,
  sanitizePreferences,
  writePreferences,
} from "./preferences"
import { DEFAULT_BASEMAP } from "./basemaps"
import { DEFAULT_ORDER } from "./themeAreas"

describe("sanitizePreferences", () => {
  it("sin nada guardado devuelve los valores de fábrica", () => {
    expect(sanitizePreferences(null)).toEqual(defaultPreferences())
    expect(sanitizePreferences("no soy un objeto")).toEqual(defaultPreferences())
  })

  it("descarta un mapa base que ya no existe", () => {
    // Pasa de verdad: se retira un fondo y quien lo tenía elegido vuelve seis
    // meses después. Sin esto, el visor arrancaría pidiendo teselas a una
    // fuente que no está declarada.
    const prefs = sanitizePreferences({ basemap: "un-fondo-retirado" })
    expect(prefs.basemap).toBe(DEFAULT_BASEMAP)
  })

  it("descarta un sistema de coordenadas desconocido", () => {
    expect(sanitizePreferences({ crs: "99999" }).crs).toBe(defaultPreferences().crs)
    expect(sanitizePreferences({ crs: "9377" }).crs).toBe("9377")
  })

  it("conserva lo que sí es válido aunque el resto no lo sea", () => {
    const prefs = sanitizePreferences({ basemap: "topo", crs: "no existe", showLabels: "sí" })
    expect(prefs.basemap).toBe("topo")
    expect(prefs.crs).toBe(defaultPreferences().crs)
    // "sí" no es un booleano: se ignora en vez de volverse `true` por ser una
    // cadena no vacía, que es como se cuelan los datos absurdos.
    expect(prefs.showLabels).toBe(true)
  })

  it("solo acepta opacidades dentro de rango", () => {
    const fuera = sanitizePreferences({ layers: { title: { opacity: 4 } } })
    expect(fuera.layers.title.opacity).toBe(defaultPreferences().layers.title.opacity)

    const dentro = sanitizePreferences({ layers: { title: { opacity: 0.3 } } })
    expect(dentro.layers.title.opacity).toBe(0.3)
  })

  it("solo acepta colores en hexadecimal", () => {
    const malo = sanitizePreferences({ layers: { title: { fillColor: "rojo" } } })
    expect(malo.layers.title.fillColor).toBe(defaultPreferences().layers.title.fillColor)

    const bueno = sanitizePreferences({ layers: { title: { fillColor: "#3D5A80" } } })
    expect(bueno.layers.title.fillColor).toBe("#3D5A80")
  })

  it("ignora capas guardadas que ya no existen", () => {
    const prefs = sanitizePreferences({ layers: { capaFantasma: { on: true } } })
    expect(prefs.layers.capaFantasma).toBeUndefined()
    expect(Object.keys(prefs.layers)).toEqual(Object.keys(defaultPreferences().layers))
  })

  it("respeta el orden guardado y añade al final las capas nuevas", () => {
    // Añadir una capa al visor no puede borrar el orden que alguien dejó
    // puesto: las conocidas conservan su sitio y la nueva entra al final.
    const guardado = ["request", "title"]
    const orden = sanitizePreferences({ layerOrder: guardado }).layerOrder

    expect(orden.slice(0, 2)).toEqual(guardado)
    expect(orden).toHaveLength(DEFAULT_ORDER.length)
    expect([...orden].sort()).toEqual([...DEFAULT_ORDER].sort())
  })

  it("descarta claves inventadas dentro del orden", () => {
    const orden = sanitizePreferences({ layerOrder: ["title", "inventada", "request"] }).layerOrder
    expect(orden).not.toContain("inventada")
    expect(orden.slice(0, 2)).toEqual(["title", "request"])
  })

  it("valida y sanea el modo de fusión", () => {
    expect(sanitizePreferences({ blendMode: "normal" }).blendMode).toBe("normal")
    expect(sanitizePreferences({ blendMode: "multiply" }).blendMode).toBe("multiply")
    expect(sanitizePreferences({ blendMode: "invalid-mode" }).blendMode).toBe("multiply")
  })
})

describe("leer y escribir", () => {
  beforeEach(() => window.localStorage.clear())

  it("guarda y recupera", () => {
    writePreferences({ crs: "9377", basemap: "esri" })
    const prefs = readPreferences()
    expect(prefs.crs).toBe("9377")
    expect(prefs.basemap).toBe("esri")
  })

  it("los cambios son parciales: escribir uno no borra los demás", () => {
    // Quien cambia el mapa base no sabe nada del sistema de coordenadas.
    writePreferences({ crs: "9377" })
    writePreferences({ basemap: "topo" })

    const prefs = readPreferences()
    expect(prefs.crs).toBe("9377")
    expect(prefs.basemap).toBe("topo")
  })

  it("un JSON corrupto no impide abrir el visor", () => {
    window.localStorage.setItem(PREFS_KEY, "{esto no es json")
    expect(readPreferences()).toEqual(defaultPreferences())
  })

  it("si el almacenamiento falla, se sigue trabajando con los valores de fábrica", () => {
    // Navegación privada, ajustes que bloquean datos de sitio, cuota llena.
    const original = window.localStorage.getItem
    window.localStorage.getItem = () => {
      throw new Error("bloqueado")
    }

    expect(readPreferences()).toEqual(defaultPreferences())
    expect(() => writePreferences({ crs: "9377" })).not.toThrow()

    window.localStorage.getItem = original
  })
})
