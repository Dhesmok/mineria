/**
 * Qué etiquetas se dibujan y cuáles no.
 *
 * **El problema.** Las etiquetas salían a partir del zoom 15 y por debajo de ahí
 * no salía ninguna, aunque los polígonos empiezan a cargarse en el 10. Entre
 * esos dos zooms se veían las figuras sin poder saber de qué expediente era
 * cada una: había que acercarse mucho para leer un código. El corte estaba en 15
 * por una razón real —a menos zoom las etiquetas se apiñaban hasta ser un
 * borrón—, pero un umbral fijo es una respuesta tosca: a zoom 12 un título de
 * 5.000 ha se lee perfectamente y uno de 20 ha no cabe, y el umbral trataba a
 * los dos igual.
 *
 * **La regla, en una frase: se etiqueta el polígono en el que la etiqueta cabe.**
 * Si el código no cabe dentro de la figura, la etiqueta se saldría por fuera y
 * señalaría a un sitio que no es. Eso hace que al alejarse desaparezcan primero
 * los títulos pequeños y queden los grandes, que es exactamente lo que uno
 * espera de un mapa, y que al acercarse vayan apareciendo los demás.
 *
 * **Y las que se pisan, se descartan.** Se colocan de mayor a menor superficie
 * en pantalla y se salta la que chocaría con una ya puesta: entre dos etiquetas
 * superpuestas no se lee ninguna de las dos, así que es mejor perder la más
 * pequeña. Es lo que MapLibre hace solo con sus capas `symbol`; aquí hay que
 * hacerlo a mano porque las etiquetas son marcadores HTML —ver `mapLabelsGL.js`
 * para el porqué de esa decisión—.
 *
 * Módulo puro: recibe una función para proyectar y devuelve qué dibujar. No
 * conoce MapLibre.
 */

/**
 * Tamaño de la caja de una etiqueta en pantalla.
 *
 * Es una medida aproximada de `.map-label` con un código tipo "ABC-12345": el
 * texto va a 10 px con relleno horizontal. Aproximada a propósito: medir cada
 * etiqueta de verdad obliga a insertarlas todas en el documento antes de saber
 * cuáles caben, que es justo el trabajo que esto quiere evitar.
 */
export const LABEL_WIDTH = 66
export const LABEL_HEIGHT = 18

/**
 * Tope de etiquetas simultáneas.
 *
 * Cada una es un marcador de MapLibre, y cada marcador es un nodo del documento
 * que hay que reposicionar en cada cuadro de la animación. Con el mapa girando
 * en bucle, mil marcadores se notan. Ciento cincuenta es más de lo que cabe
 * legible en una pantalla, así que el tope no quita nada que se fuera a ver.
 */
export const MAX_LABELS = 150

/** Holgura entre etiquetas: pegadas se leen como una sola palabra larga. */
const GAP = 4

const overlaps = (a, b) =>
  a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top

/**
 * Elige qué etiquetas dibujar.
 *
 * @param {Array<{anchor: number[], bbox: {west,south,east,north}|null}>} candidates
 *   una por figura; `anchor` es dónde iría la etiqueta y `bbox` el recuadro de
 *   la figura, los dos en grados
 * @param {Object} options
 * @param {(lngLat: number[]) => {x: number, y: number}} options.project
 *   de grados a píxeles de pantalla
 * @param {number} options.width  ancho del mapa en píxeles
 * @param {number} options.height alto del mapa en píxeles
 * @param {number} [options.maxLabels]
 * @returns {Array} el subconjunto de `candidates` que se debe dibujar
 */
export const selectVisibleLabels = (candidates, options) => {
  const { project, width, height, maxLabels = MAX_LABELS } = options ?? {}
  if (typeof project !== "function") return []

  const medidos = []

  for (const candidate of Array.isArray(candidates) ? candidates : []) {
    if (!candidate?.anchor || !candidate?.bbox) continue

    const punto = project(candidate.anchor)
    if (!punto || !Number.isFinite(punto.x) || !Number.isFinite(punto.y)) continue

    // Fuera de la pantalla, con un margen de una etiqueta para que no
    // parpadeen al asomar por el borde. En modo "toda la capa" esto importa: lo
    // cargado puede ser el país entero.
    if (punto.x < -LABEL_WIDTH || punto.x > width + LABEL_WIDTH) continue
    if (punto.y < -LABEL_HEIGHT || punto.y > height + LABEL_HEIGHT) continue

    const { west, south, east, north } = candidate.bbox
    const esquinaSO = project([west, south])
    const esquinaNE = project([east, north])
    if (!esquinaSO || !esquinaNE) continue

    const anchoPx = Math.abs(esquinaNE.x - esquinaSO.x)
    const altoPx = Math.abs(esquinaSO.y - esquinaNE.y)

    // Aquí está la regla de fondo: si el código no cabe dentro de la figura, la
    // etiqueta acabaría fuera de ella señalando a otro sitio.
    if (anchoPx < LABEL_WIDTH || altoPx < LABEL_HEIGHT) continue

    medidos.push({ candidate, punto, area: anchoPx * altoPx })
  }

  // De mayor a menor: cuando dos se pisan, sobrevive la figura más grande, que
  // es la que se estaba mirando.
  medidos.sort((a, b) => b.area - a.area)

  const colocadas = []
  const elegidas = []

  for (const { candidate, punto } of medidos) {
    if (elegidas.length >= maxLabels) break

    const caja = {
      left: punto.x - LABEL_WIDTH / 2 - GAP,
      right: punto.x + LABEL_WIDTH / 2 + GAP,
      top: punto.y - LABEL_HEIGHT / 2 - GAP,
      bottom: punto.y + LABEL_HEIGHT / 2 + GAP,
    }

    if (colocadas.some((otra) => overlaps(otra, caja))) continue

    colocadas.push(caja)
    elegidas.push(candidate)
  }

  return elegidas
}
