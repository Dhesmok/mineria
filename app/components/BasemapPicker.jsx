"use client"

import { useEffect, useLayoutEffect, useRef, useState } from "react"
import { Check, Type } from "lucide-react"

import { BASEMAPS, hasFixedLabels, supportsLabelToggle } from "../utils/basemaps"

/**
 * Elegir el mapa de fondo.
 *
 * Sale del botón «Mapa base», que antes se llamaba «Satélite» y alternaba entre
 * dos. Con cinco fondos, un botón que va rotando obliga a pasar por todos para
 * llegar al que se quiere; una lista los enseña de golpe.
 *
 * **Pulsar el fondo que ya está puesto quita o pone sus nombres.** Es la idea de
 * Fabio y evita un segundo botón que estaría apagado casi siempre. Para que no
 * haya que descubrirlo, la fila del fondo elegido muestra un distintivo «Aa»
 * —encendido o apagado— y dice qué va a pasar al volver a pulsarla.
 *
 * En OSM y OpenTopoMap los nombres vienen pintados dentro de la tesela y no se
 * pueden quitar. Ahí no se ofrece el distintivo: se dice que son fijos, en vez
 * de dar un interruptor que no haría nada.
 */
/**
 * Si ni midiendo cabe —una ventana muy baja, o un teléfono en horizontal—, el
 * panel se desplaza por dentro. Es preferible a que la última opción quede
 * fuera de la pantalla, sin forma de llegar hasta ella.
 */
const ALTO_MAXIMO = "calc(100vh - 1.5rem)"

export const BasemapPicker = ({ current, showLabels, onChoose, onClose, anchorRect }) => {
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

  // Anclado al botón, sobre la ventana: la columna de controles tiene su propio
  // desplazamiento y dentro de ella el panel saldría cortado.
  //
  // El alto se **mide**, no se calcula. Antes eran «66 px por fila», y ese
  // número dependía de que las pistas cupieran en dos renglones: al añadir un
  // sexto fondo y una pista de tres, el cálculo se quedaba corto y el panel
  // podía salirse por abajo en una ventana baja sin que nada avisara.
  const [alto, setAlto] = useState(0)

  useLayoutEffect(() => {
    const medir = () => setAlto(panelRef.current?.offsetHeight ?? 0)
    medir()
    // Las pistas cambian de renglones al estrecharse la ventana, así que el alto
    // no es fijo ni siquiera con los mismos fondos.
    window.addEventListener("resize", medir)
    return () => window.removeEventListener("resize", medir)
  }, [])

  // En el primer pintado todavía no hay medida: se ancla al botón y se corrige
  // en cuanto se conoce, dentro del mismo fotograma —por eso `useLayoutEffect`
  // y no `useEffect`: así el usuario nunca ve el salto.
  const top = alto
    ? Math.max(12, Math.min((anchorRect?.top ?? 0) - alto + 36, window.innerHeight - alto - 12))
    : Math.max(12, (anchorRect?.top ?? 0) - 400)
  const right = Math.max(12, window.innerWidth - (anchorRect?.left ?? 0) + 10)

  return (
    <div
      ref={panelRef}
      role="dialog"
      aria-label="Elegir el mapa de fondo"
      style={{ top, right, maxHeight: ALTO_MAXIMO }}
      className="fixed z-50 w-[min(18rem,calc(100vw-1.5rem))] overflow-y-auto overscroll-contain rounded-xl border border-slate-200 bg-white p-1.5 shadow-xl"
    >
      <p className="px-2.5 pb-1.5 pt-2 text-[10px] font-medium uppercase tracking-wide text-slate-500">
        Mapa base
      </p>

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
                hay, y anunciarlos ahí era decir algo falso: la fila decía
                «nombres fijos» sobre un fondo que no trae ni un topónimo. */}
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
    </div>
  )
}
