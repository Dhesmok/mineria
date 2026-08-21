"use client"

import { Check, Type } from "lucide-react"

import { BASEMAPS, hasFixedLabels, supportsLabelToggle } from "../utils/basemaps"
import { MapMenuPanel } from "./MapMenu"

/**
 * Elegir el mapa de fondo.
 *
 * Sale del botón «Mapa base», que antes se llamaba «Satélite» y alternaba entre
 * dos. Con seis fondos, un botón que va rotando obliga a pasar por todos para
 * llegar al que se quiere; una lista los enseña de golpe.
 *
 * **Pulsar el fondo que ya está puesto quita o pone sus nombres.** Es la idea de
 * Fabio y evita un segundo botón que estaría apagado casi siempre. Para que no
 * haya que descubrirlo, la fila del fondo elegido muestra un distintivo «Aa»
 * —encendido o apagado— y dice qué va a pasar al volver a pulsarla.
 *
 * En OSM y OpenTopoMap los nombres vienen pintados dentro de la tesela y no se
 * pueden quitar. Ahí no se ofrece el distintivo: se dice que son fijos, en vez
 * de dar un interruptor que no haría nada. Y en el fondo vacío no se dice nada,
 * porque no hay nombres de los que hablar.
 *
 * La ventana, su posición y su cierre son los de `MapMenuPanel`, como las de los
 * demás botones del mapa; aquí solo viven las filas, que sí son distintas.
 */
export const BasemapPicker = ({ current, showLabels, onChoose, onClose, anchorRect, anchorEl }) => (
  <MapMenuPanel
    label="Mapa base"
    anchorRect={anchorRect}
    anchorEl={anchorEl}
    onClose={onClose}
    width={288}
  >
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
          className={`flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left transition-colors ${
            elegido ? "bg-slate-100" : "hover:bg-slate-50"
          }`}
        >
          <span
            className={`flex h-4 w-4 shrink-0 items-center justify-center rounded-full ${
              elegido ? "bg-slate-900 text-white" : "border border-slate-300"
            }`}
          >
            {elegido && <Check className="h-3 w-3" />}
          </span>

          <span className="min-w-0 flex-1">
            <span className="flex items-baseline gap-1.5">
              <span className="text-[13px] font-medium text-slate-900">{basemap.name}</span>
              <span className="text-[10px] text-slate-400">{basemap.source}</span>
            </span>
            {/* Sin recortar: la pista es lo único que explica para qué sirve
                cada fondo, y cortada por la mitad —«Hasta zo…»— no explica
                nada. Que ocupe dos renglones sale más barato que eso. */}
            <span className="mt-0.5 block text-[11px] leading-tight text-slate-500">
              {basemap.hint}
            </span>
          </span>

          {/* El distintivo de los nombres. Solo en el fondo elegido: en los
              demás no hay estado que enseñar todavía. */}
          {elegido && alterna && (
            <span
              className={`flex shrink-0 items-center gap-1 rounded-md px-1.5 py-1 text-[10px] font-semibold ${
                conNombres ? "bg-slate-900 text-white" : "bg-slate-200 text-slate-500 line-through"
              }`}
            >
              <Type className="h-3 w-3" />
              Aa
            </span>
          )}
          {/* «Nombres fijos» solo donde hay nombres. En el fondo vacío no los
              hay, y anunciarlos ahí era decir algo falso. */}
          {elegido && hasFixedLabels(basemap.id) && (
            <span className="shrink-0 text-[10px] leading-tight text-slate-400">
              nombres
              <br />
              fijos
            </span>
          )}
        </button>
      )
    })}
  </MapMenuPanel>
)
