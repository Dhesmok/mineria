/**
 * Cuánto mide el panel de capas, y hasta dónde se le deja crecer.
 *
 * **Por qué se puede cambiar.** Con cuatro áreas, un departamento desplegado y
 * sus capas dentro, la lista pasa de los 350 px de ancho de fábrica: los nombres
 * se cortan y hay que desplazarse por dentro para ver lo que ya estaba en
 * pantalla. Un panel de tamaño fijo obliga a diseñar para el caso peor o a
 * aguantar el caso peor; dejar arrastrar el borde resuelve los dos.
 *
 * Los topes no son arbitrarios. Por abajo, 260 px es lo que necesitan el nombre
 * de una capa, su barra de opacidad y su interruptor sin pisarse. Por arriba, el
 * panel tapa el mapa: más de 620 px en un portátil deja de haber mapa que mirar,
 * y el panel existe para operar sobre él.
 *
 * Módulo puro. Solo son cuentas: quién dibuja el tirador y quién guarda el valor
 * son otros.
 */

export const PANEL_WIDTH_MIN = 260
export const PANEL_WIDTH_MAX = 620
export const PANEL_WIDTH_DEFAULT = 350

/**
 * El alto va en fracción de la pantalla y no en píxeles.
 *
 * Un panel de 700 px cabe en un monitor y se sale de un portátil. Guardando la
 * fracción, el mismo ajuste vale en las dos pantallas — que es justo lo que se
 * espera de algo que se recuerda entre visitas.
 */
export const PANEL_HEIGHT_MIN = 0.35
export const PANEL_HEIGHT_MAX = 0.92
export const PANEL_HEIGHT_DEFAULT = 0.85

const acotar = (valor, min, max, porOmision) => {
  // `typeof` antes de convertir, y no `Number(valor)` a secas. `Number(null)` es
  // cero, y cero es un número perfectamente finito: un ajuste corrupto guardado
  // como `null` dejaba el panel clavado en su mínimo en vez de en el de fábrica,
  // y no había forma de arreglarlo salvo borrando datos del navegador.
  if (typeof valor !== "number" || !Number.isFinite(valor)) return porOmision
  return Math.min(Math.max(valor, min), max)
}

export const clampPanelWidth = (valor) =>
  acotar(valor, PANEL_WIDTH_MIN, PANEL_WIDTH_MAX, PANEL_WIDTH_DEFAULT)

export const clampPanelHeight = (valor) =>
  acotar(valor, PANEL_HEIGHT_MIN, PANEL_HEIGHT_MAX, PANEL_HEIGHT_DEFAULT)

/**
 * El ancho que resulta de arrastrar el borde hasta cierta posición del ratón.
 *
 * Se mide desde el borde izquierdo del panel y no por el desplazamiento
 * acumulado: así, si el puntero se sale de los topes y vuelve, el borde vuelve
 * con él. Con el desplazamiento acumulado se «desincroniza» —el borde se queda a
 * medio camino del ratón— y hay que soltar y volver a agarrar.
 */
export const widthFromPointer = (clientX, panelLeft) => clampPanelWidth(clientX - panelLeft)

/** Lo mismo para el alto, en fracción de la altura de la ventana. */
export const heightFromPointer = (clientY, panelTop, viewportHeight) => {
  if (!(viewportHeight > 0)) return PANEL_HEIGHT_DEFAULT
  return clampPanelHeight((clientY - panelTop) / viewportHeight)
}
