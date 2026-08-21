"use client"

import { MapPin, Pentagon, Spline, Trash2 } from "lucide-react"

import { formatArea, formatDistance } from "../utils/mapUtils"
import { MapMenuItem, MapMenuPanel, MapMenuSeparator } from "./MapMenu"

/**
 * Las herramientas de dibujo y lo que llevan medido.
 *
 * Tres cosas la separan de una caja de iconos sin más:
 *
 * 1. **Los botones dicen qué miden.** Polígono da área, línea da longitud y
 *    punto da coordenadas, y eso solo se sabía después de usarlos.
 * 2. **El total tiene un sitio fijo.** La medida de cada figura sale sobre ella
 *    en el mapa, lo cual está bien para una; con tres polígonos y dos líneas no
 *    hay forma de saber cuánto suma todo sin ir leyéndolas una a una.
 * 3. **El color vive dentro.** Salía como una tarjeta suelta al lado, y parecía
 *    de otra cosa.
 *
 * **Antes flotaba suelta sobre el mapa** —arriba a la izquierda en el teléfono,
 * a la derecha en el escritorio—, con su propio mando para recogerse y
 * desplegarse. Ahora es la ventana del botón «Dibujo» de la columna de
 * controles: el mismo contenido, pero sin ocupar sitio en el mapa mientras no se
 * usa, y sin un segundo mecanismo de recoger que hacía lo mismo que cerrar la
 * ventana. Las herramientas se enseñan siempre con su explicación, porque dentro
 * de la ventana el espacio ya no es el problema que era.
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

/** ¿Hay algo dibujado en el mapa ahora mismo? */
export const hasDrawings = (summary) =>
  Boolean(summary && (summary.polygons || summary.lines || summary.points))

export const DrawToolbar = ({
  mode,
  startMode,
  deleteSelected,
  drawingColor,
  onColorChange,
  hasSelection,
  summary,
  colors,
  anchorRect,
  onClose,
}) => {
  const dibujando = mode.startsWith("draw_")
  // La paleta solo cuando hay a qué aplicarla: con una herramienta en la mano o
  // con algo seleccionado. Suelta, invitaba a elegir un color que no pintaba
  // nada.
  const mostrarPaleta = dibujando || hasSelection

  return (
    <MapMenuPanel label="Dibujo y medidas" anchorRect={anchorRect} onClose={onClose}>
      {TOOLS.map(({ id, Icon, name, what }) => (
        <MapMenuItem
          key={id}
          icon={Icon}
          name={name}
          // Con algo dibujado, el total sustituye a la explicación: ya no hace
          // falta decir qué mide, hace falta decir cuánto va.
          hint={totalFor(id, summary) ?? what}
          active={mode === id}
          onClick={() => startMode(id)}
        />
      ))}

      <MapMenuSeparator />

      <MapMenuItem
        icon={Trash2}
        name={hasSelection ? "Borrar lo seleccionado" : "Borrar todo el dibujo"}
        hint={hasSelection ? "Solo la figura elegida" : "Las figuras y sus medidas"}
        disabled={!hasDrawings(summary)}
        onClick={deleteSelected}
      />

      {mostrarPaleta && (
        <>
          <MapMenuSeparator />
          <div className="px-2.5 pb-1.5 pt-1">
            <p className="mb-1.5 text-[10px] font-medium uppercase tracking-wide text-slate-500">
              {hasSelection ? "Color de lo seleccionado" : "Color del dibujo"}
            </p>
            {/* Los ocho en un renglón: a 24 px el blanco se caía a una segunda
                fila él solo, y una fila con un único punto parece un error. */}
            <div className="flex gap-1.5">
              {colors.map((color) => (
                <button
                  key={color}
                  type="button"
                  onClick={() => onColorChange(color)}
                  aria-label={`Usar el color ${color}`}
                  aria-pressed={color === drawingColor}
                  title={color}
                  className={`h-5 w-5 shrink-0 rounded-full border border-slate-200 transition-transform hover:scale-110 ${
                    color === drawingColor ? "ring-2 ring-slate-900 ring-offset-1" : ""
                  }`}
                  style={{ backgroundColor: color }}
                />
              ))}
            </div>
          </div>
        </>
      )}
    </MapMenuPanel>
  )
}
