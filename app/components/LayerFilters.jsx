"use client"

import { useMemo, useState } from "react"
import { ChevronDown, Filter, X } from "lucide-react"

import {
  FILTER_FIELDS,
  collectFilterOptions,
  countMatching,
  hasActiveFilters,
} from "../utils/layerFilters"

/**
 * Filtros sobre las capas encendidas.
 *
 * **Las opciones salen de los datos que hay en pantalla, no de una lista fija.**
 * Nadie se sabe de memoria las etapas que usa la ANM ni cómo las escribe, y una
 * lista escrita a mano acabaría ofreciendo "Exploración" donde el servicio dice
 * "EXPLORACION". Recorriendo lo cargado, lo que ofrece el filtro siempre existe.
 *
 * El efecto es esconder, no volver a consultar: las capas ya traen todos sus
 * atributos, así que filtrar es instantáneo y no gasta una petición.
 *
 * Falta filtrar por departamento y municipio: esos campos no vienen en ninguna
 * respuesta observada de los cuatro servicios. `scripts/probar-campos.mjs` los
 * sondea desde una máquina con internet para decidir por dónde ir.
 */
export const LayerFilters = ({ properties, selections, areaRange, onChange, onArea }) => {
  const [open, setOpen] = useState(false)

  const { values, area } = useMemo(() => collectFilterOptions(properties), [properties])
  const activos = hasActiveFilters(selections, areaRange)
  const cuantas = countMatching(properties, selections, areaRange)

  const alternarValor = (campo, valor) => {
    const actuales = selections[campo] ?? []
    onChange({
      ...selections,
      [campo]: actuales.includes(valor)
        ? actuales.filter((v) => v !== valor)
        : [...actuales, valor],
    })
  }

  const limpiar = () => {
    onChange({})
    onArea(null)
  }

  // Sin nada cargado no hay nada que filtrar, y un panel de filtros vacío solo
  // hace pensar que algo se rompió.
  if (properties.length === 0) return null

  const camposConOpciones = FILTER_FIELDS.filter((campo) => (values[campo.key] ?? []).length > 1)

  return (
    <div className="border-t border-slate-200">
      <button
        type="button"
        onClick={() => setOpen((current) => !current)}
        aria-expanded={open}
        className="flex w-full items-center gap-2 px-4 py-2.5 text-left transition-colors hover:bg-slate-50"
      >
        <Filter className={`h-3.5 w-3.5 ${activos ? "text-blue-600" : "text-slate-400"}`} />
        <span className="text-[13px] font-medium text-slate-900">Filtros</span>
        {activos && (
          <span className="rounded-full bg-blue-50 px-2 py-0.5 text-[11px] font-medium text-blue-700">
            {cuantas} de {properties.length}
          </span>
        )}
        <span className="flex-1" />
        <ChevronDown
          className={`h-4 w-4 text-slate-400 transition-transform ${open ? "rotate-180" : ""}`}
        />
      </button>

      {open && (
        <div className="space-y-3 px-4 pb-3">
          {camposConOpciones.length === 0 && !area && (
            <p className="text-[11px] leading-tight text-slate-500">
              Lo que hay en pantalla no tiene valores distintos por los que filtrar.
            </p>
          )}

          {camposConOpciones.map((campo) => (
            <div key={campo.key}>
              <p className="mb-1.5 text-[10px] font-medium uppercase tracking-wide text-slate-500">
                {campo.label}
              </p>
              <div className="flex flex-wrap gap-1.5">
                {values[campo.key].map((valor) => {
                  const elegido = (selections[campo.key] ?? []).includes(valor)
                  return (
                    <button
                      key={valor}
                      type="button"
                      onClick={() => alternarValor(campo.key, valor)}
                      aria-pressed={elegido}
                      className={`rounded-full border px-2.5 py-1 text-[11px] transition-colors ${
                        elegido
                          ? "border-slate-900 bg-slate-900 text-white"
                          : "border-slate-200 bg-white text-slate-600 hover:border-slate-300"
                      }`}
                    >
                      {valor}
                    </button>
                  )
                })}
              </div>
            </div>
          ))}

          {area && area.max > area.min && (
            <div>
              <p className="mb-1.5 text-[10px] font-medium uppercase tracking-wide text-slate-500">
                Área mínima: {Math.round(areaRange?.min ?? area.min).toLocaleString("es")} ha
              </p>
              {/* Solo el mínimo. Un rango con dos extremos necesita dos
                  deslizadores encima del mismo riel, y en la práctica lo que se
                  busca es "de tal tamaño para arriba": los títulos pequeños son
                  ruido cuando se estudia una zona. */}
              <input
                type="range"
                min={Math.floor(area.min)}
                max={Math.ceil(area.max)}
                value={areaRange?.min ?? area.min}
                onChange={(event) =>
                  onArea({ min: Number(event.target.value), max: Math.ceil(area.max) })
                }
                aria-label="Área mínima en hectáreas"
                className="panel-opacidad w-full"
              />
              <p className="mt-1 text-[10px] text-slate-400">
                Entre {Math.round(area.min).toLocaleString("es")} y{" "}
                {Math.round(area.max).toLocaleString("es")} ha en pantalla
              </p>
            </div>
          )}

          {activos && (
            <button
              type="button"
              onClick={limpiar}
              className="flex items-center gap-1 text-[11px] font-medium text-blue-600 hover:text-blue-800"
            >
              <X className="h-3 w-3" />
              Quitar los filtros
            </button>
          )}
        </div>
      )}
    </div>
  )
}
