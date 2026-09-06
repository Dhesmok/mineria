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
export const ColorPopover = ({
  color = "#3b82f6",
  alpha = 1,
  onChange,
  onAlphaChange,
  onClose,
  anchorRect,
  anchorEl,
}) => {
  const panelRef = useRef(null)
  useDismiss(panelRef, anchorEl, onClose)

  const top = Math.min((anchorRect?.bottom ?? 0) + 6, window.innerHeight - 260)
  const left = Math.min(anchorRect?.left ?? 0, window.innerWidth - 240)

  return (
    <div
      ref={panelRef}
      role="dialog"
      aria-label="Elegir el color de la capa"
      style={{ top, left }}
      className="fixed z-50 w-60 rounded-xl border border-zinc-800/90 bg-[#09090b]/95 p-3.5 text-zinc-100 shadow-2xl backdrop-blur-2xl"
    >
      <div className="mb-2.5 flex items-center justify-between">
        <p className="text-[11px] font-semibold uppercase tracking-wider text-zinc-400">
          Color y opacidad
        </p>
        <span
          className="h-4 w-6 rounded border border-zinc-700/80"
          style={{ backgroundColor: color, opacity: Math.max(alpha, 0.2) }}
        />
      </div>

      <div className="grid grid-cols-6 gap-1.5">
        {LAYER_PALETTE.map((swatch) => {
          const elegido = swatch.toLowerCase() === String(color).toLowerCase()
          return (
            <button
              key={swatch}
              type="button"
              onClick={() => onChange?.(swatch)}
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

      <div className="mt-3 flex items-center justify-between border-t border-zinc-800/80 pt-2.5 text-[11px] text-zinc-400">
        <span>Color personalizado</span>
        <div className="flex items-center gap-1.5">
          <input
            type="color"
            value={color && color.startsWith("#") && color.length === 7 ? color : "#3b82f6"}
            onChange={(event) => onChange?.(event.target.value)}
            className="h-6 w-8 cursor-pointer rounded border border-zinc-700 bg-zinc-900 p-0.5"
            aria-label="Elegir un color exacto"
          />
          <span className="font-mono text-[10px] text-zinc-300 uppercase">{color}</span>
        </div>
      </div>

      {onAlphaChange && (
        <div className="mt-2.5 border-t border-zinc-800/80 pt-2 text-[11px] text-zinc-400">
          <div className="mb-1 flex items-center justify-between">
            <span>Transparencia</span>
          </div>
          <input
            type="range"
            min="0.05"
            max="1"
            step="0.05"
            value={alpha}
            onChange={(event) => onAlphaChange(parseFloat(event.target.value))}
            className="h-1.5 w-full cursor-pointer appearance-none rounded-lg bg-zinc-800 accent-zinc-200"
            aria-label="Ajustar transparencia"
          />
        </div>
      )}
    </div>
  )
}
