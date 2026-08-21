"use client"

import { ACCURACY_WARNING } from "../utils/terrainAnalysis"
import { SLOPE_LEGEND } from "../utils/slopeRaster"

/**
 * La leyenda de la capa de pendiente.
 *
 * Sin leyenda, una capa de colores es una mancha bonita: nadie puede decir si el
 * amarillo son diez grados o cuarenta. Y los tramos no son una escala continua
 * repartida a ojo, son los umbrales con los que se lee un terreno —de dónde se
 * transita sin obra a dónde hay que cortar—, así que cada uno lleva su nombre
 * además de su rango.
 *
 * Cuando la capa no se puede dibujar, esto es lo que dice por qué. Es preferible
 * a apagar el botón sin explicación: el usuario ya pidió ver la pendiente y
 * merece saber qué falta para verla.
 */
export const SlopeLegend = ({ unavailable }) => (
  <div className="w-[min(13rem,calc(100vw-1.5rem))] overflow-hidden rounded-lg border border-slate-200 bg-white shadow-lg">
    <p className="border-b border-slate-100 bg-slate-50 px-2.5 py-1.5 text-[11px] font-medium text-slate-600">
      Pendiente del terreno
    </p>

    {unavailable ? (
      <p className="px-2.5 py-2 text-[11px] leading-tight text-slate-500">{unavailable}</p>
    ) : (
      <div className="space-y-1 px-2.5 py-2">
        {SLOPE_LEGEND.map(({ label, hint, color }) => (
          <div key={label} className="flex items-center gap-2">
            <span
              className="h-3 w-5 shrink-0 rounded-[3px]"
              style={{ backgroundColor: `rgb(${color.join(",")})` }}
            />
            <span className="flex-1 text-[11px] tabular-nums text-slate-700">{label}</span>
            <span className="text-[10px] text-slate-400">{hint}</span>
          </div>
        ))}
      </div>
    )}

    <p className="border-t border-slate-100 bg-amber-50 px-2.5 py-1.5 text-[10px] leading-tight text-amber-900">
      {ACCURACY_WARNING}
    </p>
  </div>
)
