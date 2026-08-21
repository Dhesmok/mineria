"use client"

import { useRef } from "react"

import { useDismiss } from "../hooks/useDismiss"
import { Check } from "lucide-react"

import { LAYER_PALETTE, darken, readableInk } from "../utils/colors"

/**
 * Selector de color de una capa.
 *
 * Sale al pulsar la muestra de color de la fila, anclado a ella. Ofrece una
 * paleta cerrada y, debajo, la rueda del sistema para quien quiera un color
 * exacto —el caso de quien tiene que respetar el color de un plano oficial—.
 *
 * Solo se elige un color, el del relleno: el del contorno se deriva
 * oscureciéndolo (ver utils/colors.js). Cada muestra se dibuja con esa misma
 * pareja, así que lo que se ve en el botón es exactamente lo que va a aparecer
 * en el mapa.
 */
export const ColorPopover = ({ color, onChange, onClose, anchorRect, anchorEl }) => {
  const panelRef = useRef(null)
  useDismiss(panelRef, anchorEl, onClose)

  // Se posiciona sobre la ventana y no dentro de la lista: la lista tiene
  // desplazamiento propio y `overflow` recorta cualquier cosa que asome, así que
  // dentro de ella el selector aparecería cortado por el borde del panel.
  const top = Math.min((anchorRect?.bottom ?? 0) + 6, window.innerHeight - 210)
  const left = Math.min(anchorRect?.left ?? 0, window.innerWidth - 232)

  return (
    <div
      ref={panelRef}
      role="dialog"
      aria-label="Elegir el color de la capa"
      style={{ top, left }}
      className="fixed z-50 w-56 rounded-lg border border-slate-200 bg-white p-3 shadow-xl"
    >
      <p className="mb-2 text-[11px] font-medium text-slate-500">Color de la capa</p>

      <div className="grid grid-cols-6 gap-1.5">
        {LAYER_PALETTE.map((swatch) => {
          const elegido = swatch.toLowerCase() === String(color).toLowerCase()
          return (
            <button
              key={swatch}
              type="button"
              onClick={() => onChange(swatch)}
              title={swatch}
              aria-label={`Usar el color ${swatch}`}
              aria-pressed={elegido}
              className="flex h-7 w-7 items-center justify-center rounded-md transition-transform hover:scale-110"
              style={{ backgroundColor: swatch, border: `1.5px solid ${darken(swatch, 0.35)}` }}
            >
              {elegido && <Check className="h-4 w-4" style={{ color: readableInk(swatch) }} />}
            </button>
          )
        })}
      </div>

      <label className="mt-3 flex items-center gap-2 border-t border-slate-100 pt-2.5 text-[11px] text-slate-500">
        <input
          type="color"
          value={color}
          onChange={(event) => onChange(event.target.value)}
          className="h-7 w-9 cursor-pointer rounded border border-slate-200 bg-white p-0.5"
          aria-label="Elegir un color exacto"
        />
        Otro color
      </label>
    </div>
  )
}
