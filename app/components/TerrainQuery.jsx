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
 * un cálculo de estabilidad. El segundo es el dátum de la altura, y aquí este
 * comentario decía lo contrario de la verdad: que las alturas eran elipsoidales
 * y había que aplicarles geoide. En Colombia las teselas son SRTM, que ya viene
 * referido al geoide EGM96 —lo dice su cabecera `x-amz-meta-x-imagery-sources`
 * y la documentación de SRTM—. Aplicarle un geoide encima descuadra la cota
 * los ~25 m que se pretendía corregir. Lo que sí queda es que EGM96 no es la
 * red de nivelación del IGAC: frente a una cota de plano puede haber unos
 * metros, además del error propio de SRTM. Ver `utils/demClip.js`.
 */

const Fila = ({ label, value, hint }) => (
  <div className="flex items-baseline justify-between gap-3 border-b border-border py-1.5 last:border-b-0">
    <span className="text-[11px] text-label-3">{label}</span>
    <span className="text-right">
      <span className="block text-[13px] font-medium tabular-nums text-foreground">{value}</span>
      {hint && <span className="block text-[10px] leading-tight text-label-4">{hint}</span>}
    </span>
  </div>
)

export const TerrainQuery = ({ result, onClose }) => (
  <div className="w-[min(15rem,calc(100vw-1.5rem))] overflow-hidden rounded-xl border glass text-foreground">
    <div className="flex items-center gap-1.5 border-b border-border bg-transparent px-2.5 py-1.5">
      <MountainSnow className="h-3.5 w-3.5 shrink-0 text-label-3" />
      <span className="flex-1 text-[11px] font-medium text-label-2">Terreno en el punto</span>
      <button
        type="button"
        onClick={onClose}
        aria-label="Cerrar la consulta de terreno"
        className="rounded p-0.5 text-label-3 transition-colors hover:bg-fill-strong hover:text-foreground"
      >
        <X className="h-3.5 w-3.5" />
      </button>
    </div>

    <div className="px-2.5 py-1">
      {result === null ? (
        <p className="py-2 text-[11px] leading-tight text-label-3">
          Pulsa en el mapa para consultar la cota, la pendiente y la orientación.
        </p>
      ) : result.elevation === undefined ? (
        <p className="py-2 text-[11px] leading-tight text-label-3">
          El modelo de elevación todavía no ha llegado a ese punto. Espera un momento
          y vuelve a pulsar.
        </p>
      ) : (
        <>
          <Fila
            label="Cota"
            value={`${Math.round(result.elevation)} m`}
            hint="sobre el geoide EGM96 · SRTM ±16 m"
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

    <p className="border-t border-border bg-warning/10 px-2.5 py-1.5 text-[10px] leading-tight text-warning">
      {ACCURACY_WARNING}
    </p>
  </div>
)
