"use client"

import { useRef } from "react"
import { Check } from "lucide-react"

import { useDismiss } from "../hooks/useDismiss"

import { CRS_LIST } from "../utils/crs"
import { anchorToViewport, popoverWidth } from "../utils/popoverPosition"

/**
 * Elegir el sistema de coordenadas.
 *
 * Era una lista desplegable con su texto de ayuda debajo, y entre las dos cosas
 * gastaban tres renglones del panel para un ajuste que se toca una vez y se deja
 * puesto. Ahora es un botón que dice cuál está elegido y abre esta ventana.
 *
 * Aquí sí cabe la explicación de cada sistema, que es donde hace falta: en el
 * momento de elegir, no permanentemente en el panel.
 */
export const CrsPicker = ({ current, onChoose, onClose, anchorRect, anchorEl }) => {
  const panelRef = useRef(null)
  useDismiss(panelRef, anchorEl, onClose)

  const { top, left } = anchorToViewport(
    anchorRect,
    { width: popoverWidth(320, window.innerWidth), height: Math.min(440, window.innerHeight * 0.7) },
    { width: window.innerWidth, height: window.innerHeight },
  )

  return (
    <div
      ref={panelRef}
      role="dialog"
      aria-label="Elegir el sistema de coordenadas"
      style={{ top, left }}
      className="fixed z-50 max-h-[70vh] w-[min(20rem,calc(100vw-1.5rem))] overflow-y-auto rounded-xl border border-zinc-800 bg-[#09090b]/95 text-zinc-100 shadow-2xl backdrop-blur-2xl"
    >
      <div className="p-1.5">
        {CRS_LIST.map((crs) => {
          const elegido = crs.id === current
          return (
            <button
              key={crs.id}
              type="button"
              onClick={() => {
                onChoose(crs.id)
                onClose()
              }}
              aria-pressed={elegido}
              className={`flex w-full items-start gap-2.5 rounded-lg px-2.5 py-2 text-left transition-colors ${
                elegido ? "bg-zinc-800 text-white border border-zinc-700" : "hover:bg-zinc-800/50 text-zinc-300"
              }`}
            >
              <span
                className={`mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full ${
                  elegido ? "bg-white text-zinc-950" : "border border-zinc-700 bg-zinc-900/50"
                }`}
              >
                {elegido && <Check className="h-3 w-3" />}
              </span>
              <span className="min-w-0 flex-1">
                <span className={`block text-[13px] font-medium ${elegido ? "text-white" : "text-zinc-200"}`}>{crs.label}</span>
                <span className="mt-0.5 block text-[11px] leading-tight text-zinc-400">
                  {crs.hint}
                </span>
              </span>
              <span className="shrink-0 font-mono text-[10px] text-zinc-400">EPSG:{crs.id}</span>
            </button>
          )
        })}
      </div>
    </div>
  )
}
