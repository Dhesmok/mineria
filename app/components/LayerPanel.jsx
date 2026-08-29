"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import { Check, ChevronDown, ChevronRight, Filter, GripVertical, Search } from "lucide-react"

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
    onClick={(event) => onOpen(layer.key, event.currentTarget)}
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
/**
 * Una casilla de subcapa: un departamento, o una de las capas que lleva dentro.
 *
 * El mismo componente para los dos niveles porque es la misma acción —marcar lo
 * que se quiere ver— y solo cambian la sangría y el peso de la letra. Un
 * departamento a medias no se dibuja ni marcado ni vacío: se enseña a medias,
 * que es la verdad y es lo que invita a desplegarlo.
 */
const Casilla = ({ label, estado, sangria, fuerte, onClick, children }) => (
  <button
    type="button"
    onClick={onClick}
    aria-pressed={estado === "todo"}
    className={`flex w-full items-center gap-2 py-1 pr-4 text-left transition-colors hover:bg-white ${sangria}`}
  >
    <span
      className={`flex h-3 w-3 shrink-0 items-center justify-center rounded-[3px] border ${
        estado === "nada" ? "border-slate-300" : "border-slate-800 bg-slate-800"
      }`}
    >
      {estado === "todo" && <Check className="h-2.5 w-2.5 text-white" />}
      {estado === "parte" && <span className="h-[2px] w-[7px] rounded-full bg-white" />}
    </span>
    <span
      className={`min-w-0 flex-1 truncate text-[11px] ${
        estado === "nada" ? "text-slate-500" : "text-slate-800"
      } ${fuerte ? "font-medium" : ""}`}
    >
      {label}
    </span>
    {children}
  </button>
)

/** Cuántas de las hojas de un grupo están marcadas: todo, nada o parte. */
const estadoDe = (ids, marcadas) => {
  const puestas = ids.filter((id) => marcadas.includes(id)).length
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
  const hijos = grupo.children ?? []
  const estado = estadoDe(grupo.ids, marcadas)

  return (
    <>
      <div className="flex items-center">
        <Casilla
          label={grupo.label}
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
            aria-label={`Capas de ${grupo.label}`}
            className="-ml-2 mr-2 shrink-0 rounded p-1 text-slate-300 transition-colors hover:bg-white hover:text-slate-500"
          >
            <ChevronDown className={`h-3 w-3 transition-transform ${abierto ? "rotate-180" : ""}`} />
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
  const hayQueElegir = Boolean(state?.on) && (subLayers?.length ?? 0) > 0

  if (!hayQueElegir) return children

  const marcadas = chosenSub ?? []
  // Cuántos departamentos se están dibujando, no cuántos están completos. Con
  // los límites municipales apagados de fábrica —que es lo correcto: tapan la
  // geología— ningún departamento está nunca «completo», así que contar eso
  // habría dejado un «0 de 32 · 32 a medias» permanente que no informa de nada.
  // Que a uno le falte algo se ve en su propia casilla, con la raya.
  const dibujados = subLayers.filter((g) => estadoDe(g.ids, marcadas) !== "nada").length

  return (
    <>
      {children}
      <div className="border-b border-slate-100 bg-slate-50/60">
        <button
          type="button"
          onClick={() => setAbierta((v) => !v)}
          aria-expanded={abierta}
          className="flex w-full items-center justify-between gap-2 py-1.5 pl-11 pr-4 text-[11px] text-slate-500 transition-colors hover:text-slate-700"
        >
          <span>
            {dibujados === 0 ? "Elige qué dibujar" : `${dibujados} de ${subLayers.length}`}
          </span>
          <ChevronDown className={`h-3.5 w-3.5 shrink-0 transition-transform ${abierta ? "rotate-180" : ""}`} />
        </button>

        {abierta && (
          <div className="max-h-[13rem] overflow-y-auto pb-1.5">
            {subLayers.map((grupo) => (
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
          <p className="pb-1.5 pl-11 pr-4 text-[10px] leading-tight text-slate-400">
            Sin nada marcado, esta capa no dibuja nada.
          </p>
        )}
      </div>
    </>
  )
}

/**
 * La barra de opacidad de una capa.
 *
 * **Por qué no es un `input` a secas, que es lo que era.** Al arrastrarla rápido
 * y soltar el ratón *fuera* de la barra, el valor que quedaba no era el elegido:
 * la capa podía verse a media transparencia con la barra puesta del todo a la
 * derecha, o no verse.
 *
 * La causa es de las que solo se dan cuando algo va lento. Es un control
 * gobernado por React: lo que se ve es el valor del estado, no el del navegador.
 * Cada movimiento manda un valor nuevo, y mientras React reconstruye la lista y
 * MapLibre repinta —con el mapa cargado, eso son milisegundos de sobra— llegan
 * más movimientos. Si el último cae en ese hueco y encima el ratón se suelta
 * fuera, ese valor se pierde y en pantalla queda el penúltimo.
 *
 * El arreglo son dos cosas. Mientras se arrastra manda el navegador —el valor se
 * guarda aquí al lado y la barra deja de esperar a nadie—, y al soltar se lee del
 * propio elemento el valor final y se manda. Y el «soltar» se escucha **en toda
 * la ventana**, que es lo que arregla el caso de soltar fuera: el `pointerup` de
 * un elemento no se dispara si el dedo ya no está encima, pero el del documento
 * sí.
 */
const OpacitySlider = ({ layer, state, onOpacity }) => {
  // `null` significa «no se está arrastrando»: entonces manda el estado.
  const [arrastrando, setArrastrando] = useState(null)
  const inputRef = useRef(null)

  useEffect(() => {
    if (arrastrando === null) return

    const soltar = () => {
      const valor = Number(inputRef.current?.value)
      setArrastrando(null)
      if (Number.isFinite(valor)) onOpacity(layer.key, valor / 100)
    }

    // `pointercancel` también: en el móvil, un gesto que el navegador decide
    // convertir en desplazamiento cancela el puntero sin soltarlo, y sin esto la
    // barra se quedaba creyendo que seguía arrastrándose.
    window.addEventListener("pointerup", soltar)
    window.addEventListener("pointercancel", soltar)
    return () => {
      window.removeEventListener("pointerup", soltar)
      window.removeEventListener("pointercancel", soltar)
    }
  }, [arrastrando, layer.key, onOpacity])

  const valor = arrastrando ?? Math.round(state.opacity * 100)

  return (
    <input
      ref={inputRef}
      type="range"
      min="0"
      max="100"
      value={valor}
      onPointerDown={() => setArrastrando(Math.round(state.opacity * 100))}
      onChange={(event) => {
        const nuevo = Number(event.target.value)
        // Se guarda aquí *y* se manda fuera: aquí para que la barra siga al dedo
        // sin esperar, y fuera para que el mapa cambie mientras se arrastra, que
        // es como se elige una transparencia.
        if (arrastrando !== null) setArrastrando(nuevo)
        onOpacity(layer.key, nuevo / 100)
      }}
      aria-label={`Opacidad de ${layer.label}`}
      className="panel-opacidad w-[62px] shrink-0"
    />
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

    {/* Sin selector de color en las capas ráster: llegan ya dibujadas por el
        servicio, con la simbología que un geólogo reconoce —el amarillo de un
        cuaternario, el granate de un batolito—.

        Y no apagado sino ausente. Apagado ya se probó, y no basta: un cuadrito
        gris junto a la capa sigue pareciendo un botón, se sigue intentando
        pulsar, y no pasa nada. Lo que ocupa su sitio es un hueco del mismo
        ancho, para que las filas no bailen entre las capas que sí eligen color
        y las que no. */}
    {layer.raster ? (
      <span className="h-4 w-4 shrink-0" aria-hidden="true" />
    ) : (
      <ColorSwatch layer={layer} state={state} disabled={layer.pending} onOpen={onOpenColor} />
    )}

    <span
      className={`min-w-0 flex-1 truncate text-[13px] ${
        state.on ? "text-slate-900" : layer.pending ? "text-slate-400" : "text-slate-600"
      }`}
      // La pista y la escala van al `title`: es donde caben sin gastar ancho, y
      // «1:500.000» contra «1:100.000» es la diferencia entre dos capas que en la
      // lista se llaman casi igual.
      title={[layer.label, layer.scale, layer.hint].filter(Boolean).join(" · ")}
    >
      {layer.label}
    </span>

    {/* La barra reserva su sitio aunque la capa esté apagada: si apareciera y
        desapareciera, la lista entera daría un salto en cada interruptor. */}
    {state.on ? (
      <OpacitySlider layer={layer} state={state} onOpacity={onOpacity} />
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
  </SubLayerHost>
)

/**
 * Uno de los dos botones del encabezado de un área.
 *
 * Llevan el color del área para que se entiendan sin explicación: son "cosas de
 * Minería" o "cosas de Geología". Encendido cuando ese filtro está puesto, para
 * que se vea desde fuera que un área está filtrada aunque esté plegada.
 *
 * `stopPropagation` no es opcional: viven dentro del botón que pliega el área, y
 * sin él, filtrar o buscar cerraría el área de paso.
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
    className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-md border transition-colors disabled:cursor-not-allowed disabled:opacity-30 ${
      active ? "border-transparent text-white" : "border-slate-200 bg-white"
    }`}
    style={
      active
        ? { backgroundColor: color }
        : disabled
          ? { color: "#94a3b8" }
          : { color }
    }
  >
    <Icon className="h-3.5 w-3.5" />
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
  // Qué área está desplegada. Solo una a la vez: con cuatro áreas abiertas el
  // panel medía más que la pantalla y había que desplazarse para todo.
  const [openArea, setOpenArea] = useState("mineria")
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
          // ───────────── Todas: un área abierta a la vez ─────────────
          AREAS.map((area) => {
            const delArea = THEME_LAYERS.filter((layer) => layer.areaId === area.id)
            const encendidas = delArea.filter((layer) => layers[layer.key]?.on).length
            const abierta = openArea === area.id
            const filtrada = areaHasFilter(area.id)

            return (
              <div key={area.id}>
                {/* El encabezado es el propio botón de plegar. Los dos botones
                    de la derecha llevan `stopPropagation` porque viven dentro de
                    él: sin eso, filtrar o buscar cerraría el área de paso. */}
                <div
                  className={`sticky top-0 z-[2] flex items-center gap-2 border-b border-slate-200 px-4 py-2 transition-colors ${
                    abierta ? "bg-slate-100" : "bg-slate-50 hover:bg-slate-100"
                  }`}
                >
                  <button
                    type="button"
                    onClick={() => setOpenArea(abierta ? null : area.id)}
                    aria-expanded={abierta}
                    // El nombre accesible se pone a mano aunque el botón ya lleve
                    // el texto del área dentro: si no, los tres botones del
                    // encabezado —este, filtrar y buscar— se llamarían todos
                    // "Geología" y no habría forma de distinguirlos, ni para un
                    // lector de pantalla ni para las pruebas.
                    aria-label={`Capas de ${area.name}`}
                    className="flex min-w-0 flex-1 items-center gap-2 text-left"
                  >
                    <ChevronRight
                      className={`h-3.5 w-3.5 shrink-0 text-slate-400 transition-transform ${
                        abierta ? "rotate-90" : ""
                      }`}
                    />
                    <AreaIcon area={area} className="h-3.5 w-3.5 shrink-0" />
                    <span
                      className="truncate text-[11px] font-semibold uppercase tracking-[0.06em]"
                      style={{ color: area.color }}
                    >
                      {area.name}
                    </span>
                    <span className="shrink-0 text-[11px] text-slate-400">{area.source}</span>
                  </button>

                  <span className="shrink-0 text-[11px] tabular-nums text-slate-500">
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
          color={layers[colorTarget.key].fillColor}
          anchorRect={colorTarget.el.getBoundingClientRect()}
          anchorEl={colorTarget.el}
          onChange={(color) => onColor(colorTarget.key, color, darken(color, 0.35))}
          onClose={() => setColorTarget(null)}
        />
      )}
    </div>
  )
}
