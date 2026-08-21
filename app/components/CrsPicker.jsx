"use client"

import { useEffect, useRef } from "react"
import { Check, X } from "lucide-react"

import { CRS_LIST } from "../utils/crs"

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
export const CrsPicker = ({ current, onChoose, onClose, anchorRect }) => {
  const panelRef = useRef(null)

  useEffect(() => {
    const fuera = (event) => {
      if (!panelRef.current?.contains(event.target)) onClose()
    }
    const escape = (event) => {
      if (event.key === "Escape") onClose()
    }
    document.addEventListener("mousedown", fuera, true)
    document.addEventListener("keydown", escape)
    return () => {
      document.removeEventListener("mousedown", fuera, true)
      document.removeEventListener("keydown", escape)
    }
  }, [onClose])

  const top = Math.min(anchorRect?.bottom ?? 0, window.innerHeight - 440) + 6
  const left = Math.min(anchorRect?.left ?? 0, window.innerWidth - 320)

  return (
    <div
      ref={panelRef}
      role="dialog"
      aria-label="Elegir el sistema de coordenadas"
      style={{ top: Math.max(12, top), left: Math.max(12, left) }}
      className="fixed z-50 max-h-[70vh] w-[20rem] overflow-y-auto rounded-xl border border-slate-200 bg-white shadow-xl"
    >
      <div className="sticky top-0 flex items-center gap-2 border-b border-slate-200 bg-white px-3 py-2.5">
        <span className="text-[13px] font-semibold text-slate-900">Sistema de coordenadas</span>
        <span className="flex-1" />
        <button
          type="button"
          onClick={onClose}
          aria-label="Cerrar"
          className="rounded p-1 text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-700"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </div>

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
                elegido ? "bg-slate-100" : "hover:bg-slate-50"
              }`}
            >
              <span
                className={`mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full ${
                  elegido ? "bg-slate-900 text-white" : "border border-slate-300"
                }`}
              >
                {elegido && <Check className="h-3 w-3" />}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-[13px] font-medium text-slate-900">{crs.label}</span>
                <span className="mt-0.5 block text-[11px] leading-tight text-slate-500">
                  {crs.hint}
                </span>
              </span>
              <span className="shrink-0 font-mono text-[10px] text-slate-400">EPSG:{crs.id}</span>
            </button>
          )
        })}
      </div>
    </div>
  )
}
