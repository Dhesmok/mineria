/**
 * Colores del dibujo de las capas.
 *
 * Cada capa se pinta con dos colores: el relleno y el contorno. El usuario
 * elige uno solo —el que ve en la muestra del panel— y el contorno se deriva
 * oscureciéndolo. Pedir los dos sería más exacto y bastante más pesado: nadie
 * quiere elegir dos colores por capa, y la pareja "relleno claro, borde oscuro"
 * es la
 * que hace legible un polígono sobre satélite y sobre mapa claro por igual.
 *
 * Módulo puro.
 */

const HEX = /^#?([0-9a-f]{3}|[0-9a-f]{6})$/i

/** "#a46f48" o "#abc" → [164, 111, 72]. Devuelve null si no es un color válido. */
export const hexToRgb = (value) => {
  const match = HEX.exec(String(value ?? "").trim())
  if (!match) return null

  const digits = match[1]
  const full =
    digits.length === 3
      ? digits
          .split("")
          .map((c) => c + c)
          .join("")
      : digits

  return [
    Number.parseInt(full.slice(0, 2), 16),
    Number.parseInt(full.slice(2, 4), 16),
    Number.parseInt(full.slice(4, 6), 16),
  ]
}

const toHex = (value) => Math.round(Math.min(255, Math.max(0, value))).toString(16).padStart(2, "0")

export const rgbToHex = ([r, g, b]) => `#${toHex(r)}${toHex(g)}${toHex(b)}`

/**
 * Oscurece un color hacia el negro.
 *
 * @param {string} value color en hexadecimal
 * @param {number} amount 0 = igual, 1 = negro
 * @returns {string} el color oscurecido, o el original si no se pudo leer
 */
export const darken = (value, amount = 0.35) => {
  const rgb = hexToRgb(value)
  if (!rgb) return value

  const factor = 1 - Math.min(1, Math.max(0, amount))
  return rgbToHex(rgb.map((channel) => channel * factor))
}

/**
 * ¿Sobre este color se lee mejor texto negro o blanco?
 *
 * Se usa para la marca de "elegido" dentro de la muestra de color: con un
 * palomita blanca sobre amarillo no se ve nada. La fórmula es la luminancia
 * relativa de WCAG.
 */
export const readableInk = (value) => {
  const rgb = hexToRgb(value)
  if (!rgb) return "#ffffff"

  const [r, g, b] = rgb.map((channel) => {
    const c = channel / 255
    return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4)
  })

  const luminance = 0.2126 * r + 0.7152 * g + 0.0722 * b
  return luminance > 0.45 ? "#111827" : "#ffffff"
}

/**
 * La paleta que ofrece el selector.
 *
 * Los cuatro primeros son los colores que ya usa el visor para las capas de la
 * ANM, para que quien quiera volver atrás los encuentre. El resto cubre el
 * círculo cromático con la misma claridad, de forma que ninguna capa desaparezca
 * al ponerla sobre el mapa base.
 */
export const LAYER_PALETTE = [
  "#A46F48",
  "#B68863",
  "#FFF0AF",
  "#38A3A5",
  "#E4572E",
  "#F4A259",
  "#8CB369",
  "#4A7C59",
  "#5B8FB9",
  "#3D5A80",
  "#9B6A9D",
  "#C3537B",
]
