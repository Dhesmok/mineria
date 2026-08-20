"use client"

import { useCallback, useRef, useState } from "react"
import { GripVertical } from "lucide-react"

import { AREAS, THEME_LAYERS, layerByKey } from "../utils/themeAreas"
import { darken } from "../utils/colors"
import { indexForPointer, moveWithinSubset } from "../utils/reorder"
import { ColorPopover } from "./ColorPopover"

/**
 * Panel de capas agrupadas por área temática.
 *
 * Es la opción C de las tres que se diseñaron: una sola lista continua con los
 * encabezados de área pegados arriba, filas compactas y un filtro Todas /
 * Activas. Se eligió por encima del acordeón y de las pestañas porque deja ver
 * las trece capas de un vistazo, que es como se trabaja en un SIG de escritorio.
 *
 * Dos cosas que no son adorno:
 *
 * - **La muestra de color es un botón.** Abre el selector y cambia el color con
 *   que se pinta esa capa en el mapa. Las capas de la ANM traen colores fijos de
 *   fábrica que a veces chocan con la imagen de satélite o con el color que usa
 *   el plano con el que se está comparando.
 *
 * - **En "Activas" la lista es el orden de pintado.** Arrastrando se decide qué
 *   capa tapa a cuál: la de arriba se ve por encima de todas y la de abajo queda
 *   al fondo, en la lista y en el mapa. En "Todas" no se puede arrastrar, porque
 *   ahí las filas están agrupadas por área y las dos ordenaciones se
 *   contradirían.
 */

const AreaIcon = ({ area, className }) => (
  <svg
    className={className}
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
  >
    {area.icon.map((d, i) => d && <path key={i} d={d} />)}
  </svg>
)

/**
 * La muestra de color de una fila: es el botón que abre el selector.
 *
 * El cuadrito mide 14 px porque a más grande deja de leerse como una muestra y
 * empieza a parecer un botón más, pero el área que responde al dedo es de 24: en
 * el celular, un blanco de 14 px se falla más veces de las que se acierta. De ahí
 * el botón grande con el cuadrito dentro.
 */
const ColorSwatch = ({ layer, state, disabled, onOpen }) => (
  <button
    type="button"
    disabled={disabled}
    onClick={(event) => onOpen(layer.key, event.currentTarget.getBoundingClientRect())}
    title={disabled ? undefined : `Cambiar el color de ${layer.label}`}
    aria-label={`Cambiar el color de ${layer.label}`}
    className="-mx-1 flex h-6 w-6 shrink-0 items-center justify-center rounded transition-transform disabled:cursor-default enabled:hover:scale-125"
  >
    <span
      className="block h-3.5 w-3.5 rounded-[3px]"
      style={{
        backgroundColor: state.fillColor,
        border: `1.5px solid ${state.lineColor}`,
        opacity: state.on ? Math.max(state.opacity, 0.35) : 0.4,
      }}
    />
  </button>
)

/** El interruptor, con el color del área cuando está encendido. */
const LayerSwitch = ({ layer, state, area, disabled, onToggle }) => (
  <button
    type="button"
    role="switch"
    aria-checked={state.on}
    aria-label={layer.label}
    disabled={disabled}
    onClick={() => onToggle(layer.key)}
    title={disabled ? "Todavía no está conectado el servicio de esta capa" : undefined}
    className="relative h-[19px] w-[34px] shrink-0 rounded-full transition-colors disabled:cursor-not-allowed disabled:opacity-50"
    style={{ backgroundColor: state.on ? area.color : "#e2e8f0" }}
  >
    <span
      className="absolute left-0.5 top-0.5 block h-[15px] w-[15px] rounded-full bg-white shadow-[0_1px_3px_rgba(0,0,0,0.25)] transition-transform"
      style={{ transform: state.on ? "translateX(15px)" : "translateX(0)" }}
    />
  </button>
)

/**
 * Una fila de capa.
 *
 * Va aquí fuera y no dentro de `LayerPanel` a propósito: un componente definido
 * dentro de otro es un tipo nuevo en cada render, así que React desmonta y
 * vuelve a montar todas las filas cada vez que cambia cualquier cosa. Eso
 * rompería justo las dos funciones nuevas —el arrastre pierde el elemento que
 * tenía agarrado y el deslizador de opacidad pierde el foco a media pulsación—.
 */
const LayerRow = ({
  layer,
  state,
  area,
  index,
  draggable,
  dragging,
  registerRow,
  onToggle,
  onOpacity,
  onOpenColor,
  onDragStart,
  onDragMove,
  onDragEnd,
}) => (
  <div
    ref={(node) => registerRow(layer.key, node)}
    className={`flex h-[38px] items-center gap-2.5 border-b border-slate-100 px-4 transition-colors ${
      dragging ? "bg-slate-100 opacity-60" : "hover:bg-slate-50"
    }`}
    // En la lista de activas no hay encabezados de área —es una lista plana
    // porque su orden es el orden de pintado—, así que una franja del color del
    // área es lo que recuerda de dónde viene cada capa sin gastar ancho.
    style={draggable ? { borderLeft: `3px solid ${area.color}`, paddingLeft: "13px" } : undefined}
  >
    {draggable && (
      <button
        type="button"
        onPointerDown={(event) => onDragStart(event, index)}
        onPointerMove={onDragMove}
        onPointerUp={onDragEnd}
        onPointerCancel={onDragEnd}
        aria-label={`Reordenar ${layer.label}`}
        title="Arrastra para cambiar qué capa se ve encima"
        className="-ml-1.5 shrink-0 cursor-grab touch-none text-slate-300 hover:text-slate-500 active:cursor-grabbing"
      >
        <GripVertical className="h-4 w-4" />
      </button>
    )}

    <ColorSwatch layer={layer} state={state} disabled={layer.pending} onOpen={onOpenColor} />

    <span
      className={`min-w-0 flex-1 truncate text-[13px] ${
        state.on ? "text-slate-900" : layer.pending ? "text-slate-400" : "text-slate-600"
      }`}
      title={layer.label}
    >
      {layer.label}
    </span>

    {/* La barra reserva su sitio aunque la capa esté apagada: si apareciera y
        desapareciera, la lista entera daría un salto en cada interruptor. */}
    {state.on ? (
      <input
        type="range"
        min="0"
        max="100"
        value={Math.round(state.opacity * 100)}
        onChange={(event) => onOpacity(layer.key, Number(event.target.value) / 100)}
        aria-label={`Opacidad de ${layer.label}`}
        className="panel-opacidad w-[62px] shrink-0"
      />
    ) : (
      <span className="w-[62px] shrink-0" />
    )}

    <LayerSwitch
      layer={layer}
      state={state}
      area={area}
      disabled={layer.pending}
      onToggle={onToggle}
    />
  </div>
)

export const LayerPanel = ({ layers, order, onToggle, onOpacity, onColor, onReorder }) => {
  const [onlyActive, setOnlyActive] = useState(false)
  const [colorTarget, setColorTarget] = useState(null)
  // Qué se está arrastrando y dónde caería si se soltara ahora.
  const [drag, setDrag] = useState(null)
  const rowRefs = useRef(new Map())

  const activeKeys = order.filter((key) => layers[key]?.on)
  const activeCount = activeKeys.length

  const openColor = useCallback((key, rect) => setColorTarget({ key, rect }), [])

  // ─────────────────────────────── arrastrar ───────────────────────────────
  // Con eventos de puntero y no con la API de arrastre de HTML: aquella no
  // existe en pantallas táctiles, y el visor se usa en campo desde el celular.
  const startDrag = (event, index) => {
    event.preventDefault()
    event.currentTarget.setPointerCapture?.(event.pointerId)
    setDrag({ from: index, to: index })
  }

  const moveDrag = (event) => {
    if (!drag) return
    const rects = activeKeys
      .map((key) => rowRefs.current.get(key)?.getBoundingClientRect())
      .filter(Boolean)
      .map((rect) => ({ top: rect.top, height: rect.height }))

    setDrag((current) => (current ? { ...current, to: indexForPointer(event.clientY, rects) } : null))
  }

  const endDrag = () => {
    if (!drag) return
    if (drag.to !== drag.from) {
      onReorder(moveWithinSubset(order, activeKeys, drag.from, drag.to))
    }
    setDrag(null)
  }

  const registerRow = useCallback((key, node) => {
    if (node) rowRefs.current.set(key, node)
    else rowRefs.current.delete(key)
  }, [])

  /** Los mismos manejadores para las dos vistas, para no repetirlos abajo. */
  const filaProps = (layer, index, draggable) => ({
    layer,
    state: layers[layer.key],
    area: AREAS.find((a) => a.id === layer.areaId),
    index,
    draggable,
    dragging: draggable && drag?.from === index,
    registerRow,
    onToggle,
    onOpacity,
    onOpenColor: openColor,
    onDragStart: startDrag,
    onDragMove: moveDrag,
    onDragEnd: endDrag,
  })

  return (
    <div className="-mx-4">
      {/* Filtro y cuenta */}
      <div className="mb-3 flex items-center gap-2 px-4">
        <div className="flex rounded-lg bg-slate-100 p-0.5">
          {[
            { id: "todas", label: "Todas", value: false },
            { id: "activas", label: "Activas", value: true },
          ].map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => setOnlyActive(tab.value)}
              aria-pressed={onlyActive === tab.value}
              className={`rounded-md px-3 py-[5px] text-xs font-medium transition-colors ${
                onlyActive === tab.value
                  ? "bg-white text-slate-900 shadow-sm"
                  : "text-slate-500 hover:text-slate-700"
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
        <span className="flex-1" />
        <span className="text-xs text-slate-500">
          {activeCount === 1 ? "1 encendida" : `${activeCount} encendidas`}
        </span>
      </div>

      <div className="max-h-[420px] overflow-y-auto border-t border-slate-200">
        {onlyActive ? (
          // ───────────── Activas: lista plana y ordenable ─────────────
          activeCount === 0 ? (
            <p className="px-4 py-6 text-center text-xs text-slate-400">
              Enciende una capa para verla aquí.
            </p>
          ) : (
            <>
              <p className="border-b border-slate-100 bg-slate-50 px-4 py-2 text-[11px] leading-tight text-slate-500">
                Arrastra para ordenar. La de arriba se dibuja encima de las demás.
              </p>
              {activeKeys.map((key, index) => (
                <div key={key} className="relative">
                  {/* Línea de destino mientras se arrastra. */}
                  {drag && drag.to === index && drag.from !== index && (
                    <span className="pointer-events-none absolute inset-x-3 -top-px z-10 h-0.5 rounded bg-blue-500" />
                  )}
                  <LayerRow {...filaProps(layerByKey(key), index, true)} />
                </div>
              ))}
            </>
          )
        ) : (
          // ───────────── Todas: agrupadas por área ─────────────
          AREAS.map((area) => {
            const delArea = THEME_LAYERS.filter((layer) => layer.areaId === area.id)
            const encendidas = delArea.filter((layer) => layers[layer.key]?.on).length

            return (
              <div key={area.id}>
                <div className="sticky top-0 z-[2] flex items-center gap-2 border-b border-slate-200 bg-slate-50 px-4 py-[7px]">
                  <AreaIcon area={area} className="h-3.5 w-3.5" />
                  <span
                    className="text-[11px] font-semibold uppercase tracking-[0.06em]"
                    style={{ color: area.color }}
                  >
                    {area.name}
                  </span>
                  <span className="text-[11px] text-slate-400">{area.source}</span>
                  <span className="flex-1" />
                  <span className="text-[11px] tabular-nums text-slate-500">
                    {encendidas}/{delArea.length}
                  </span>
                </div>
                {delArea.map((layer) => (
                  <LayerRow key={layer.key} {...filaProps(layer, -1, false)} />
                ))}
              </div>
            )
          })
        )}
      </div>

      {colorTarget && (
        <ColorPopover
          color={layers[colorTarget.key].fillColor}
          anchorRect={colorTarget.rect}
          onChange={(color) => onColor(colorTarget.key, color, darken(color, 0.35))}
          onClose={() => setColorTarget(null)}
        />
      )}
    </div>
  )
}
