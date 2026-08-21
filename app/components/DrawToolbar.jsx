"use client"

import { useState } from "react"
import { ChevronRight, MapPin, Pentagon, Spline, Trash2 } from "lucide-react"

import { formatArea, formatDistance } from "../utils/mapUtils"

/**
 * Las herramientas de dibujo y lo que llevan medido.
 *
 * Tres cosas cambiaron respecto a la versión anterior, y las tres por el mismo
 * motivo: era una caja de iconos que no decía nada.
 *
 * 1. **Los botones dicen qué miden.** Polígono da área, línea da longitud y
 *    punto da coordenadas, y eso solo se sabía después de usarlos. Desplegada,
 *    cada fila lo dice con todas las letras.
 * 2. **El total tiene un sitio fijo.** La medida de cada figura sale sobre ella
 *    en el mapa, lo cual está bien para una; con tres polígonos y dos líneas no
 *    hay forma de saber cuánto suma todo sin ir leyéndolas una a una.
 * 3. **El color vive dentro.** Salía como una tarjeta suelta al lado, y parecía
 *    de otra cosa.
 *
 * Recogida son cuatro iconos, que es lo que hace falta cuando ya se sabe usarla
 * y lo que importa es no tapar el mapa. La preferencia de recogida o desplegada
 * no se guarda a propósito: depende de lo que se esté haciendo en ese momento,
 * no de cómo le gusta a cada uno.
 */

const TOOLS = [
  {
    id: "draw_polygon",
    Icon: Pentagon,
    name: "Polígono",
    what: "Área y perímetro",
  },
  {
    id: "draw_line_string",
    Icon: Spline,
    name: "Línea",
    what: "Distancia",
  },
  {
    id: "draw_point",
    Icon: MapPin,
    name: "Punto",
    what: "Coordenada",
  },
]

/** Lo que enseña una herramienta cuando ya hay algo dibujado de su tipo. */
const totalFor = (toolId, summary) => {
  if (!summary) return null

  if (toolId === "draw_polygon" && summary.polygons > 0) {
    return `${summary.polygons} · ${formatArea(summary.areaM2)}`
  }
  if (toolId === "draw_line_string" && summary.lines > 0) {
    return `${summary.lines} · ${formatDistance(summary.lengthM)}`
  }
  if (toolId === "draw_point" && summary.points > 0) {
    return summary.points === 1 ? "1 punto" : `${summary.points} puntos`
  }
  return null
}

export const DrawToolbar = ({
  mode,
  startMode,
  deleteSelected,
  drawingColor,
  onColorChange,
  hasSelection,
  summary,
  colors,
}) => {
  const [open, setOpen] = useState(false)

  const drawing = mode.startsWith("draw_")
  const showPalette = open && (drawing || hasSelection)
  const algoDibujado = summary && (summary.polygons || summary.lines || summary.points)

  return (
    <div className="absolute right-4 top-32 z-10 w-fit overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm">
      <div className="flex flex-col">
        {TOOLS.map(({ id, Icon, name, what }) => {
          const activa = mode === id
          const total = totalFor(id, summary)

          return (
            <button
              key={id}
              type="button"
              onClick={() => startMode(id)}
              aria-pressed={activa}
              aria-label={`${name}: ${what.toLowerCase()}`}
              title={`${name} — ${what}. Pulsa otra vez (o Escape) para salir.`}
              className={`flex items-center gap-2.5 px-2.5 py-2 text-left transition-colors ${
                activa ? "bg-slate-900 text-white" : "text-slate-700 hover:bg-slate-50"
              }`}
            >
              <Icon className="h-4 w-4 shrink-0" />

              {open && (
                <span className="min-w-0 flex-1">
                  <span className="block text-[13px] font-medium leading-tight">{name}</span>
                  {/* Con algo dibujado, el total sustituye a la explicación: ya
                      no hace falta decir qué mide, hace falta decir cuánto va. */}
                  <span
                    className={`block text-[11px] leading-tight tabular-nums ${
                      activa ? "text-white/70" : "text-slate-500"
                    }`}
                  >
                    {total ?? what}
                  </span>
                </span>
              )}
            </button>
          )
        })}

        <button
          type="button"
          onClick={deleteSelected}
          disabled={!algoDibujado}
          title="Borrar la figura seleccionada, o todo el dibujo si no hay ninguna"
          aria-label="Borrar figura"
          className="flex items-center gap-2.5 border-t border-slate-100 px-2.5 py-2 text-left text-slate-700 transition-colors hover:bg-red-50 hover:text-red-600 disabled:cursor-not-allowed disabled:text-slate-300 disabled:hover:bg-transparent"
        >
          <Trash2 className="h-4 w-4 shrink-0" />
          {open && (
            <span className="text-[13px] font-medium leading-tight">
              {hasSelection ? "Borrar lo seleccionado" : "Borrar todo"}
            </span>
          )}
        </button>
      </div>

      {showPalette && (
        <div className="border-t border-slate-100 px-2.5 py-2">
          <p className="mb-1.5 text-[10px] font-medium uppercase tracking-wide text-slate-500">
            {hasSelection ? "Color de lo seleccionado" : "Color del dibujo"}
          </p>
          <div className="flex gap-1.5">
            {colors.map((color) => (
              <button
                key={color}
                type="button"
                onClick={() => onColorChange(color)}
                aria-label={`Usar el color ${color}`}
                aria-pressed={color === drawingColor}
                title={color}
                className={`h-5 w-5 rounded-full transition-transform hover:scale-110 ${
                  color === drawingColor ? "ring-2 ring-slate-900 ring-offset-1" : ""
                }`}
                style={{ backgroundColor: color }}
              />
            ))}
          </div>
        </div>
      )}

      {/* El mando de desplegar va abajo: arriba empujaría las herramientas hacia
          abajo al abrirse, y el dedo perdería el sitio que ya tenía aprendido. */}
      <button
        type="button"
        onClick={() => setOpen((visible) => !visible)}
        aria-expanded={open}
        aria-label={open ? "Recoger las herramientas de dibujo" : "Desplegar las herramientas de dibujo"}
        title={open ? "Recoger" : "Ver qué mide cada herramienta"}
        className="flex w-full items-center justify-center border-t border-slate-100 bg-slate-50 py-1 text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-700"
      >
        <ChevronRight className={`h-3.5 w-3.5 transition-transform ${open ? "rotate-180" : ""}`} />
      </button>
    </div>
  )
}
