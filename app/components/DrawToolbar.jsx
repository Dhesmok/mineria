"use client"

import { useState } from "react"
import { Check, MapPin, Palette, Pentagon, Spline, Trash2 } from "lucide-react"

import { darken, readableInk } from "../utils/colors"
import { DRAW_PALETTE } from "../utils/drawStyles"
import { formatArea, formatDistance } from "../utils/mapUtils"
import { MapMenuItem, MapMenuSeparator } from "./MapMenu"

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
 * **Es el contenido de un panel flotante, no una ventana anclada.** Se probó de
 * las dos maneras: anclada al botón se cerraba al primer clic en el mapa —que es
 * justo el clic con el que se empieza a dibujar—, así que había que reabrirla
 * para cambiar de herramienta o de color. Flotante se queda puesta mientras se
 * trabaja y se aparta arrastrándola.
 *
 * Este componente no se ocupa de dónde se coloca ni de cómo se cierra: de eso se
 * encarga `FloatingPanel`, que es quien lo envuelve.
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
  /** Recogido: solo los iconos, sin los nombres ni las medidas. */
  compact = false,
}) => {
  // La paleta arranca recogida: quien dibuja ya sabe de qué color va, y lo
  // normal es no tocarla. Desplegada mide más que las tres herramientas juntas.
  const [paletaAbierta, setPaletaAbierta] = useState(false)

  const dibujando = mode.startsWith("draw_")
  // El color solo cuando hay a qué aplicarlo: con una herramienta en la mano o
  // con algo seleccionado. Suelto, invitaba a elegir un color que no pintaba
  // nada.
  const puedeColorear = dibujando || hasSelection

  return (
    <div className="-mx-1">
      {TOOLS.map(({ id, Icon, name, what }) => (
        <MapMenuItem
          key={id}
          icon={Icon}
          name={name}
          // Con algo dibujado, el total sustituye a la explicación: ya no hace
          // falta decir qué mide, hace falta decir cuánto va.
          hint={compact ? null : totalFor(id, summary) ?? what}
          compact={compact}
          active={mode === id}
          onClick={() => startMode(id)}
        />
      ))}

      <MapMenuSeparator />

      <MapMenuItem
        icon={Trash2}
        name={hasSelection ? "Borrar lo seleccionado" : "Borrar todo el dibujo"}
        hint={compact ? null : hasSelection ? "Solo la figura elegida" : "Las figuras y sus medidas"}
        compact={compact}
        disabled={!hasDrawings(summary)}
        onClick={deleteSelected}
      />

      {puedeColorear && (
        <>
          <MapMenuSeparator />
          {/* La misma paleta que las capas y la misma rueda del sistema debajo.
              Antes eran ocho colores sueltos escritos aquí, distintos de los del
              panel: dos juegos de color en la misma pantalla para lo mismo. Con
              la paleta compartida, un polígono dibujado y una capa pueden llevar
              exactamente el mismo color, que es lo que hace falta para comparar
              un área propia contra un título. */}
          <button
            type="button"
            onClick={() => setPaletaAbierta((abierta) => !abierta)}
            aria-expanded={paletaAbierta}
            className="flex w-full items-center gap-2.5 rounded-xl px-2.5 py-2 text-left text-zinc-200 transition-colors hover:bg-zinc-800/60"
          >
            <Palette className="h-4 w-4 shrink-0 text-zinc-400" />
            <span className="min-w-0 flex-1">
              <span className="block text-[13px] font-medium leading-tight text-zinc-200">
                {hasSelection ? "Color de lo seleccionado" : "Color del dibujo"}
              </span>
              <span className="mt-0.5 block text-[11px] leading-tight text-zinc-400">
                {paletaAbierta ? "Pulsa para recoger" : "Pulsa para cambiarlo"}
              </span>
            </span>
            <span
              className="h-5 w-5 shrink-0 rounded-full"
              style={{
                backgroundColor: drawingColor,
                border: `1.5px solid ${darken(drawingColor, 0.35)}`,
              }}
            />
          </button>

          {/* Sobre fondo oscuro en su propio recuadro */}
          {paletaAbierta && (
            <div className="mx-1 mb-1 rounded-xl border border-zinc-800 bg-zinc-950/80 px-2.5 py-2">
              <div className="grid grid-cols-7 gap-1.5">
                {DRAW_PALETTE.map((swatch) => {
                  const elegido = swatch.toLowerCase() === String(drawingColor).toLowerCase()
                  return (
                    <button
                      key={swatch}
                      type="button"
                      onClick={() => onColorChange(swatch)}
                      title={swatch}
                      aria-label={`Usar el color ${swatch}`}
                      aria-pressed={elegido}
                      className="flex h-7 w-7 items-center justify-center rounded-lg bg-zinc-900 transition-transform hover:scale-110"
                      style={{
                        backgroundColor: swatch,
                        border: `1.5px solid ${darken(swatch, 0.35)}`,
                      }}
                    >
                      {elegido && (
                        <Check className="h-4 w-4" style={{ color: readableInk(swatch) }} />
                      )}
                    </button>
                  )
                })}
              </div>

              <label className="mt-2.5 flex items-center gap-2 border-t border-zinc-800 pt-2 text-[11px] text-zinc-400">
                <input
                  type="color"
                  value={drawingColor}
                  onChange={(event) => onColorChange(event.target.value)}
                  className="h-7 w-9 cursor-pointer rounded-lg border border-zinc-700 bg-zinc-900 p-0.5"
                  aria-label="Elegir un color exacto"
                />
                Otro color
              </label>
            </div>
          )}
        </>
      )}
    </div>
  )
}
