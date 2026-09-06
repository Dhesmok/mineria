"use client"

import { useEffect, useMemo, useRef } from "react"
import { Table2, X } from "lucide-react"

import { anchorToViewport, popoverWidth } from "../utils/popoverPosition"
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

  const camposConOpciones = FILTER_FIELDS.filter((campo) => (values[campo.key] ?? []).length >= 1)

  // El ancho de aquí abajo tiene que ser el mismo que el de la clase: colocar la
  // ventana contando con un ancho que no es el que el navegador va a usar es
  // exactamente el fallo que hacía que en un teléfono se saliera por la derecha.
  const ancho = popoverWidth(304, window.innerWidth)
  const { top, left } = anchorToViewport(
    anchorRect,
    { width: ancho, height: Math.min(420, window.innerHeight * 0.7) },
    { width: window.innerWidth, height: window.innerHeight },
  )

  return (
    <div
      ref={panelRef}
      role="dialog"
      aria-label={`Filtros de ${area.name}`}
      style={{ top, left }}
      className="fixed z-50 max-h-[70vh] w-[min(19rem,calc(100vw-1.5rem))] overflow-y-auto rounded-2xl border border-zinc-800 bg-[#09090b]/95 text-zinc-100 shadow-2xl backdrop-blur-2xl"
    >
      <div className="sticky top-0 z-10 flex items-center gap-2 border-b border-zinc-800 bg-zinc-950/80 px-3.5 py-2.5 backdrop-blur-md">
        <span
          className="h-2.5 w-2.5 shrink-0 rounded-full"
          style={{ backgroundColor: area.color }}
        />
        <span className="text-[13px] font-semibold text-white">Filtrar {area.name}</span>
        <span className="flex-1" />
        <button
          type="button"
          onClick={onClose}
          aria-label="Cerrar los filtros"
          className="rounded p-1 text-zinc-400 transition-colors hover:bg-zinc-800 hover:text-zinc-100"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </div>

      <div className="space-y-3 p-3.5">
        {/* Alcance. Es lo que más se malinterpreta, así que se explica en una
            frase en vez de dejarlo a que el usuario lo deduzca. */}
        <div>
          <div className="flex rounded-xl bg-zinc-900 border border-zinc-800 p-0.5">
            {[
              { id: "viewport", label: "En pantalla" },
              { id: "layer", label: "Toda la capa" },
            ].map((opcion) => (
              <button
                key={opcion.id}
                type="button"
                onClick={() => onScope(opcion.id)}
                aria-pressed={scope === opcion.id}
                className={`flex-1 rounded-lg px-2 py-1.5 text-[11px] font-medium transition-colors ${
                  scope === opcion.id
                    ? "bg-zinc-800 text-white font-semibold border border-zinc-700 shadow-sm"
                    : "text-zinc-400 hover:text-zinc-200"
                }`}
              >
                {opcion.label}
              </button>
            ))}
          </div>
          <p className="mt-1.5 text-[10px] leading-tight text-zinc-400">
            {scope === "viewport"
              ? "Filtra únicamente los polígonos que se ven en la pantalla."
              : "Filtra la capa completa, en todo el país. Tarda un poco más."}
          </p>
        </div>

        {properties.length === 0 ? (
          <p className="text-[11px] leading-tight text-zinc-400">
            Enciende una capa de {area.name} para ver por qué se puede filtrar.
          </p>
        ) : (
          <>
            {camposConOpciones.length === 0 && !rango && (
              <p className="text-[11px] leading-tight text-zinc-400">
                Lo cargado no tiene valores distintos por los que filtrar.
              </p>
            )}

            {camposConOpciones.map((campo) => (
              <div key={campo.key}>
                <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-wider text-zinc-400">
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
                            ? "border-transparent text-white shadow-sm"
                            : "border-zinc-800 bg-zinc-900/90 text-zinc-300 hover:border-zinc-700 hover:text-white"
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
                <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-wider text-zinc-400">
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

      <div className="sticky bottom-0 flex items-center gap-2 border-t border-zinc-800 bg-zinc-950/90 px-3.5 py-2.5 backdrop-blur-md">
        <span className="text-[11px] text-zinc-400">
          {activos ? `${cuantas} de ${properties.length}` : `${properties.length} cargados`}
        </span>
        {truncated && (
          <span
            title="El servicio recortó la respuesta: hay más de los que caben en una consulta"
            className="rounded bg-amber-500/10 px-1.5 py-0.5 text-[10px] font-medium text-amber-300 border border-amber-500/20"
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
            className="text-[11px] font-medium text-sky-400 hover:text-sky-300 transition-colors"
          >
            Quitar
          </button>
        )}

        <button
          type="button"
          onClick={onOpenTable}
          disabled={properties.length === 0}
          title="Ver los resultados en una tabla"
          className="flex items-center gap-1.5 rounded-xl bg-zinc-800 hover:bg-zinc-700 border border-zinc-700 px-3 py-1.5 text-[11px] font-medium text-white transition-colors disabled:opacity-40 shadow-sm"
        >
          <Table2 className="h-3.5 w-3.5" />
          Ver tabla
        </button>
      </div>
    </div>
  )
}
