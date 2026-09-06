"use client"

import { useCallback, useRef, useState } from "react"
import { Check, ChevronDown, ChevronRight, Filter, GripVertical, Search } from "lucide-react"

import { AREAS, THEME_LAYERS, layerByKey } from "../utils/themeAreas"
import { darken } from "../utils/colors"
import { indexForPointer, moveWithinSubset } from "../utils/reorder"
import { ColorPopover } from "./ColorPopover"
import { OpacitySlider } from "./OpacitySlider"

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
    onClick={(event) => {
      event.stopPropagation()
      onOpen(layer.key, event.currentTarget)
    }}
    title={disabled ? undefined : `Cambiar el color de ${layer.label}`}
    aria-label={`Cambiar el color de ${layer.label}`}
    className="-mx-1 flex h-6.5 w-6.5 shrink-0 items-center justify-center rounded transition-transform disabled:cursor-default enabled:hover:scale-125"
  >
    <span
      className="block h-4 w-4 rounded-[3.5px] shadow-sm transition-all"
      style={{
        backgroundColor: state.fillColor,
        border: `1.5px solid ${state.lineColor}`,
        opacity: state.on ? Math.max(state.opacity, 0.4) : 0.25,
        filter: state.on ? "none" : "grayscale(80%)",
      }}
    />
  </button>
)

/**
 * Una casilla de subcapa: un departamento, o una de las capas que lleva dentro.
 */
const Casilla = ({ label, estado, sangria, fuerte, onClick, children }) => (
  <button
    type="button"
    onClick={onClick}
    aria-pressed={estado === "todo"}
    className={`flex w-full items-center gap-2 py-1 pr-4 text-left transition-colors hover:bg-zinc-800/40 ${sangria}`}
  >
    <span
      className={`flex h-3 w-3 shrink-0 items-center justify-center rounded-[3px] border transition-colors ${
        estado === "nada"
          ? "border-zinc-700 bg-zinc-900/60 text-transparent"
          : "border-zinc-400 bg-zinc-200 text-zinc-950"
      }`}
    >
      {estado === "todo" && <Check className="h-2.5 w-2.5" />}
      {estado === "parte" && <span className="h-[2px] w-[7px] rounded-full bg-zinc-950" />}
    </span>
    <span
      className={`min-w-0 flex-1 truncate text-[11px] transition-colors ${
        estado === "nada" ? "text-zinc-500 hover:text-zinc-300" : "text-white font-semibold"
      } ${fuerte ? (estado === "nada" ? "font-medium text-zinc-400" : "font-bold text-white") : ""}`}
    >
      {label}
    </span>
    {children}
  </button>
)

/** Cuántas de las hojas de un grupo están marcadas: todo, nada o parte. */
const estadoDe = (ids, marcadas = []) => {
  if (!Array.isArray(ids)) return "nada"
  const puestas = ids.filter((id) => (marcadas || []).includes(id)).length
  if (puestas === 0) return "nada"
  return puestas === ids.length ? "todo" : "parte"
}

/**
 * Un departamento con sus capas dentro.
 *
 * **Por qué hay un segundo nivel.** Dentro de cada departamento el SGC publica
 * varias capas —unidades geológicas, fallas, municipios, drenajes—, y encenderlas
 * todas o ninguna no sirve: quien mira la geología de Antioquia no quiere
 * necesariamente los municipios encima. Se despliega aparte del propio
 * departamento, con su flechita, para que marcarlo entero siga siendo un solo
 * gesto.
 */
const Departamento = ({ grupo, marcadas, onToggle }) => {
  const [abierto, setAbierto] = useState(false)
  const hijos = grupo?.children ?? []
  const estado = estadoDe(grupo?.ids, marcadas)

  return (
    <>
      <div className="flex items-center">
        <Casilla
          label={grupo?.label || `Capa ${grupo?.id}`}
          estado={estado}
          sangria="pl-11"
          fuerte
          onClick={() => onToggle(grupo)}
        />
        {hijos.length > 1 && (
          <button
            type="button"
            onClick={() => setAbierto((v) => !v)}
            aria-expanded={abierto}
            aria-label={`Capas de ${grupo?.label}`}
            className="-ml-2 mr-2 shrink-0 rounded p-1 text-zinc-400 transition-colors hover:bg-zinc-800 hover:text-zinc-200"
          >
            <ChevronDown className={`h-3 w-3 transition-transform ${abierto ? "rotate-180 text-white" : ""}`} />
          </button>
        )}
      </div>

      {abierto &&
        hijos.map((hoja) => (
          <Casilla
            key={hoja.id}
            label={hoja.label}
            estado={estadoDe(hoja.ids, marcadas)}
            sangria="pl-[4.25rem]"
            onClick={() => onToggle(hoja)}
          />
        ))}
    </>
  )
}

/**
 * La fila, más su lista de subcapas cuando el servicio tiene varias.
 *
 * **Existe porque «Geología por departamentos» dibujaba solo Antioquia.** No era
 * un fallo: el servicio del SGC trae ese departamento encendido de fábrica y los
 * otros treinta y uno apagados, y nosotros lo estábamos exportando tal cual. La
 * lista sale del propio servicio —no está escrita aquí— así que enseña lo que él
 * diga tener, se llame como se llame.
 *
 * Se pliega y solo aparece con la capa encendida: son más de treinta filas, y
 * desplegadas de entrada empujarían el resto del panel fuera de la pantalla.
 */
const SubLayerHost = ({ layer, state, subLayers, chosenSub, onToggleSubLayer, children }) => {
  const [abierta, setAbierta] = useState(false)
  const gruposValidos = Array.isArray(subLayers)
    ? subLayers.filter((g) => Array.isArray(g?.ids) && g.ids.length > 0)
    : []
  const hayQueElegir = Boolean(state?.on) && gruposValidos.length > 0

  if (!hayQueElegir) return children

  const marcadas = chosenSub ?? []
  // Cuántos departamentos se están dibujando, no cuántos están completos. Con
  // los límites municipales apagados de fábrica —que es lo correcto: tapan la
  // geología— ningún departamento está nunca «completo», así que contar eso
  // habría dejado un «0 de 32 · 32 a medias» permanente que no informa de nada.
  // Que a uno le falte algo se ve en su propia casilla, con la raya.
  const dibujados = gruposValidos.filter((g) => estadoDe(g.ids, marcadas) !== "nada").length

  return (
    <>
      {children}
      <div className="border-b border-zinc-800/40 bg-zinc-950/60">
        <button
          type="button"
          onClick={() => setAbierta((v) => !v)}
          aria-expanded={abierta}
          className="flex w-full items-center justify-between gap-2 py-1.5 pl-11 pr-4 text-[11px] text-zinc-400 transition-colors hover:text-zinc-200"
        >
          <span>
            {dibujados === 0 ? "Elige qué dibujar" : `${dibujados} de ${gruposValidos.length}`}
          </span>
          <ChevronDown className={`h-3.5 w-3.5 shrink-0 transition-transform text-zinc-400 ${abierta ? "rotate-180 text-white" : ""}`} />
        </button>

        {abierta && (
          <div className="max-h-[14rem] overflow-y-auto pb-1.5">
            {gruposValidos.map((grupo) => (
              <Departamento
                key={grupo.id}
                grupo={grupo}
                marcadas={marcadas}
                onToggle={(cual) => onToggleSubLayer?.(layer.key, cual)}
              />
            ))}
          </div>
        )}

        {/* Desmarcarlo todo deja la capa en blanco, y conviene decirlo: si no, se
            lee como que la capa dejó de funcionar. */}
        {marcadas.length === 0 && !abierta && (
          <p className="pb-1.5 pl-11 pr-4 text-[10px] leading-tight text-zinc-500">
            Sin nada marcado, esta capa no dibuja nada.
          </p>
        )}
      </div>
    </>
  )
}

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
  subLayers,
  chosenSub,
  onToggleSubLayer,
}) => (
  <SubLayerHost
    layer={layer}
    state={state}
    subLayers={subLayers}
    chosenSub={chosenSub}
    onToggleSubLayer={onToggleSubLayer}
  >
  <div
    ref={(node) => registerRow(layer.key, node)}
    onClick={() => !layer.pending && onToggle(layer.key)}
    className={`group flex h-[38px] cursor-pointer items-center gap-2 border-b border-zinc-800/40 px-3 transition-all ${
      dragging
        ? "bg-zinc-800/70 opacity-60"
        : state.on
        ? "bg-zinc-800/50 hover:bg-zinc-800/70 text-white"
        : "opacity-60 hover:opacity-100 hover:bg-zinc-900/30"
    }`}
    style={draggable ? { borderLeft: `3px solid ${area.color}`, paddingLeft: "10px" } : undefined}
  >
    {draggable && (
      <button
        type="button"
        onPointerDown={(event) => onDragStart(event, index)}
        onPointerMove={onDragMove}
        onPointerUp={onDragEnd}
        onPointerCancel={onDragEnd}
        onClick={(e) => e.stopPropagation()}
        aria-label={`Reordenar ${layer.label}`}
        title="Arrastra para cambiar qué capa se ve encima"
        className="-ml-1 shrink-0 cursor-grab touch-none text-zinc-500 hover:text-zinc-300 active:cursor-grabbing"
      >
        <GripVertical className="h-3.5 w-3.5" />
      </button>
    )}

    {layer.raster ? (
      <span className="h-4 w-4 shrink-0" aria-hidden="true" />
    ) : (
      <ColorSwatch layer={layer} state={state} disabled={layer.pending} onOpen={onOpenColor} />
    )}

    <button
      type="button"
      role="switch"
      aria-checked={state.on}
      aria-label={layer.label}
      disabled={layer.pending}
      onClick={(e) => {
        e.stopPropagation()
        onToggle(layer.key)
      }}
      title={[layer.label, layer.scale, layer.hint].filter(Boolean).join(" · ")}
      className={`min-w-0 flex-1 truncate text-left text-[13px] transition-colors ${
        state.on
          ? "font-semibold text-white tracking-tight"
          : layer.pending
          ? "cursor-not-allowed text-zinc-600"
          : "text-zinc-400 group-hover:text-zinc-200"
      }`}
    >
      {layer.label}
    </button>

    <div
      onClick={(e) => e.stopPropagation()}
      className="w-[64px] shrink-0 flex items-center justify-end"
    >
      {state.on ? (
        <OpacitySlider
          value={state.opacity}
          onChange={(valor) => onOpacity(layer.key, valor)}
          label={`Opacidad de ${layer.label}`}
          className="w-full"
        />
      ) : (
        <span className="w-full" />
      )}
    </div>
  </div>
  </SubLayerHost>
)

/**
 * Uno de los dos botones del encabezado de un área.
 */
const HeaderButton = ({ icon: Icon, label, color, active, disabled, onClick }) => (
  <button
    type="button"
    disabled={disabled}
    title={label}
    aria-label={label}
    onClick={(event) => {
      event.stopPropagation()
      onClick(event.currentTarget)
    }}
    className={`flex h-5 w-5 shrink-0 items-center justify-center rounded border transition-colors disabled:cursor-not-allowed disabled:opacity-20 ${
      active
        ? "border-transparent text-white shadow-sm"
        : "border-zinc-800 bg-zinc-900/80 text-zinc-400 hover:bg-zinc-800 hover:text-white"
    }`}
    style={
      active
        ? { backgroundColor: color || "#3b82f6" }
        : undefined
    }
  >
    <Icon className="h-3 w-3" />
  </button>
)

export const LayerPanel = ({
  layers,
  order,
  onToggle,
  onOpacity,
  onColor,
  onReorder,
  areaHasFilter,
  onOpenFilters,
  onOpenSearch,
  // Las subcapas del SGC: qué ofrece cada capa y qué está marcado. Llegan de
  // fuera porque quien las descubre es el mapa —se las pregunta al servicio al
  // encender la capa—, no el panel.
  subLayers = {},
  chosenSub = {},
  onToggleSubLayer,
}) => {
  const [onlyActive, setOnlyActive] = useState(false)
  // Qué áreas están desplegadas. Permite múltiples a la vez o todas con Ctrl+clic.
  const [openAreas, setOpenAreas] = useState(() => new Set(["mineria"]))

  const toggleArea = (areaId, event) => {
    if (event?.ctrlKey || event?.metaKey) {
      setOpenAreas((prev) => {
        const allOpen = AREAS.every((a) => prev.has(a.id))
        return allOpen ? new Set() : new Set(AREAS.map((a) => a.id))
      })
    } else {
      setOpenAreas((prev) => {
        const next = new Set(prev)
        if (next.has(areaId)) {
          next.delete(areaId)
        } else {
          next.add(areaId)
        }
        return next
      })
    }
  }

  const [colorTarget, setColorTarget] = useState(null)
  // Qué se está arrastrando y dónde caería si se soltara ahora.
  const [drag, setDrag] = useState(null)
  const rowRefs = useRef(new Map())

  const activeKeys = order.filter((key) => layers[key]?.on)
  const activeCount = activeKeys.length

  // Se guarda el botón, no solo su recuadro: `useDismiss` lo necesita para no
  // tomar por «fuera» el clic que llega al propio botón, y sin eso volver a
  // pulsarlo no cerraba la ventana. El recuadro se saca de él en el momento.
  const openColor = useCallback(
    (key, el) => setColorTarget((actual) => (actual?.key === key ? null : { key, el })),
    [],
  )

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
    subLayers: subLayers[layer.key],
    chosenSub: chosenSub[layer.key],
    onToggleSubLayer,
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
    <div className="-mx-4 text-slate-100">
      {/* Filtro y cuenta */}
      <div className="mb-2 flex items-center justify-between gap-2 px-4">
        <div className="flex rounded-lg bg-zinc-950/80 p-0.5 border border-zinc-800/80">
          {[
            { id: "todas", label: "Todas", value: false },
            { id: "activas", label: "Activas", value: true },
          ].map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => setOnlyActive(tab.value)}
              aria-pressed={onlyActive === tab.value}
              className={`rounded-md px-2.5 py-1 text-xs font-medium transition-all ${
                onlyActive === tab.value
                  ? "bg-zinc-800 text-white font-semibold shadow-sm border border-zinc-700/60"
                  : "text-zinc-400 hover:text-zinc-200"
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
        <span className="text-[11px] font-mono text-zinc-400">
          {activeCount === 1 ? "1 encendida" : `${activeCount} encendidas`}
        </span>
      </div>

      <div className="max-h-[calc(100vh-140px)] overflow-y-auto border-t border-zinc-800/60">
        {onlyActive ? (
          // ───────────── Activas: lista plana y ordenable ─────────────
          activeCount === 0 ? (
            <p className="px-4 py-6 text-center text-xs text-zinc-500">
              Enciende una capa para verla aquí.
            </p>
          ) : (
            <>
              <p className="border-b border-zinc-800/50 bg-zinc-950/60 px-4 py-2 text-[11px] leading-tight text-zinc-400">
                Arrastra para ordenar. La de arriba se dibuja encima de las demás.
              </p>
              {activeKeys.map((key, index) => (
                <div key={key} className="relative">
                  {/* Línea de destino mientras se arrastra. */}
                  {drag && drag.to === index && drag.from !== index && (
                    <span className="pointer-events-none absolute inset-x-3 -top-px z-10 h-0.5 rounded bg-zinc-400" />
                  )}
                  <LayerRow {...filaProps(layerByKey(key), index, true)} />
                </div>
              ))}
            </>
          )
        ) : (
          // ───────────── Todas: áreas desplegables independientes ─────────────
          AREAS.map((area) => {
            const delArea = THEME_LAYERS.filter((layer) => layer.areaId === area.id)
            const encendidas = delArea.filter((layer) => layers[layer.key]?.on).length
            const abierta = openAreas.has(area.id)
            const filtrada = areaHasFilter(area.id)

            return (
              <div key={area.id} className="border-b border-zinc-800/50">
                <div
                  className={`sticky top-0 z-[2] flex items-center gap-2 px-3 py-2 transition-colors ${
                    abierta ? "bg-[#141416]" : "bg-[#09090b]/90 hover:bg-[#141416]/70"
                  }`}
                >
                  <button
                    type="button"
                    onClick={(e) => toggleArea(area.id, e)}
                    aria-expanded={abierta}
                    aria-label={`Capas de ${area.name}`}
                    title="Clic para desplegar/plegar · Ctrl+Clic para todas"
                    className="flex min-w-0 flex-1 items-center gap-2 text-left"
                  >
                    <ChevronRight
                      className={`h-4 w-4 shrink-0 text-zinc-400 transition-transform ${
                        abierta ? "rotate-90 text-white" : ""
                      }`}
                    />
                    <AreaIcon area={area} className="h-4 w-4 shrink-0 text-zinc-400" />
                    <span className="truncate text-[13px] font-semibold tracking-wide text-zinc-100">
                      {area.name}
                    </span>
                    <span className="shrink-0 text-[10.5px] font-mono text-zinc-500">{area.source}</span>
                  </button>

                  <span className="shrink-0 font-mono text-[10.5px] text-zinc-400">
                    {encendidas}/{delArea.length}
                  </span>

                  <HeaderButton
                    icon={Filter}
                    label={`Filtrar ${area.name}`}
                    color={area.color}
                    active={filtrada}
                    disabled={false}
                    onClick={(el) => onOpenFilters(area.id, el)}
                  />
                  {onOpenSearch && (
                    <HeaderButton
                      icon={Search}
                      label={
                        area.searchable
                          ? `Buscar en ${area.name}`
                          : `Buscar en ${area.name}: falta conectar su servicio`
                      }
                      color={area.color}
                      active={false}
                      disabled={!area.searchable}
                      onClick={(el) => onOpenSearch(area.id, el)}
                    />
                  )}
                </div>

                {abierta &&
                  delArea.map((layer) => (
                    <LayerRow key={layer.key} {...filaProps(layer, -1, false)} />
                  ))}
              </div>
            )
          })
        )}
      </div>

      {colorTarget && (
        <ColorPopover
          color={layers[colorTarget.key]?.fillColor || "#3b82f6"}
          alpha={layers[colorTarget.key]?.opacity ?? 0.6}
          anchorRect={colorTarget.el.getBoundingClientRect()}
          anchorEl={colorTarget.el}
          onChange={(color) => onColor(colorTarget.key, color, darken(color, 0.35))}
          onAlphaChange={(alpha) => onOpacity(colorTarget.key, alpha)}
          onClose={() => setColorTarget(null)}
        />
      )}
    </div>
  )
}
