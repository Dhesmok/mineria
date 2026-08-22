"use client"

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { Loader2, MountainSnow, X } from "lucide-react"

import { ACCURACY_WARNING } from "../utils/terrainAnalysis"
import { formatDistance } from "../utils/mapUtils"

/**
 * La gráfica del perfil longitudinal.
 *
 * **Una sola serie, así que no lleva leyenda**: el título ya dice qué se está
 * mirando, y una caja de leyenda con una sola entrada es ruido. Por lo mismo, un
 * solo color: el azul pizarra de la paleta del visor, que sobre blanco tiene
 * contraste de sobra y no compite con los verdes y rojos que la pendiente usa
 * para significar otra cosa.
 *
 * **La interacción no es un extra, es la mitad de la función.** Una curva sola
 * dice que hay un escarpe; no dice *dónde*. Al pasar el puntero por la gráfica
 * —o al moverse con las flechas del teclado— se mueve un punto sobre la línea
 * del mapa y se leen la cota, la distancia y la pendiente de ese sitio exacto.
 *
 * **Los huecos del modelo se dibujan como huecos.** Donde no ha llegado la
 * elevación la línea se corta, en vez de unir los dos extremos con un trazo
 * recto que parecería una llanura. Es la misma decisión que en el módulo de
 * cálculo, y por el mismo motivo: un perfil inventado es de las cosas que
 * alguien usaría para decidir algo.
 */

/** Márgenes de la zona de dibujo, para que quepan las etiquetas de los ejes. */
const MARGEN = { arriba: 10, derecha: 12, abajo: 18, izquierda: 46 }
const ALTO = 130

/** El azul pizarra de la paleta del visor. */
const TRAZO = "#3D5A80"
const RELLENO = "rgba(61, 90, 128, 0.14)"

const metros = (valor) =>
  Number.isFinite(valor) ? `${Math.round(valor).toLocaleString("es-CO")} m` : "—"

const grados = (valor) => (Number.isFinite(valor) ? `${valor.toFixed(1)}°` : "—")

/**
 * La distancia del punto señalado, redondeada.
 *
 * `formatDistance` da dos decimales, que es lo correcto para una medida que se
 * queda quieta —una línea dibujada— y ruido para una que se mueve con el
 * puntero: «299,77 m» pasando a «312,41 m» diez veces por segundo no se lee, y
 * además es falsa precisión sobre un modelo de 30 m.
 */
const distanciaCursor = (metros) =>
  metros >= 1000
    ? `${(metros / 1000).toFixed(2)} km`
    : `${Math.round(metros).toLocaleString("es-CO")} m`

/**
 * Los valores de la escala vertical: cuatro rayas en números redondos.
 *
 * Redondos de verdad —1.400, 1.450, 1.500— y no los extremos exactos del dato,
 * que darían «1.437 m» y no ayudan a leer nada.
 */
const escalaVertical = (min, max) => {
  if (!Number.isFinite(min) || !Number.isFinite(max)) return []
  const rango = Math.max(max - min, 1)
  const crudo = rango / 3
  const magnitud = 10 ** Math.floor(Math.log10(crudo))
  const paso = [1, 2, 5, 10].map((m) => m * magnitud).find((p) => p >= crudo) ?? magnitud * 10

  const valores = []
  for (let v = Math.ceil(min / paso) * paso; v <= max; v += paso) valores.push(v)
  return valores
}

export const TerrainProfile = ({ profile, hovered, onHover, onClose }) => {
  const svgRef = useRef(null)
  const observadorRef = useRef(null)
  const [ancho, setAncho] = useState(600)

  /**
   * El ancho se mide, no se supone: el panel ocupa lo que le deje la pantalla, y
   * en un teléfono no es lo mismo que en un monitor.
   *
   * **Por referencia de retrollamada y no con un efecto de montaje.** La primera
   * versión enganchaba el observador una sola vez al montar el componente, y en
   * ese momento el contenedor de la gráfica todavía no existe: vive dentro de la
   * rama que solo se dibuja cuando ya hay perfil. El observador no llegaba a
   * engancharse nunca y la gráfica se quedaba en el ancho de reserva —600 px—
   * también en un teléfono de 412. Así se engancha cuando el nodo aparece de
   * verdad, y se suelta cuando desaparece.
   */
  const medirCaja = useCallback((nodo) => {
    observadorRef.current?.disconnect()
    observadorRef.current = null
    if (!nodo) return

    const medir = () => setAncho(nodo.clientWidth || 600)
    medir()
    observadorRef.current = new ResizeObserver(medir)
    observadorRef.current.observe(nodo)
  }, [])

  useEffect(() => () => observadorRef.current?.disconnect(), [])

  // `?? []` crea un arreglo nuevo en cada render, y con él de dependencia los
  // dos `useMemo` de abajo se recalcularían siempre —que es justo lo que un
  // `useMemo` viene a evitar—. Envuelto, la identidad solo cambia cuando cambia
  // el perfil.
  const puntos = useMemo(() => profile?.points ?? [], [profile])
  const stats = profile?.stats

  const escalas = useMemo(() => {
    if (!stats || !puntos.length) return null
    const alturas = puntos.map((p) => p.elevation).filter(Number.isFinite)
    if (alturas.length < 2) return null

    const minDato = Math.min(...alturas)
    const maxDato = Math.max(...alturas)
    // Un margen del 8 % arriba y abajo: pegar la curva al borde hace que parezca
    // que el terreno se sale de la gráfica.
    const respiro = Math.max((maxDato - minDato) * 0.08, 5)
    const min = minDato - respiro
    const max = maxDato + respiro

    const w = Math.max(ancho - MARGEN.izquierda - MARGEN.derecha, 10)
    const h = ALTO - MARGEN.arriba - MARGEN.abajo

    return {
      min,
      max,
      x: (distancia) => MARGEN.izquierda + (distancia / stats.length) * w,
      y: (altura) => MARGEN.arriba + h - ((altura - min) / (max - min)) * h,
      w,
      h,
    }
  }, [puntos, stats, ancho])

  /**
   * El trazo, partido en tramos donde falta el dato.
   *
   * Se devuelven pares de caminos —el de la línea y el del relleno— por tramo,
   * en vez de uno solo: un único camino con saltos uniría los extremos del hueco.
   */
  const tramos = useMemo(() => {
    if (!escalas) return []
    const salida = []
    let actual = []

    const cerrar = () => {
      if (actual.length >= 2) salida.push(actual)
      actual = []
    }

    puntos.forEach((punto) => {
      if (!Number.isFinite(punto.elevation)) {
        cerrar()
        return
      }
      actual.push([escalas.x(punto.distance), escalas.y(punto.elevation)])
    })
    cerrar()

    return salida.map((tramo) => ({
      linea: tramo.map(([x, y], i) => `${i === 0 ? "M" : "L"}${x.toFixed(1)} ${y.toFixed(1)}`).join(" "),
      relleno:
        `M${tramo[0][0].toFixed(1)} ${(ALTO - MARGEN.abajo).toFixed(1)} ` +
        tramo.map(([x, y]) => `L${x.toFixed(1)} ${y.toFixed(1)}`).join(" ") +
        ` L${tramo[tramo.length - 1][0].toFixed(1)} ${(ALTO - MARGEN.abajo).toFixed(1)} Z`,
    }))
  }, [puntos, escalas])

  /** Del puntero a una distancia del recorrido. */
  const distanciaEn = useCallback(
    (clientX) => {
      const caja = svgRef.current?.getBoundingClientRect()
      if (!caja || !escalas || !stats) return null
      const x = clientX - caja.left - MARGEN.izquierda
      const t = Math.min(Math.max(x / escalas.w, 0), 1)
      return t * stats.length
    },
    [escalas, stats],
  )

  const alMover = (evento) => {
    const distancia = distanciaEn(evento.clientX)
    if (distancia !== null) onHover(distancia)
  }

  // Con el teclado se recorre igual que con el puntero: es la única forma de
  // usar esto sin ratón, y en un portátil en campo se agradece.
  const alTeclear = (evento) => {
    if (!stats) return
    const paso = evento.shiftKey ? stats.length / 20 : stats.length / 100
    const actual = hovered?.distance ?? 0
    if (evento.key === "ArrowRight") {
      evento.preventDefault()
      onHover(Math.min(actual + paso, stats.length))
    } else if (evento.key === "ArrowLeft") {
      evento.preventDefault()
      onHover(Math.max(actual - paso, 0))
    } else if (evento.key === "Home") {
      evento.preventDefault()
      onHover(0)
    } else if (evento.key === "End") {
      evento.preventDefault()
      onHover(stats.length)
    }
  }

  // Al desmontar, quitar el punto del mapa.
  useEffect(() => () => onHover(null), [onHover])

  const marcas = escalas ? escalaVertical(escalas.min, escalas.max) : []
  const cobertura = stats?.coverage ?? 0

  return (
    <div className="pointer-events-auto w-full rounded-lg border border-slate-200 bg-white shadow-lg">
      <div className="flex items-center gap-2 border-b border-slate-100 px-3 py-1.5">
        <MountainSnow className="h-3.5 w-3.5 shrink-0 text-slate-400" />
        <span className="flex-1 text-[11px] font-medium text-slate-600">Perfil longitudinal</span>
        <button
          type="button"
          onClick={onClose}
          aria-label="Cerrar el perfil"
          title="Cerrar"
          className="rounded p-0.5 text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-700"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </div>

      <div className="px-3 py-2">
        {!profile ? (
          <p className="py-6 text-center text-[12px] text-slate-500">
            Dibuja una línea sobre el mapa para ver su corte del terreno.
          </p>
        ) : profile.pending || !escalas ? (
          <p className="flex items-center justify-center gap-2 py-6 text-[12px] text-slate-500">
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
            {profile.pending
              ? "Esperando el modelo de elevación…"
              : "Sin datos de elevación en este recorrido todavía."}
          </p>
        ) : (
          <>
            <div ref={medirCaja} className="w-full">
              <svg
                ref={svgRef}
                width={ancho}
                height={ALTO}
                role="img"
                tabIndex={0}
                aria-label={
                  `Perfil del terreno a lo largo de ${formatDistance(stats.length)}. ` +
                  `Cota mínima ${metros(stats.min)}, máxima ${metros(stats.max)}. ` +
                  `Usa las flechas para recorrerlo.`
                }
                onPointerMove={alMover}
                onPointerLeave={() => onHover(null)}
                onKeyDown={alTeclear}
                className="block touch-none rounded outline-none focus-visible:ring-2 focus-visible:ring-slate-400"
              >
                {/* La rejilla, discreta: está para leer valores, no para verse. */}
                {marcas.map((valor) => (
                  <g key={valor}>
                    <line
                      x1={MARGEN.izquierda}
                      x2={ancho - MARGEN.derecha}
                      y1={escalas.y(valor)}
                      y2={escalas.y(valor)}
                      stroke="#e2e8f0"
                      strokeWidth="1"
                    />
                    <text
                      x={MARGEN.izquierda - 6}
                      y={escalas.y(valor) + 3}
                      textAnchor="end"
                      className="fill-slate-400 text-[9px] tabular-nums"
                    >
                      {Math.round(valor).toLocaleString("es-CO")}
                    </text>
                  </g>
                ))}

                {tramos.map((tramo, i) => (
                  <g key={i}>
                    <path d={tramo.relleno} fill={RELLENO} />
                    <path
                      d={tramo.linea}
                      fill="none"
                      stroke={TRAZO}
                      strokeWidth="2"
                      strokeLinejoin="round"
                      strokeLinecap="round"
                    />
                  </g>
                ))}

                {/* El cursor: la raya vertical y el punto sobre la curva. */}
                {hovered && Number.isFinite(hovered.elevation) && (
                  <g pointerEvents="none">
                    <line
                      x1={escalas.x(hovered.distance)}
                      x2={escalas.x(hovered.distance)}
                      y1={MARGEN.arriba}
                      y2={ALTO - MARGEN.abajo}
                      stroke="#94a3b8"
                      strokeWidth="1"
                      strokeDasharray="3 3"
                    />
                    <circle
                      cx={escalas.x(hovered.distance)}
                      cy={escalas.y(hovered.elevation)}
                      r="4.5"
                      fill={TRAZO}
                      stroke="#ffffff"
                      strokeWidth="2"
                    />
                  </g>
                )}

                <text
                  x={MARGEN.izquierda}
                  y={ALTO - 5}
                  className="fill-slate-400 text-[9px] tabular-nums"
                >
                  0
                </text>
                <text
                  x={ancho - MARGEN.derecha}
                  y={ALTO - 5}
                  textAnchor="end"
                  className="fill-slate-400 text-[9px] tabular-nums"
                >
                  {formatDistance(stats.length)}
                </text>
              </svg>
            </div>

            {/* La lectura del punto señalado. Ocupa sitio fijo aunque no haya
                nada señalado, o la gráfica daría un salto al entrar el puntero. */}
            <div
              aria-live="polite"
              className="mt-1 flex flex-wrap items-baseline gap-x-4 gap-y-0.5 text-[11px] tabular-nums"
            >
              {hovered ? (
                <>
                  <span className="text-slate-500">
                    En <strong className="font-medium text-slate-900">{distanciaCursor(hovered.distance)}</strong>
                  </span>
                  <span className="text-slate-500">
                    Cota <strong className="font-medium text-slate-900">{metros(hovered.elevation)}</strong>
                  </span>
                  <span className="text-slate-500">
                    Pendiente <strong className="font-medium text-slate-900">{grados(hovered.slope)}</strong>
                  </span>
                </>
              ) : (
                <span className="text-slate-400">
                  Pasa el puntero por la gráfica para leer cada punto sobre el mapa
                </span>
              )}
            </div>

            <div className="mt-1.5 flex flex-wrap items-baseline gap-x-4 gap-y-0.5 border-t border-slate-100 pt-1.5 text-[11px] tabular-nums text-slate-500">
              <span>
                Longitud <strong className="font-medium text-slate-700">{formatDistance(stats.length)}</strong>
              </span>
              <span>
                Mín <strong className="font-medium text-slate-700">{metros(stats.min)}</strong>
              </span>
              <span>
                Máx <strong className="font-medium text-slate-700">{metros(stats.max)}</strong>
              </span>
              {/* Ascenso y descenso acumulados, que no son máximo menos mínimo:
                  una línea que sube un cerro y baja al otro lado tiene desnivel
                  pequeño y mucho acumulado. Es lo que importa para un recorrido. */}
              <span>
                Sube <strong className="font-medium text-slate-700">{metros(stats.gain)}</strong>
              </span>
              <span>
                Baja <strong className="font-medium text-slate-700">{metros(stats.loss)}</strong>
              </span>
              <span>
                Máx. pendiente <strong className="font-medium text-slate-700">{grados(stats.maxSlope)}</strong>
              </span>
            </div>

            {cobertura < 1 && (
              <p className="mt-1 text-[11px] text-amber-700">
                Falta el modelo de elevación en parte del recorrido: hay dato en el{" "}
                {Math.round(cobertura * 100)} %. Los tramos sin dato salen cortados, no
                inventados.
              </p>
            )}

            <p className="mt-1 text-[10px] leading-tight text-slate-400">{ACCURACY_WARNING}</p>
          </>
        )}
      </div>
    </div>
  )
}
