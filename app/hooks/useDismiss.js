"use client"

import { useEffect } from "react"

/**
 * Cerrar una ventana flotante al pulsar fuera o con Escape.
 *
 * Lo hacían por su cuenta la lista de mapas base, la de sistemas de coordenadas,
 * la de colores, la de filtros y el buscador, con cinco copias del mismo efecto.
 * Aquí está una sola vez, y con el arreglo que a las cinco les faltaba.
 *
 * **El arreglo: el botón que abrió la ventana no cuenta como «fuera».** Sin eso,
 * volver a pulsarlo no la cerraba, que es lo que uno espera de un botón que
 * despliega algo. Lo que pasaba es que el navegador entrega primero el
 * `mousedown` —que cerraba la ventana— y después el clic al botón, que la volvía
 * a abrir; entre las dos cosas no daba tiempo ni a ver el parpadeo, así que
 * parecía que el botón no respondiera. Pasando aquí el propio botón, su
 * `mousedown` se ignora y el clic que viene detrás encuentra la ventana todavía
 * abierta y la cierra: un interruptor de verdad.
 *
 * Se escucha en `mousedown` y en fase de captura porque algunas filas del panel
 * de capas detienen la propagación del clic para no encender la capa al tocar
 * sus controles.
 *
 * @param {{current: HTMLElement|null}} panelRef  la ventana
 * @param {HTMLElement|null} anchorEl  el botón que la abrió, si se conoce
 * @param {() => void} onClose
 */
export const useDismiss = (panelRef, anchorEl, onClose) => {
  useEffect(() => {
    const fuera = (event) => {
      if (panelRef.current?.contains(event.target)) return
      if (anchorEl?.contains?.(event.target)) return
      onClose()
    }
    const escape = (event) => {
      if (event.key === "Escape") onClose()
    }

    document.addEventListener("mousedown", fuera, true)
    // En táctil no hay `mousedown` hasta que el navegador decide emitir el clic
    // de compatibilidad, y con el control de dibujo puesto ese clic no llega
    // nunca. Sin esto, en el teléfono las ventanas no se cerraban al tocar el
    // mapa. Ver `utils/tapGesture.js` para el diagnóstico completo.
    document.addEventListener("touchstart", fuera, true)
    document.addEventListener("keydown", escape)
    return () => {
      document.removeEventListener("mousedown", fuera, true)
      document.removeEventListener("touchstart", fuera, true)
      document.removeEventListener("keydown", escape)
    }
  }, [panelRef, anchorEl, onClose])
}
