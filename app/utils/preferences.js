/**
 * Lo que el visor recuerda entre visitas.
 *
 * Hasta ahora no recordaba nada: cada recarga devolvía el mapa base, el sistema
 * de coordenadas, las capas encendidas, sus colores y su orden a los valores de
 * fábrica. Para quien lo usa todos los días con la misma configuración, eso es
 * rehacer el mismo trabajo cada mañana.
 *
 * Todo vive en el navegador de quien lo usa. No hay cuentas ni servidor, y no
 * sale de su máquina.
 *
 * **La regla de fondo: lo que se lee no se cree.** Una preferencia guardada hace
 * seis meses puede nombrar un mapa base retirado, una capa que cambió de clave o
 * un sistema de coordenadas que ya no está en la lista. Si eso llegara tal cual
 * al visor, la sesión siguiente arrancaría rota y no habría forma de arreglarlo
 * salvo borrando datos del navegador a mano. Por eso todo pasa por
 * `sanitizePreferences`, que descarta en silencio lo que ya no existe y deja lo
 * que sí.
 *
 * Módulo casi puro: `sanitizePreferences` no toca nada y es donde está la
 * lógica; leer y escribir son dos envoltorios de tres líneas alrededor del
 * almacenamiento del navegador.
 */

import { BASEMAPS, DEFAULT_BASEMAP } from "./basemaps"
import { CRS_LIST, SOURCE_CRS } from "./crs"
import { DEFAULT_ORDER, initialLayerState, THEME_LAYERS } from "./themeAreas"
import { COMPASS_SIZE_DEFAULT, COMPASS_SIZE_MAX, COMPASS_SIZE_MIN } from "./compassSize"

/**
 * La clave lleva versión.
 *
 * El día que la forma de esto cambie de verdad —no un campo más, sino otra
 * estructura—, subir el número deja las preferencias viejas donde están e
 * ignoradas, en vez de tener que adivinar de qué versión son.
 */
export const PREFS_KEY = "mineria.preferencias.v1"

const BASEMAP_IDS = new Set(BASEMAPS.map((b) => b.id))
const CRS_IDS = new Set(CRS_LIST.map((c) => c.id))
const LAYER_KEYS = new Set(THEME_LAYERS.map((l) => l.key))

/** Los valores de fábrica, que es lo que se usa cuando no hay nada guardado. */
export const defaultPreferences = () => ({
  basemap: DEFAULT_BASEMAP,
  showLabels: true,
  crs: SOURCE_CRS,
  layers: initialLayerState(),
  layerOrder: [...DEFAULT_ORDER],
  compassSize: COMPASS_SIZE_DEFAULT,
})

const dentroDelRango = (valor, min, max, porOmision) => {
  const numero = Number(valor)
  return Number.isFinite(numero) && numero >= min && numero <= max ? numero : porOmision
}

const isHexColor = (value) => typeof value === "string" && /^#[0-9a-f]{6}$/i.test(value)

/** Solo se guarda lo que el usuario puede cambiar de una capa. */
const sanitizeLayer = (guardada, porOmision) => {
  if (!guardada || typeof guardada !== "object") return porOmision

  const opacity = Number(guardada.opacity)

  return {
    ...porOmision,
    on: typeof guardada.on === "boolean" ? guardada.on : porOmision.on,
    opacity: Number.isFinite(opacity) && opacity >= 0 && opacity <= 1 ? opacity : porOmision.opacity,
    fillColor: isHexColor(guardada.fillColor) ? guardada.fillColor : porOmision.fillColor,
    lineColor: isHexColor(guardada.lineColor) ? guardada.lineColor : porOmision.lineColor,
  }
}

/**
 * El orden de pintado, saneado.
 *
 * Se conserva el orden guardado para las capas que siguen existiendo, y se
 * añaden al final las que no estaban —capas nuevas del visor que aquella sesión
 * no llegó a conocer—. Así, añadir una capa no borra el orden que alguien había
 * dejado puesto.
 */
const sanitizeOrder = (guardado) => {
  const conocidas = Array.isArray(guardado) ? guardado.filter((key) => LAYER_KEYS.has(key)) : []
  const vistas = new Set(conocidas)
  return [...conocidas, ...DEFAULT_ORDER.filter((key) => !vistas.has(key))]
}

/**
 * Convierte lo que había guardado en algo que el visor pueda usar sin miedo.
 *
 * @param {*} raw lo que salió del almacenamiento, sea lo que sea
 * @returns preferencias completas y válidas
 */
export const sanitizePreferences = (raw) => {
  const base = defaultPreferences()
  if (!raw || typeof raw !== "object") return base

  const layers = Object.fromEntries(
    Object.entries(base.layers).map(([key, porOmision]) => [
      key,
      sanitizeLayer(raw.layers?.[key], porOmision),
    ]),
  )

  return {
    basemap: BASEMAP_IDS.has(raw.basemap) ? raw.basemap : base.basemap,
    showLabels: typeof raw.showLabels === "boolean" ? raw.showLabels : base.showLabels,
    crs: CRS_IDS.has(raw.crs) ? raw.crs : base.crs,
    layers,
    layerOrder: sanitizeOrder(raw.layerOrder),
    compassSize: dentroDelRango(raw.compassSize, COMPASS_SIZE_MIN, COMPASS_SIZE_MAX, base.compassSize),
  }
}

/**
 * El almacenamiento, o null si no se puede usar.
 *
 * Puede fallar por más motivos de los que parece: navegación privada en algunos
 * navegadores, ajustes que bloquean los datos de sitio, o el propio servidor de
 * Next generando la página, donde `window` no existe. En todos esos casos el
 * visor tiene que arrancar igual, con los valores de fábrica.
 */
const storage = () => {
  try {
    if (typeof window === "undefined" || !window.localStorage) return null
    return window.localStorage
  } catch {
    return null
  }
}

/** Lee las preferencias guardadas. Nunca lanza y siempre devuelve algo usable. */
export const readPreferences = () => {
  const almacen = storage()
  if (!almacen) return defaultPreferences()

  try {
    const texto = almacen.getItem(PREFS_KEY)
    if (!texto) return defaultPreferences()
    return sanitizePreferences(JSON.parse(texto))
  } catch {
    // Un JSON corrupto no puede impedir abrir el visor.
    return defaultPreferences()
  }
}

/**
 * Guarda un cambio parcial sobre lo que ya había.
 *
 * Parcial a propósito: quien cambia el mapa base no tiene por qué saber nada del
 * sistema de coordenadas ni del orden de las capas.
 */
export const writePreferences = (patch) => {
  const almacen = storage()
  if (!almacen) return

  try {
    const actual = readPreferences()
    almacen.setItem(PREFS_KEY, JSON.stringify(sanitizePreferences({ ...actual, ...patch })))
  } catch {
    // El almacenamiento puede estar lleno o bloqueado. No recordar una
    // preferencia es un inconveniente; impedir usar el visor, no.
  }
}
