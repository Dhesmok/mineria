"use client"

import { ACCURACY_WARNING } from "../utils/terrainAnalysis"
import { ASPECT_LEGEND, SLOPE_LEGEND } from "../utils/terrainRaster"

/**
 * La leyenda de la capa derivada del terreno.
 *
 * Sin leyenda, una capa de colores es una mancha bonita: nadie puede decir si el
 * amarillo son diez grados o cuarenta. Y los tramos de la pendiente no son una
 * escala repartida a ojo, son los umbrales con los que se lee un terreno —de
 * dónde se transita sin obra a dónde hay que cortar—, así que cada uno lleva su
 * nombre además de su rango.
 *
 * Cuando la capa no se puede dibujar, esto es lo que dice por qué. Es preferible
 * a apagar el botón sin explicación: el usuario ya pidió verla y merece saber
 * qué falta.
 *
 * **Y dice el tamaño de la celda**, que es lo que separa este dato de una mancha
 * de colores. Una pendiente de 28° medida sobre celdas de 19 m y la misma medida
 * sobre celdas de 150 m no son el mismo número con distinto detalle: son
 * respuestas a preguntas distintas. Un SIG lo tiene en las propiedades de la
 * capa; aquí no hay dónde ir a mirarlo, así que va a la vista.
 */

const TITULOS = {
  slope: "Pendiente del terreno",
  aspect: "Orientación de la ladera",
}

export const TerrainRasterLegend = ({ mode, unavailable, progress, cellSize }) => {
  const tramos = mode === "aspect" ? ASPECT_LEGEND.slice(0, 8) : SLOPE_LEGEND
  const cargando = Boolean(progress && progress.total > 0 && progress.hechas < progress.total)
  const porcentaje = cargando ? Math.round((progress.hechas / progress.total) * 100) : 100

  return (
    <div className="w-[min(13rem,calc(100vw-1.5rem))] overflow-hidden rounded-lg border border-slate-200 bg-white shadow-lg">
      <p className="flex items-baseline justify-between gap-2 border-b border-slate-100 bg-slate-50 px-2.5 py-1.5 text-[11px] font-medium text-slate-600">
        <span>{TITULOS[mode] ?? "Terreno"}</span>
        {/* El tamaño de celda solo aparece cuando ya hay capa pintada: durante la
            carga todavía puede cambiar, si el área obliga a bajar un nivel. */}
        {!unavailable && !cargando && cellSize ? (
          <span className="shrink-0 text-[10px] font-normal tabular-nums text-slate-400">
            celdas {Math.round(cellSize)} m
          </span>
        ) : null}
      </p>

      {/* El aviso de progreso.
          No es decoración: bajar cuarenta teselas por primera vez tarda lo que
          tarde la red, y sin esto la capa parecería colgada. Al volver sobre una
          zona ya vista ni se llega a ver, porque las teselas están guardadas. */}
      {cargando && !unavailable ? (
        <div className="px-2.5 py-2">
          <div className="flex items-baseline justify-between gap-2 text-[11px] text-slate-600">
            <span>Cargando el modelo…</span>
            <span className="tabular-nums text-slate-400">
              {progress.hechas}/{progress.total}
            </span>
          </div>
          <div className="mt-1.5 h-1 overflow-hidden rounded-full bg-slate-100">
            <div
              className="h-full rounded-full bg-slate-400 transition-[width] duration-200"
              style={{ width: `${porcentaje}%` }}
            />
          </div>
        </div>
      ) : unavailable ? (
        <p className="px-2.5 py-2 text-[11px] leading-tight text-slate-500">{unavailable}</p>
      ) : (
        <div
          // La orientación son ocho tramos: en una sola columna la leyenda mide
          // más que la ventana del 3D que tiene al lado. En dos columnas cabe.
          className={`gap-x-3 gap-y-1 px-2.5 py-2 ${
            mode === "aspect" ? "grid grid-cols-2" : "space-y-1"
          }`}
        >
          {tramos.map(({ label, hint, color }) => (
            <div key={label} className="flex items-center gap-2">
              <span
                className="h-3 w-5 shrink-0 rounded-[3px]"
                style={{ backgroundColor: `rgb(${color.join(",")})` }}
              />
              <span className="flex-1 text-[11px] tabular-nums text-slate-700">{label}</span>
              {mode !== "aspect" && <span className="text-[10px] text-slate-400">{hint}</span>}
            </div>
          ))}
        </div>
      )}

      <p className="border-t border-slate-100 bg-amber-50 px-2.5 py-1.5 text-[10px] leading-tight text-amber-900">
        {ACCURACY_WARNING}
      </p>
    </div>
  )
}
