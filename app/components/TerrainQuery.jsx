"use client"

import { MountainSnow, X } from "lucide-react"

import { ACCURACY_WARNING } from "../utils/terrainAnalysis"

/**
 * La respuesta de una consulta puntual al terreno.
 *
 * Cota, pendiente y orientación en el punto que se acaba de pulsar. De las tres
 * cosas que se pueden sacar del modelo de elevación, esta es la que de verdad se
 * usa en campo y la más barata: no hay que recorrer nada, solo mirar las nueve
 * alturas de alrededor.
 *
 * **Los dos avisos no son letra pequeña, y por eso salen dentro de la tarjeta.**
 *
 * El primero es la resolución: con un modelo global de 30 m estos números sirven
 * para leer el terreno y descartar zonas, y no para un diseño de banco ni para
 * un cálculo de estabilidad. El segundo es el dátum de la altura: los modelos
 * globales dan alturas elipsoidales, y una cota ortométrica —la que aparece en
 * un plano— se saca aplicando geoide. En Colombia la diferencia ronda los 25 m,
 * que es mucho más de lo que nadie perdonaría en una cota.
 */

const Fila = ({ label, value, hint }) => (
  <div className="flex items-baseline justify-between gap-3 border-b border-slate-100 py-1.5 last:border-b-0">
    <span className="text-[11px] text-slate-500">{label}</span>
    <span className="text-right">
      <span className="block text-[13px] font-medium tabular-nums text-slate-900">{value}</span>
      {hint && <span className="block text-[10px] leading-tight text-slate-400">{hint}</span>}
    </span>
  </div>
)

export const TerrainQuery = ({ result, onClose }) => (
  <div className="w-[min(15rem,calc(100vw-1.5rem))] overflow-hidden rounded-lg border border-slate-200 bg-white shadow-lg">
    <div className="flex items-center gap-1.5 border-b border-slate-100 bg-slate-50 px-2.5 py-1.5">
      <MountainSnow className="h-3.5 w-3.5 shrink-0 text-slate-400" />
      <span className="flex-1 text-[11px] font-medium text-slate-600">Terreno en el punto</span>
      <button
        type="button"
        onClick={onClose}
        aria-label="Cerrar la consulta de terreno"
        className="rounded p-0.5 text-slate-400 transition-colors hover:bg-slate-200 hover:text-slate-700"
      >
        <X className="h-3.5 w-3.5" />
      </button>
    </div>

    <div className="px-2.5 py-1">
      {result === null ? (
        <p className="py-2 text-[11px] leading-tight text-slate-500">
          Pulsa en el mapa para consultar la cota, la pendiente y la orientación.
        </p>
      ) : result.elevation === undefined ? (
        <p className="py-2 text-[11px] leading-tight text-slate-500">
          El modelo de elevación todavía no ha llegado a ese punto. Espera un momento
          y vuelve a pulsar.
        </p>
      ) : (
        <>
          <Fila
            label="Cota"
            value={`${Math.round(result.elevation)} m`}
            hint="elipsoidal, sin geoide"
          />
          <Fila
            label="Pendiente"
            value={
              result.slopeDegrees === undefined
                ? "—"
                : `${result.slopeDegrees.toFixed(1)}°`
            }
            hint={
              result.slopePercent === undefined
                ? undefined
                : `${result.slopePercent.toFixed(0)} %`
            }
          />
          <Fila
            label="Orientación"
            value={
              result.aspect
                ? `${result.aspect.name} (${Math.round(result.aspectDegrees)}°)`
                : "Terreno plano"
            }
          />
        </>
      )}
    </div>

    <p className="border-t border-slate-100 bg-amber-50 px-2.5 py-1.5 text-[10px] leading-tight text-amber-900">
      {ACCURACY_WARNING}
    </p>
  </div>
)
