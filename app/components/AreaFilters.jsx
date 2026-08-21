"use client"

import { useEffect, useMemo, useRef } from "react"
import { Table2, X } from "lucide-react"

import {
  FILTER_FIELDS,
  collectFilterOptions,
  countMatching,
  hasActiveFilters,
} from "../utils/layerFilters"

/**
 * Filtros de un área, en una ventana anclada a su encabezado.
 *
 * Antes había **un solo bloque de filtros al final del panel**, para todas las
 * capas a la vez. Con cuatro áreas y trece capas eso se llenaba de opciones de
 * cosas que ni siquiera estaban encendidas, y no se sabía a qué capa
 * correspondía cada valor. Ahora cada área tiene el suyo, y solo ofrece lo que
 * hay cargado de esa área.
 *
 * **Las opciones se leen de los datos, no de una lista escrita en el código.**
 * Nadie se sabe de memoria las etapas que usa la ANM ni cómo las escribe, y una
 * lista inventada acabaría ofreciendo "Exploración" donde el servicio dice
 * "EXPLORACION".
 *
 * El alcance —en pantalla o toda la capa— es de las dos cosas la que más
 * confunde si no se explica, así que va arriba, con una frase que dice qué
 * cambia entre una y otra.
 */
export const AreaFilters = ({
  area,
  properties,
  selections,
  areaRange,
  scope,
  truncated,
  onChange,
  onArea,
  onScope,
  onOpenTable,
  onClose,
  anchorRect,
}) => {
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

  const { values, area: rango } = useMemo(() => collectFilterOptions(properties), [properties])
  const activos = hasActiveFilters(selections, areaRange)
  const cuantas = countMatching(properties, selections, areaRange)

  const alternarValor = (campo, valor) => {
    const actuales = selections[campo] ?? []
    onChange({
      ...selections,
      [campo]: actuales.includes(valor) ? actuales.filter((v) => v !== valor) : [...actuales, valor],
    })
  }

  const camposConOpciones = FILTER_FIELDS.filter((campo) => (values[campo.key] ?? []).length > 1)

  const top = Math.min(anchorRect?.bottom ?? 0, window.innerHeight - 420) + 6
  const left = Math.min(anchorRect?.left ?? 0, window.innerWidth - 300)

  return (
    <div
      ref={panelRef}
      role="dialog"
      aria-label={`Filtros de ${area.name}`}
      style={{ top: Math.max(12, top), left: Math.max(12, left) }}
      className="fixed z-50 max-h-[70vh] w-[19rem] overflow-y-auto rounded-xl border border-slate-200 bg-white shadow-xl"
    >
      <div className="sticky top-0 z-10 flex items-center gap-2 border-b border-slate-200 bg-white px-3 py-2.5">
        <span
          className="h-2.5 w-2.5 shrink-0 rounded-full"
          style={{ backgroundColor: area.color }}
        />
        <span className="text-[13px] font-semibold text-slate-900">Filtrar {area.name}</span>
        <span className="flex-1" />
        <button
          type="button"
          onClick={onClose}
          aria-label="Cerrar los filtros"
          className="rounded p-1 text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-700"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </div>

      <div className="space-y-3 p-3">
        {/* Alcance. Es lo que más se malinterpreta, así que se explica en una
            frase en vez de dejarlo a que el usuario lo deduzca. */}
        <div>
          <div className="flex rounded-lg bg-slate-100 p-0.5">
            {[
              { id: "viewport", label: "En pantalla" },
              { id: "layer", label: "Toda la capa" },
            ].map((opcion) => (
              <button
                key={opcion.id}
                type="button"
                onClick={() => onScope(opcion.id)}
                aria-pressed={scope === opcion.id}
                className={`flex-1 rounded-md px-2 py-1.5 text-[11px] font-medium transition-colors ${
                  scope === opcion.id
                    ? "bg-white text-slate-900 shadow-sm"
                    : "text-slate-500 hover:text-slate-700"
                }`}
              >
                {opcion.label}
              </button>
            ))}
          </div>
          <p className="mt-1.5 text-[10px] leading-tight text-slate-500">
            {scope === "viewport"
              ? "Esconde lo que no cumple, de lo que ya está cargado. Es inmediato."
              : "Le pregunta al servicio por todo el país, aunque quede fuera de la vista. Tarda un poco más."}
          </p>
        </div>

        {properties.length === 0 ? (
          <p className="text-[11px] leading-tight text-slate-500">
            Enciende una capa de {area.name} para ver por qué se puede filtrar.
          </p>
        ) : (
          <>
            {camposConOpciones.length === 0 && !rango && (
              <p className="text-[11px] leading-tight text-slate-500">
                Lo cargado no tiene valores distintos por los que filtrar.
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
                            ? "border-transparent text-white"
                            : "border-slate-200 bg-white text-slate-600 hover:border-slate-300"
                        }`}
                        style={elegido ? { backgroundColor: area.color } : undefined}
                      >
                        {valor}
                      </button>
                    )
                  })}
                </div>
              </div>
            ))}

            {rango && rango.max > rango.min && (
              <div>
                <p className="mb-1.5 text-[10px] font-medium uppercase tracking-wide text-slate-500">
                  Área mínima: {Math.round(areaRange?.min ?? rango.min).toLocaleString("es")} ha
                </p>
                {/* Solo el mínimo. Un rango con dos extremos necesita dos
                    deslizadores sobre el mismo riel, y en la práctica lo que se
                    busca es "de tal tamaño para arriba". */}
                <input
                  type="range"
                  min={Math.floor(rango.min)}
                  max={Math.ceil(rango.max)}
                  value={areaRange?.min ?? rango.min}
                  onChange={(event) =>
                    onArea({ min: Number(event.target.value), max: Math.ceil(rango.max) })
                  }
                  aria-label="Área mínima en hectáreas"
                  className="panel-opacidad w-full"
                />
              </div>
            )}
          </>
        )}
      </div>

      <div className="sticky bottom-0 flex items-center gap-2 border-t border-slate-200 bg-slate-50 px-3 py-2.5">
        <span className="text-[11px] text-slate-600">
          {activos ? `${cuantas} de ${properties.length}` : `${properties.length} cargados`}
        </span>
        {truncated && (
          <span
            title="El servicio recortó la respuesta: hay más de los que caben en una consulta"
            className="rounded bg-amber-100 px-1.5 py-0.5 text-[10px] font-medium text-amber-800"
          >
            recortado
          </span>
        )}
        <span className="flex-1" />

        {activos && (
          <button
            type="button"
            onClick={() => {
              onChange({})
              onArea(null)
            }}
            className="text-[11px] font-medium text-blue-600 hover:text-blue-800"
          >
            Quitar
          </button>
        )}

        <button
          type="button"
          onClick={onOpenTable}
          disabled={properties.length === 0}
          title="Ver los resultados en una tabla"
          className="flex items-center gap-1.5 rounded-md bg-slate-900 px-2.5 py-1.5 text-[11px] font-medium text-white transition-colors hover:bg-slate-700 disabled:opacity-40"
        >
          <Table2 className="h-3.5 w-3.5" />
          Ver tabla
        </button>
      </div>
    </div>
  )
}
