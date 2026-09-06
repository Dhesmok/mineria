"use client"

import { Check, Type, X } from "lucide-react"

import { BASEMAPS, hasFixedLabels, supportsLabelToggle } from "../utils/basemaps"

/**
 * Elegir el mapa de fondo.
 *
 * Desplegado de forma compacta junto al botón «Mapa base» con animación de
 * encogimiento/despliegue fluido en la esquina inferior derecha.
 *
 * **Pulsar el fondo que ya está puesto quita o pone sus nombres.** Es la idea de
 * Fabio y evita un segundo botón que estaría apagado casi siempre. Para que no
 * haya que descubrirlo, la fila del fondo elegido muestra un distintivo «Aa»
 * —encendido o apagado— y dice qué va a pasar al volver a pulsarla.
 */
export const BasemapPicker = ({ current, showLabels, onChoose, onClose }) => (
  <div
    role="dialog"
    aria-label="Selector de mapa base"
    className="w-[290px] max-h-[calc(100vh-5rem)] overflow-y-auto overscroll-contain rounded-2xl border border-zinc-800/90 bg-[#09090b]/95 p-2.5 text-zinc-100 shadow-2xl backdrop-blur-2xl select-none"
  >
    <div className="mb-2 flex items-center justify-between border-b border-zinc-800/80 px-1 pb-2">
      <div className="flex items-center gap-1.5">
        <span className="text-[11px] font-semibold uppercase tracking-wider text-zinc-300">
          Mapa base
        </span>
        <span className="rounded bg-zinc-800/80 px-1.5 py-0.5 text-[9px] font-mono font-medium text-zinc-400">
          6 estilos
        </span>
      </div>
      {onClose && (
        <button
          type="button"
          onClick={onClose}
          aria-label="Cerrar selector de mapa base"
          title="Cerrar"
          className="rounded-lg p-1 text-zinc-400 transition-colors hover:bg-zinc-800 hover:text-white"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      )}
    </div>

    <div className="space-y-1">
      {BASEMAPS.map((basemap) => {
        const elegido = basemap.id === current
        const conNombres = elegido ? showLabels : true
        const alterna = supportsLabelToggle(basemap.id)

        return (
          <button
            key={basemap.id}
            type="button"
            onClick={() => onChoose(basemap.id)}
            aria-pressed={elegido}
            title={
              elegido && alterna
                ? conNombres
                  ? "Pulsa otra vez para quitar los nombres"
                  : "Pulsa otra vez para poner los nombres"
                : `Usar ${basemap.name}`
            }
            className={`flex w-full items-center gap-2.5 rounded-xl px-2.5 py-2 text-left transition-colors ${
              elegido
                ? "bg-zinc-800 text-white border border-zinc-700 shadow-sm"
                : "border border-transparent text-zinc-300 hover:bg-zinc-800/60 hover:text-white"
            }`}
          >
            <span
              className={`flex h-4 w-4 shrink-0 items-center justify-center rounded-full ${
                elegido ? "bg-white text-zinc-950" : "border border-zinc-700 bg-zinc-900/50"
              }`}
            >
              {elegido && <Check className="h-3 w-3" />}
            </span>

            <span className="min-w-0 flex-1">
              <span className="flex items-baseline gap-1.5">
                <span className="text-[13px] font-medium text-white">{basemap.name}</span>
                <span className="text-[10px] text-zinc-500">{basemap.source}</span>
              </span>
              <span className="mt-0.5 block text-[11px] leading-tight text-zinc-400">
                {basemap.hint}
              </span>
            </span>

            {/* Distintivo de etiquetas / nombres para capas alternables */}
            {elegido && alterna && (
              <span
                className={`flex shrink-0 items-center gap-1 rounded-md px-1.5 py-1 text-[10px] font-semibold ${
                  conNombres
                    ? "bg-zinc-700 text-white border border-zinc-600"
                    : "bg-zinc-900 text-zinc-500 border border-zinc-800 line-through"
                }`}
              >
                <Type className="h-3 w-3" />
                Aa
              </span>
            )}
            {elegido && hasFixedLabels(basemap.id) && (
              <span className="shrink-0 text-[10px] leading-tight text-zinc-500">
                nombres
                <br />
                fijos
              </span>
            )}
          </button>
        )
      })}
    </div>
  </div>
)
