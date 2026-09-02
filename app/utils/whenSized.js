/**
 * Esperar a que un elemento mida algo antes de montarle nada encima.
 *
 * ## Por qué existe
 *
 * El visor no abría en el teléfono. Reventaba al arrancar, antes de dibujar
 * nada, con un error que no decía dónde:
 *
 *     TypeError: Cannot read properties of undefined (reading '0')
 *       at t.screenPointToMercatorCoordinateAtZ
 *       at oe.unproject
 *       at od.onAdd
 *       at oe.addControl
 *
 * La causa está dentro de MapLibre y es de una línea. Su `_calcMatrices()`
 * empieza con `if (this._width && this._height)`: **con el contenedor a cero no
 * calcula la matriz de proyección y la deja sin definir**. Eso por sí solo no
 * rompe nada —el mapa la recalcula en cuanto crece—, pero la barra de escala se
 * engancha en `addControl` y lo primero que hace es preguntar por unas
 * coordenadas de pantalla. Le pasa `undefined` a la multiplicación de matrices,
 * y ahí muere el arranque entero.
 *
 * Así que el mapa no se construye hasta que el contenedor tenga alto y ancho. Y
 * si todavía no los tiene, se espera: un `ResizeObserver` avisa en cuanto los
 * consiga.
 *
 * ## Por qué esperar y no medir una sola vez
 *
 * Porque no sabemos por qué medía cero. Un contenedor puede nacer sin tamaño por
 * media docena de motivos —la pestaña abierta en segundo plano, un padre
 * escondido, la barra del navegador móvil que aún no se ha asentado, una fuente
 * que todavía no cargó— y todos se arreglan solos un instante después.
 * Comprobarlo una vez y rendirse dejaría la pantalla en blanco; esperar cuesta
 * un observador y funciona en todos los casos.
 *
 * Es además la tercera vez que este contenedor se queda a cero de alto: ver el
 * comentario de `h-full w-full` en `MapComponentGL`, que documenta la vez que el
 * CSS de MapLibre le pisaba el `position` a Tailwind.
 *
 * Módulo puro salvo por el `ResizeObserver`, que es lo que viene a envolver.
 *
 * @param {HTMLElement} elemento el que tiene que medir algo
 * @param {() => void} alTenerTamano se llama **una sola vez**, cuando lo mida
 * @returns {() => void} para dejar de esperar
 */
export const whenSized = (elemento, alTenerTamano) => {
  if (!elemento || typeof alTenerTamano !== "function") return () => {}

  const mide = () => elemento.clientWidth > 0 && elemento.clientHeight > 0

  // Si ya mide, no se monta ningún observador: el caso normal no paga nada.
  if (mide()) {
    alTenerTamano()
    return () => {}
  }

  // Sin `ResizeObserver` —navegadores de antes de 2020— se avisa igualmente. Es
  // preferible arrancar y arriesgarse a que el mapa nazca torcido que no
  // arrancar nunca: el mapa se recompone solo al primer movimiento, y la
  // pantalla en blanco no se recompone sola.
  if (typeof ResizeObserver !== "function") {
    alTenerTamano()
    return () => {}
  }

  let avisado = false
  const observador = new ResizeObserver(() => {
    if (avisado || !mide()) return
    avisado = true
    // Se deja de observar antes de avisar: quien recibe el aviso va a construir
    // un mapa que cambia el tamaño del propio elemento, y eso volvería a
    // disparar al observador en mitad de la construcción.
    observador.disconnect()
    alTenerTamano()
  })
  observador.observe(elemento)

  return () => observador.disconnect()
}
