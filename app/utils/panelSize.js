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
export const PANEL_WIDTH_DEFAULT = 350

/**
 * El tope de ancho, que ya no es un número fijo.
 *
 * Eran 620 px escritos a mano, y ese número decía dos cosas a la vez: «más allá
 * no hay mapa que mirar» —cierto en un portátil— y «más allá no se puede» —falso
 * en un monitor grande, donde 620 px es un tercio de la pantalla y la lista sigue
 * cortando los nombres—. El tope se calcula ahora contra la ventana: el panel
 * puede llegar a la mitad de lo que haya, y como mucho a `PANEL_WIDTH_CEILING`.
 *
 * El techo absoluto existe porque un monitor ultrapanorámico daría un panel de
 * 1.700 px, y un panel más ancho que alto no se lee: la lista de capas es una
 * columna, y ensancharla más allá de cierto punto solo añade blanco a la derecha.
 *
 * En una pantalla estrecha —un teléfono— la mitad se queda por debajo del mínimo,
 * y ahí manda el mínimo: es lo que necesitan el nombre de una capa, su barra de
 * opacidad y su interruptor sin pisarse.
 */
export const PANEL_WIDTH_CEILING = 1100

export const panelWidthMax = (viewportWidth) => {
  if (!(viewportWidth > 0)) return PANEL_WIDTH_CEILING
  return Math.max(PANEL_WIDTH_MIN, Math.min(PANEL_WIDTH_CEILING, viewportWidth * 0.5))
}

/**
 * El alto va en fracción de la pantalla y no en píxeles.
 *
 * Un panel de 700 px cabe en un monitor y se sale de un portátil. Guardando la
 * fracción, el mismo ajuste vale en las dos pantallas — que es justo lo que se
 * espera de algo que se recuerda entre visitas.
 */
export const PANEL_HEIGHT_MIN = 0.35
export const PANEL_HEIGHT_DEFAULT = 0.85

/**
 * Y por abajo se deja llegar casi al borde.
 *
 * Estaba en 0,92, y ese 8 % restante es justo donde el arrastre «se plantaba»
 * sin motivo aparente: el tirador dejaba de seguir al ratón y parecía roto. Lo
 * que hay que reservar es la barra de atribución de OpenStreetMap y poco más.
 */
export const PANEL_HEIGHT_MAX = 0.97

const acotar = (valor, min, max, porOmision) => {
  // `typeof` antes de convertir, y no `Number(valor)` a secas. `Number(null)` es
  // cero, y cero es un número perfectamente finito: un ajuste corrupto guardado
  // como `null` dejaba el panel clavado en su mínimo en vez de en el de fábrica,
  // y no había forma de arreglarlo salvo borrando datos del navegador.
  if (typeof valor !== "number" || !Number.isFinite(valor)) return porOmision
  return Math.min(Math.max(valor, min), max)
}

/**
 * @param {number} valor el ancho a acotar
 * @param {number} [viewportWidth] el ancho de la ventana. Sin él se usa el techo
 *   absoluto: es el caso del servidor de Next generando la página, donde no hay
 *   ventana que medir y acotar contra una inventada guardaría un valor falso.
 */
export const clampPanelWidth = (valor, viewportWidth) =>
  acotar(valor, PANEL_WIDTH_MIN, panelWidthMax(viewportWidth), PANEL_WIDTH_DEFAULT)

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
export const widthFromPointer = (clientX, panelLeft, viewportWidth) =>
  clampPanelWidth(clientX - panelLeft, viewportWidth)

/**
 * El tamaño guardado, devuelto a lo que cabe en **esta** pantalla.
 *
 * Es lo que faltaba. El tamaño se recuerda entre visitas, así que un panel
 * ajustado a gusto en un monitor de 2.560 px se abría igual de ancho en el
 * portátil de 1.366 y tapaba el mapa entero —o se salía—. Lo mismo al conectar o
 * desconectar una pantalla sin recargar. Los topes de arriba dependen de la
 * ventana, así que la única forma de que el valor guardado siga significando algo
 * es volver a acotarlo contra la ventana de ahora.
 *
 * No se guarda el resultado: lo que el usuario eligió sigue siendo suyo, y al
 * volver a la pantalla grande el panel vuelve a su ancho. Se acota al usarlo, no
 * al leerlo.
 */
export const fitPanelToViewport = ({ width, height }, viewportWidth) => ({
  width: clampPanelWidth(width, viewportWidth),
  height: clampPanelHeight(height),
})

/** Lo mismo para el alto, en fracción de la altura de la ventana. */
export const heightFromPointer = (clientY, panelTop, viewportHeight) => {
  if (!(viewportHeight > 0)) return PANEL_HEIGHT_DEFAULT
  return clampPanelHeight((clientY - panelTop) / viewportHeight)
}
