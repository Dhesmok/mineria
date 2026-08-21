/**
 * Reconocer un toque en el mapa, en pantallas táctiles.
 *
 * **El problema, que costó encontrar.** En un teléfono, tocar un polígono no
 * abría su ficha: no pasaba nada, como si el dato no existiera. La causa es que
 * `mapbox-gl-draw` llama a `preventDefault()` en `touchend` para manejar sus
 * propios gestos, y cancelar ese evento impide que el navegador genere el clic
 * de compatibilidad que viene después. Sin ese clic, MapLibre nunca emite su
 * evento `click`, y todo lo que cuelga de él —la ficha del expediente, la
 * consulta de terreno— se queda mudo.
 *
 * Se comprobó quitando el control de dibujo del mapa en caliente: sin él,
 * `touchend` deja de estar cancelado, el clic aparece y la ficha se abre. Con él,
 * `touchend.defaultPrevented` es cierto y no hay clic. En el ratón nunca se notó
 * porque ahí no hay `touchend` de por medio.
 *
 * **La solución es no depender del clic en táctil**: se escuchan los toques
 * directamente y se decide aquí si fueron un toque o un arrastre. Lo que no se
 * puede hacer es pedirle a `mapbox-gl-draw` que deje de cancelar: ese
 * `preventDefault` es lo que le permite dibujar con el dedo.
 *
 * La decisión —¿esto fue un toque?— es una función pura y está probada; el
 * enganche a los eventos es el envoltorio mínimo alrededor de ella.
 *
 * **El punto se entrega como `[x, y]`, nunca como `{x, y}`.** Esto costó un bug
 * feo: `queryRenderedFeatures(punto, opciones)` mira si su primer argumento es
 * un punto o un arreglo, y si no lo es, **lo toma por las opciones y consulta la
 * pantalla entera**. No avisa de nada. El resultado era que en el teléfono tocar
 * cualquier sitio abría la ficha de algún expediente, hubiera o no un polígono
 * debajo: la consulta devolvía todos los de la pantalla y se abría el primero.
 * Es la misma clase de trampa que la del punto 2 de CLAUDE.md —una llamada que
 * en vez de fallar devuelve algo verosímil—.
 *
 * El arreglo, y no el `Point` de MapLibre, para que este módulo siga sin conocer
 * el motor de mapa: es la separación que hizo posible cambiar de Leaflet a
 * MapLibre sin reescribir la parte difícil.
 */

/**
 * Cuánto se puede mover el dedo y seguir contando como toque.
 *
 * Doce píxeles. Un dedo nunca se queda quieto del todo, así que cero no vale; y
 * más de eso ya es el principio de un arrastre del mapa, que no debe abrir nada.
 */
export const TAP_MAX_MOVE_PX = 12

/**
 * Cuánto puede durar. Medio segundo: por encima de eso es una pulsación
 * mantenida, que en un mapa suele ser el arranque de otro gesto.
 */
export const TAP_MAX_MS = 500

/**
 * ¿Estos dos instantes describen un toque?
 *
 * @param {{x: number, y: number, time: number}|null} start
 * @param {{x: number, y: number, time: number}|null} end
 * @returns {boolean}
 */
export const isTap = (start, end) => {
  if (!start || !end) return false
  if (end.time - start.time > TAP_MAX_MS) return false
  return Math.hypot(end.x - start.x, end.y - start.y) <= TAP_MAX_MOVE_PX
}

/**
 * Llama a `handler` cuando el usuario da un toque sobre el mapa.
 *
 * El manejador recibe lo mismo que recibiría de un clic de MapLibre —`point` en
 * píxeles del lienzo y `lngLat` en coordenadas—, para que quien lo use no tenga
 * que saber si vino de un dedo o de un ratón.
 *
 * Solo se atiende el primer dedo: con dos, el usuario está haciendo zoom o
 * girando, no señalando algo.
 *
 * @returns {() => void} función para desengancharlo
 */
export const onMapTap = (map, handler) => {
  const contenedor = map?.getCanvasContainer?.()
  if (!contenedor) return () => {}

  let inicio = null

  const puntoDe = (touch) => {
    const caja = map.getCanvas().getBoundingClientRect()
    return { x: touch.clientX - caja.left, y: touch.clientY - caja.top }
  }

  /**
   * ¿El dedo cayó sobre el mapa, o sobre algo que hay encima?
   *
   * La ficha del expediente, y cualquier marcador, **cuelgan del contenedor del
   * lienzo**, así que sus toques llegan hasta aquí igual que los del mapa. Sin
   * esta comprobación, tocar la propia ficha contaba como tocar el mapa: en un
   * teléfono la ficha tapa media pantalla, y debajo de ella está justo el
   * polígono que la abrió, así que no había forma de deshacerse de ella.
   */
  const sobreElMapa = (evento) => evento.target === map.getCanvas()

  const alEmpezar = (evento) => {
    if (evento.touches.length !== 1 || !sobreElMapa(evento)) {
      inicio = null
      return
    }
    const { x, y } = puntoDe(evento.touches[0])
    inicio = { x, y, time: evento.timeStamp }
  }

  const alTerminar = (evento) => {
    const touch = evento.changedTouches?.[0]
    if (!touch || !inicio) return

    const { x, y } = puntoDe(touch)
    const fin = { x, y, time: evento.timeStamp }
    const eraToque = isTap(inicio, fin)
    inicio = null
    if (!eraToque) return

    const point = [fin.x, fin.y]
    handler({ point, lngLat: map.unproject(point), originalEvent: evento })
  }

  contenedor.addEventListener("touchstart", alEmpezar, { passive: true })
  contenedor.addEventListener("touchend", alTerminar, { passive: true })

  return () => {
    contenedor.removeEventListener("touchstart", alEmpezar)
    contenedor.removeEventListener("touchend", alTerminar)
  }
}
