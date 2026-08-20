/**
 * Reordenar una lista arrastrando.
 *
 * La lista de capas activas es también el orden en que se pintan en el mapa: lo
 * primero de la lista va encima de todo. Mover un elemento es una operación
 * pequeña pero fácil de equivocar por uno —el clásico error de quitar antes de
 * calcular el destino—, así que vive aquí, aparte y con pruebas, en vez de
 * dentro de un manejador de eventos donde nadie la puede comprobar.
 *
 * Módulo puro.
 */

/**
 * Mueve el elemento de la posición `from` a la posición `to`.
 *
 * `to` se interpreta sobre la lista **ya sin** el elemento movido, que es como
 * lo entiende quien arrastra: "quiero que quede el tercero". Devuelve una lista
 * nueva; la original no se toca.
 */
export const moveItem = (list, from, to) => {
  const items = Array.isArray(list) ? [...list] : []
  if (from < 0 || from >= items.length) return items

  const destino = Math.min(Math.max(to, 0), items.length - 1)
  if (destino === from) return items

  const [movido] = items.splice(from, 1)
  items.splice(destino, 0, movido)
  return items
}

/**
 * Reordena solo una parte de la lista, dejando el resto donde estaba.
 *
 * Hace falta porque el usuario arrastra en la vista de capas *activas*, que es
 * un subconjunto de todas: mueve la tercera activa a la primera, no "la tercera
 * de trece". Las apagadas conservan su sitio, así que al volver a encender una
 * reaparece donde el usuario la había dejado y no al final de la pila.
 *
 * @param {string[]} order lista completa
 * @param {string[]} subset los elementos visibles, en el mismo orden que en `order`
 * @param {number} from posición dentro del subconjunto
 * @param {number} to posición de destino dentro del subconjunto
 */
export const moveWithinSubset = (order, subset, from, to) => {
  const pertenece = new Set(subset)
  const huecos = []
  order.forEach((key, index) => {
    if (pertenece.has(key)) huecos.push(index)
  })

  const reordenado = moveItem(subset, from, to)
  const resultado = [...order]
  huecos.forEach((hueco, i) => {
    resultado[hueco] = reordenado[i]
  })
  return resultado
}

/**
 * En qué posición caería el puntero, dadas las cajas de cada fila.
 *
 * Se compara contra el centro de cada fila y no contra su borde: soltar en la
 * mitad superior de una fila significa "encima de ella", y en la inferior,
 * "debajo". Con los bordes, el elemento se quedaba siempre un puesto corto.
 *
 * @param {number} pointerY posición vertical del puntero, en píxeles de pantalla
 * @param {Array<{top: number, height: number}>} rects cajas de las filas, en orden
 * @returns {number} índice de destino
 */
export const indexForPointer = (pointerY, rects) => {
  if (!Array.isArray(rects) || rects.length === 0) return 0

  for (let i = 0; i < rects.length; i += 1) {
    const { top, height } = rects[i]
    if (pointerY < top + height / 2) return i
  }
  return rects.length - 1
}
