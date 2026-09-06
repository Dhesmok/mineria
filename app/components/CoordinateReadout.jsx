"use client"

import { useEffect, useState } from "react"

import { axisLabels, crsById, formatCoordinate, fromGeographic } from "../utils/crs"
import { parseCoordinateInput } from "../utils/coordinateInput"

/**
 * Las dos piezas que enseñan y reciben una posición sobre el mapa.
 *
 * Vivían dentro de `MapComponentGL`, que llegó a las mil cien líneas. Sacarlas
 * no cambia nada de lo que hacen: es el mismo movimiento que ya se hizo con el
 * panel de capas, y por la misma razón —ese archivo es donde se cruza todo y por
 * eso es donde más caro sale equivocarse—.
 */

/**
 * Lectura de la posición del cursor.
 *
 * Va en su propio componente porque el ratón dispara eventos decenas de veces
 * por segundo: así se vuelve a pintar solo este recuadro y no el visor entero.
 *
 * Se expresa en el sistema de coordenadas que esté elegido en el panel, no
 * siempre en grados: si alguien está trabajando en Origen Nacional, leer la
 * posición del ratón en grados le obliga a convertir de cabeza cada vez.
 */
export const CursorCoordinates = ({ map, crsId }) => {
  const [position, setPosition] = useState(null)

  useEffect(() => {
    if (!map) return

    // `wrap()` devuelve la longitud al rango -180..180. Sin esto, arrastrar el
    // mapa dando la vuelta al mundo muestra longitudes como -434°.
    const handleMove = (event) => setPosition(event.lngLat.wrap())
    const handleOut = () => setPosition(null)

    map.on("mousemove", handleMove)
    map.on("mouseout", handleOut)

    return () => {
      map.off("mousemove", handleMove)
      map.off("mouseout", handleOut)
    }
  }, [map])

  // En pantallas táctiles no hay cursor y nunca llega un mousemove; el recuadro
  // simplemente no aparece, en vez de quedarse mostrando ceros.
  if (!position) return null

  const ejes = axisLabels(crsId)
  const [x, y] = fromGeographic([position.lng, position.lat], crsId)

  return (
    // Centrada abajo. Estuvo en las dos esquinas inferiores y las dos acabaron
    // ocupadas: la derecha por los botones y la izquierda por la escala. En el
    // centro no compite con nada y es donde la vista ya está mirando.
    <div className="pointer-events-none absolute bottom-4 left-1/2 z-10 -translate-x-1/2 rounded-full border border-zinc-800/90 bg-[#09090b]/90 px-4 py-1.5 font-mono text-[12.5px] font-medium tabular-nums text-zinc-200 shadow-2xl backdrop-blur-2xl transition-all">
      {ejes.first} <span className="text-white font-semibold">{formatCoordinate(y, crsId)}</span> · {ejes.second} <span className="text-white font-semibold">{formatCoordinate(x, crsId)}</span>
    </div>
  )
}

/**
 * Escribir una coordenada para marcarla.
 *
 * Vivía en el panel lateral, siempre a la vista, y ahí estorbaba: es algo que se
 * usa de vez en cuando y ocupaba sitio permanente. Ahora sale aquí abajo, en el
 * centro, y solo mientras está activa la herramienta de punto. Así ese botón
 * sirve para las dos formas de marcar un punto —con el ratón sobre el mapa o
 * escribiendo la coordenada—, que son la misma tarea.
 *
 * Dos casillas y no una sola: separar la ordenada de la abscisa evita la
 * ambigüedad de la coma que obligaba a adivinar dónde partía el par. Cada
 * casilla se sigue leyendo con el mismo intérprete, así que dentro de una se
 * puede escribir con coma decimal o en grados, minutos y segundos.
 */
export const CoordinateEntry = ({ crsId, onGo }) => {
  const [first, setFirst] = useState("")
  const [second, setSecond] = useState("")
  const [message, setMessage] = useState(null)

  const ejes = axisLabels(crsId)
  const crs = crsById(crsId)
  const ejemplo = crs.projected ? ["2247195", "4713441"] : ["6,2308", "-75,5906"]

  const go = () => {
    const resultado = parseCoordinateInput(`${first} ${second}`, crsId)

    if (resultado.error) {
      setMessage({ tone: "error", text: resultado.error })
      return
    }

    onGo(resultado.lon, resultado.lat)
    // Fuera de Colombia no es un error —puede ser a propósito—, pero casi
    // siempre significa haber intercambiado los dos números.
    setMessage(
      resultado.outsideColombia
        ? { tone: "warning", text: "Ese punto queda fuera de Colombia. Revisa el orden y el sistema." }
        : null,
    )
    setFirst("")
    setSecond("")
  }

  const alPulsarEnter = (event) => {
    if (event.key === "Enter") go()
  }

  return (
    <div className="absolute bottom-24 left-1/2 z-20 w-[min(24rem,calc(100vw-1.5rem))] -translate-x-1/2 rounded-2xl border border-zinc-800/90 bg-[#09090b]/95 p-3.5 shadow-2xl backdrop-blur-2xl md:bottom-16 md:w-auto text-zinc-100">
      <div className="flex items-end gap-2">
        {[
          { label: ejes.first, value: first, set: setFirst, hint: ejemplo[0] },
          { label: ejes.second, value: second, set: setSecond, hint: ejemplo[1] },
        ].map((campo) => (
          <label key={campo.label} className="flex flex-col gap-1">
            <span className="text-[10px] font-semibold uppercase tracking-wider text-zinc-400">
              {campo.label}
            </span>
            <input
              value={campo.value}
              onChange={(event) => {
                campo.set(event.target.value)
                setMessage(null)
              }}
              onKeyDown={alPulsarEnter}
              placeholder={campo.hint}
              aria-label={campo.label}
              autoComplete="off"
              className="h-8 w-28 rounded-lg border border-zinc-800 bg-zinc-900/80 px-2.5 font-mono text-[13px] text-zinc-100 placeholder:text-zinc-500 outline-none focus:border-zinc-600 focus:ring-1 focus:ring-zinc-600"
            />
          </label>
        ))}

        <button
          type="button"
          onClick={go}
          className="h-8 rounded-lg border border-zinc-700 bg-zinc-800 px-4 text-[13px] font-semibold text-white transition-colors hover:bg-zinc-700 shadow-sm"
        >
          Ir
        </button>
      </div>

      <p className="mt-1.5 text-[10px] leading-tight text-zinc-400">
        {crs.label}
        {!crs.projected && " · también entiende grados, minutos y segundos"}
      </p>

      {message && (
        <p
          className={`mt-1 text-[11px] leading-tight ${
            message.tone === "error" ? "text-rose-400" : "text-amber-400"
          }`}
        >
          {message.text}
        </p>
      )}
    </div>
  )
}
