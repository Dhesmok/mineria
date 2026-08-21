/**
 * Dónde colocar una ventana anclada a un botón.
 *
 * Las tres ventanas del panel —filtros, buscador y sistema de coordenadas— se
 * abren pegadas al botón que las llama, y cada una traía su propia cuenta con
 * sus propios números escritos a mano. Con la misma cuenta repetida tres veces,
 * arreglar un desborde en una dejaba las otras dos igual de rotas; y de hecho
 * pasó: los tres clamps usaban 300 px de ancho mientras las ventanas medían 304,
 * y en un teléfono se salían cuatro píxeles por la derecha.
 *
 * Módulo puro: recibe medidas y devuelve dos números.
 */

/** Aire mínimo entre la ventana y el borde de la pantalla. */
const MARGIN = 12

/** Separación entre el botón y la ventana que abre. */
const GAP = 6

/**
 * @param {DOMRect|Object|null} anchorRect el recuadro del botón que la abre
 * @param {Object} size {width, height} de la ventana, en píxeles
 * @param {Object} viewport {width, height} de la pantalla
 * @returns {{top: number, left: number}} en píxeles, listos para `style`
 */
export const anchorToViewport = (anchorRect, size, viewport) => {
  const anchoVentana = size?.width ?? 0
  const altoVentana = size?.height ?? 0
  const anchoPantalla = viewport?.width ?? 0
  const altoPantalla = viewport?.height ?? 0

  // Debajo del botón, salvo que ahí abajo no quepa: entonces se sube lo justo.
  const arriba = (anchorRect?.bottom ?? 0) + GAP
  const top = Math.max(MARGIN, Math.min(arriba, altoPantalla - altoVentana - MARGIN))

  // Alineada con el borde izquierdo del botón, sin salirse por la derecha.
  const izquierda = anchorRect?.left ?? 0
  const left = Math.max(MARGIN, Math.min(izquierda, anchoPantalla - anchoVentana - MARGIN))

  return { top, left }
}

/**
 * El ancho real que va a tener una ventana declarada como
 * `min(preferido, pantalla − 2·margen)`, que es como están escritas las tres.
 *
 * Hace falta para clavar la posición: colocar contando con un ancho que no es el
 * que el navegador va a usar es exactamente el fallo que había.
 */
export const popoverWidth = (preferida, anchoPantalla) =>
  Math.min(preferida, Math.max(0, anchoPantalla - MARGIN * 2))
