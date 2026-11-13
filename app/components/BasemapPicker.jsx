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
    className="w-[290px] max-h-[calc(100vh-5rem)] overflow-y-auto overscroll-contain rounded-2xl border glass-strong p-2.5 text-foreground select-none"
  >
    <div className="mb-2 flex items-center justify-between border-b border-border px-1 pb-2">
      <div className="flex items-center gap-1.5">
        <span className="eyebrow">
          Mapa base
        </span>
        <span className="rounded bg-fill-strong px-1.5 py-0.5 text-[9px] tabular-nums font-medium text-label-3">
          6 estilos
        </span>
      </div>
      {onClose && (
        <button
          type="button"
          onClick={onClose}
          aria-label="Cerrar selector de mapa base"
          title="Cerrar"
          className="rounded-lg p-1 text-label-3 transition-colors hover:bg-fill-strong hover:text-foreground"
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
                ? "border border-transparent bg-primary/10 text-foreground"
                : "border border-transparent text-label-2 hover:bg-fill-strong/70 hover:text-foreground"
            }`}
          >
            <span
              className={`flex h-4 w-4 shrink-0 items-center justify-center rounded-full ${
                elegido ? "bg-primary text-primary-foreground" : "border border-input bg-fill/70"
              }`}
            >
              {elegido && <Check className="h-3 w-3" />}
            </span>

            <span className="min-w-0 flex-1">
              <span className="flex items-baseline gap-1.5">
                <span className="text-[13px] font-medium text-foreground">{basemap.name}</span>
                <span className="text-[10px] text-label-4">{basemap.source}</span>
              </span>
              <span className="mt-0.5 block text-[11px] leading-tight text-label-3">
                {basemap.hint}
              </span>
            </span>

            {/* Distintivo de etiquetas / nombres para capas alternables */}
            {elegido && alterna && (
              <span
                className={`flex shrink-0 items-center gap-1 rounded-md px-1.5 py-1 text-[10px] font-semibold ${
                  conNombres
                    ? "bg-label-5/50 text-foreground border border-input"
                    : "bg-fill text-label-4 border border-border line-through"
                }`}
              >
                <Type className="h-3 w-3" />
                Aa
              </span>
            )}
            {elegido && hasFixedLabels(basemap.id) && (
              <span className="shrink-0 text-[10px] leading-tight text-label-4">
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
