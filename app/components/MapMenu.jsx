"use client"

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react"

import { useDismiss } from "../hooks/useDismiss"
import { anchorToSide } from "../utils/popoverPosition"

/**
 * Las ventanas que abren los botones del mapa.
 *
 * **Por qué existe.** La columna de la esquina llegó a tener diez botones, uno
 * debajo de otro, y en un teléfono ocupaba la pantalla entera. Además cada
 * ventana que abría alguno de ellos se había escrito por su cuenta: la de mapas
 * base traía su propio cálculo de posición con un alto puesto a ojo, y las del
 * panel de capas otro distinto. Convivían dos formas de hacer lo mismo, y
 * arreglar una no arreglaba la otra.
 *
 * Ahora los botones que son del mismo asunto se agrupan detrás de uno solo, y
 * todas las ventanas salen de aquí: misma posición, mismo borde, misma letra.
 *
 * **El alto se mide, no se calcula.** Es el fallo que ya se coló una vez: con el
 * alto estimado a partir del número de filas, bastaba una descripción de tres
 * renglones para que la cuenta se quedara corta y la última opción quedara fuera
 * de la pantalla.
 */

/** Aire que se le deja a la ventana contra el borde de la pantalla. */
const ALTO_MAXIMO = "calc(100vh - 1.5rem)"

/**
 * La ventana en sí, anclada al botón que la abrió.
 *
 * Se cierra al pulsar fuera o con Escape, como las demás de la aplicación.
 */
export const MapMenuPanel = ({ label, anchorRect, anchorEl, onClose, children, width = 260 }) => {
  const panelRef = useRef(null)
  const [medida, setMedida] = useState(null)

  useDismiss(panelRef, anchorEl, onClose)

  const medir = useCallback(() => {
    const nodo = panelRef.current
    if (!nodo) return
    setMedida({ width: nodo.offsetWidth, height: nodo.offsetHeight })
  }, [])

  // Antes de que el navegador pinte, para que nadie vea la ventana dar el salto
  // desde su posición de partida hasta la buena.
  useLayoutEffect(medir, [medir, children])

  useEffect(() => {
    window.addEventListener("resize", medir)
    return () => window.removeEventListener("resize", medir)
  }, [medir])

  // En el primer pintado todavía no hay medida. Se coloca contando con el ancho
  // declarado y un alto cualquiera, y se corrige en cuanto se conoce el de
  // verdad; con `useLayoutEffect` eso ocurre dentro del mismo fotograma.
  const posicion =
    typeof window === "undefined"
      ? { top: 0, left: 0 }
      : anchorToSide(anchorRect, medida ?? { width, height: 0 }, {
          width: window.innerWidth,
          height: window.innerHeight,
        })

  return (
    <div
      ref={panelRef}
      role="dialog"
      aria-label={label}
      style={{ ...posicion, width: `min(${width}px, calc(100vw - 1.5rem))`, maxHeight: ALTO_MAXIMO }}
      className="fixed z-50 overflow-y-auto overscroll-contain rounded-2xl border border-zinc-800 bg-[#09090b]/95 p-1.5 text-zinc-100 shadow-2xl backdrop-blur-2xl"
    >
      <p className="px-2.5 pb-1.5 pt-2 text-[10px] font-semibold uppercase tracking-wider text-zinc-400">
        {label}
      </p>
      {children}
    </div>
  )
}

/**
 * Una opción dentro de la ventana.
 *
 * Lleva su explicación debajo del nombre y sin recortar. Es la misma decisión
 * que en la lista de mapas base: la pista es lo único que dice para qué sirve
 * cada cosa, y cortada por la mitad no dice nada.
 *
 * Lo encendido se marca con el fondo oscuro de los botones del mapa, para que
 * «activo» se vea igual en todas partes.
 */
export const MapMenuItem = ({ icon: Icon, name, hint, active, badge, compact, ...props }) => (
  <button
    type="button"
    aria-pressed={active}
    // Recogida, la fila es solo el icono, así que el nombre tiene que seguir
    // estando en el nombre accesible y en el rótulo emergente: es lo único que
    // queda para saber qué hace.
    aria-label={name}
    title={hint ? `${name} — ${hint}` : name}
    {...props}
    className={`flex w-full items-center gap-2.5 rounded-xl px-2.5 py-2 text-left transition-colors disabled:cursor-not-allowed disabled:opacity-40 ${
      active ? "bg-zinc-800 text-white border border-zinc-700 font-medium shadow-sm" : "text-zinc-300 hover:bg-zinc-850 hover:text-white"
    }`}
  >
    {Icon && <Icon className="h-4 w-4 shrink-0 text-zinc-400" />}
    {/* Recogida no se esconde el texto, se deja de dibujar. Escondido con
        `sr-only` seguía habiendo un hueco entre el icono y el borde, y sobre
        todo seguía habiendo un `flex-1` que estiraba la fila: el panel se
        quedaba igual de ancho con los iconos solos y un vacío al lado. El nombre
        no se pierde, vive en `aria-label` y en el rótulo emergente. */}
    {!compact && (
      <span className="min-w-0 flex-1">
        <span className="block text-[13px] font-medium leading-tight">{name}</span>
        {hint && (
          <span
            className={`mt-0.5 block text-[11px] leading-tight ${
              active ? "text-zinc-300" : "text-zinc-400"
            }`}
          >
            {hint}
          </span>
        )}
      </span>
    )}
    {!compact && badge && (
      <span
        className={`shrink-0 rounded px-1.5 py-px text-[10px] font-semibold ${
          active ? "bg-white/20 text-white" : "bg-zinc-800 text-zinc-400 border border-zinc-700"
        }`}
      >
        {badge}
      </span>
    )}
  </button>
)

/** Un filete entre grupos de opciones dentro de la misma ventana. */
export const MapMenuSeparator = () => <div className="my-1 border-t border-zinc-800/80" />
