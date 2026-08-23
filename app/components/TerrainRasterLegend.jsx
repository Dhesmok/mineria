"use client"

import { useCallback, useRef, useState } from "react"

import { useDismiss } from "../hooks/useDismiss"
import { ACCURACY_USE } from "../utils/terrainAnalysis"
import { ASPECT_LEGEND, SLOPE_LEGEND, resolutionNote } from "../utils/terrainRaster"

/**
 * La leyenda de la capa derivada del terreno.
 *
 * Sin leyenda, una capa de colores es una mancha bonita: nadie puede decir si el
 * amarillo son diez grados o cuarenta. Y los tramos de la pendiente no son una
 * escala repartida a ojo, son los umbrales con los que se lee un terreno —de
 * dónde se transita sin obra a dónde hay que cortar—, así que cada uno lleva su
 * nombre además de su rango.
 *
 * Cuando la capa no se puede dibujar, esto es lo que dice por qué. Es preferible
 * a apagar el botón sin explicación: el usuario ya pidió verla y merece saber
 * qué falta.
 *
 * **La resolución vive detrás de un icono, y esa es la decisión de diseño que
 * conviene entender.** Estuvo un rato como un «celdas 19 m» permanente en el
 * encabezado, y era peor de lo que parecía: ese número solo se entiende con dos
 * frases de contexto —el modelo mide cada 30 m, lo de en medio es interpolación—
 * y sin ellas se lee como «este mapa tiene 19 m de detalle», que es justo lo
 * contrario de lo que hay que entender. Un número sin su explicación al lado no
 * informa, desinforma. Detrás del icono caben las dos frases.
 *
 * Lo que **no** se esconde es para qué sirve la capa y para qué no: eso se queda
 * en el aviso ámbar, a la vista, porque es lo único que impide que alguien planee
 * un banco con este mapa.
 */

/** Para enlazar el botón con su ventana de cara a los lectores de pantalla. */
const ID_NOTA = "leyenda-terreno-resolucion"

const TITULOS = {
  slope: "Pendiente del terreno",
  aspect: "Orientación de la ladera",
}

/** El círculo con la i. */
const IconoInfo = () => (
  <svg viewBox="0 0 16 16" className="h-3.5 w-3.5" fill="none" stroke="currentColor" aria-hidden>
    <circle cx="8" cy="8" r="6.3" strokeWidth="1.3" />
    <path d="M8 7.3v3.9" strokeWidth="1.5" strokeLinecap="round" />
    <path d="M8 4.9h.01" strokeWidth="1.7" strokeLinecap="round" />
  </svg>
)

export const TerrainRasterLegend = ({ mode, unavailable, progress, cellSize }) => {
  const tramos = mode === "aspect" ? ASPECT_LEGEND.slice(0, 8) : SLOPE_LEGEND
  const cargando = Boolean(progress && progress.total > 0 && progress.hechas < progress.total)
  const porcentaje = cargando ? Math.round((progress.hechas / progress.total) * 100) : 100

  // La nota solo tiene sentido con la capa ya pintada: durante la carga el tamaño
  // de celda todavía puede cambiar, si el área obliga a bajar un nivel.
  const nota = !unavailable && !cargando ? resolutionNote(cellSize) : null

  const [infoAbierta, setInfoAbierta] = useState(false)
  const cajaRef = useRef(null)
  const cerrarInfo = useCallback(() => setInfoAbierta(false), [])
  useDismiss(cajaRef, null, cerrarInfo)

  /**
   * Abrir al pasar el ratón, **solo si de verdad es un ratón**.
   *
   * En táctil el navegador emite también `pointerenter` y `pointerleave`, con
   * `pointerType` «touch», alrededor del toque. Sin la comprobación, un toque
   * abriría la ventana con uno y la cerraría con el clic que viene detrás, en el
   * mismo gesto: parecería que el icono no responde.
   */
  const soloRaton = (accion) => (evento) => {
    if (evento.pointerType === "mouse") accion()
  }

  /**
   * ¿El foco llegó por teclado?
   *
   * **Esta es la que se coló en la primera versión**, y es la misma trampa por
   * otra puerta: en el teléfono, el `mousedown` de compatibilidad da el foco al
   * botón antes del clic. Abrir en `focus` a secas hacía que un toque abriera la
   * ventana y el clic siguiente la cerrara —el icono simplemente no respondía—.
   * Se vio registrando la secuencia real de eventos en un Pixel 7; leyendo el
   * código parecía correcto.
   *
   * `:focus-visible` es exactamente «el foco llegó por teclado», que es cuando
   * no hay ni ratón que pasar por encima ni clic que dé la orden.
   */
  const porTeclado = (elemento) => {
    try {
      return elemento.matches(":focus-visible")
    } catch {
      // Navegador que no conozca el selector: mejor no abrirla sola que
      // abrirla y cerrarla en el mismo toque.
      return false
    }
  }

  return (
    <div
      ref={cajaRef}
      onPointerLeave={soloRaton(cerrarInfo)}
      className="relative w-[min(13rem,calc(100vw-1.5rem))]"
    >
      <div className="overflow-hidden rounded-lg border border-slate-200 bg-white shadow-lg">
        <div className="flex items-center justify-between gap-2 border-b border-slate-100 bg-slate-50 px-2.5 py-1.5">
          <p className="text-[11px] font-medium text-slate-600">{TITULOS[mode] ?? "Terreno"}</p>
          {nota ? (
            <button
              type="button"
              aria-label="Cómo se calculó esta capa"
              aria-expanded={infoAbierta}
              aria-describedby={infoAbierta ? ID_NOTA : undefined}
              onClick={() => setInfoAbierta((abierta) => !abierta)}
              onPointerEnter={soloRaton(() => setInfoAbierta(true))}
              onFocus={(evento) => {
                if (porTeclado(evento.target)) setInfoAbierta(true)
              }}
              className={`-my-1 -mr-1 shrink-0 rounded p-1 transition-colors ${
                infoAbierta ? "text-slate-600" : "text-slate-400"
              } hover:text-slate-600 focus:outline-none focus-visible:ring-2 focus-visible:ring-slate-300`}
            >
              <IconoInfo />
            </button>
          ) : null}
        </div>

        {/* El aviso de progreso.
            No es decoración: bajar cuarenta teselas por primera vez tarda lo que
            tarde la red, y sin esto la capa parecería colgada. Al volver sobre una
            zona ya vista ni se llega a ver, porque las teselas están guardadas. */}
        {cargando && !unavailable ? (
          <div className="px-2.5 py-2">
            <div className="flex items-baseline justify-between gap-2 text-[11px] text-slate-600">
              <span>Cargando el modelo…</span>
              <span className="tabular-nums text-slate-400">
                {progress.hechas}/{progress.total}
              </span>
            </div>
            <div className="mt-1.5 h-1 overflow-hidden rounded-full bg-slate-100">
              <div
                className="h-full rounded-full bg-slate-400 transition-[width] duration-200"
                style={{ width: `${porcentaje}%` }}
              />
            </div>
          </div>
        ) : unavailable ? (
          <p className="px-2.5 py-2 text-[11px] leading-tight text-slate-500">{unavailable}</p>
        ) : (
          <div
            // La orientación son ocho tramos: en una sola columna la leyenda mide
            // más que la ventana del 3D que tiene al lado. En dos columnas cabe.
            className={`gap-x-3 gap-y-1 px-2.5 py-2 ${
              mode === "aspect" ? "grid grid-cols-2" : "space-y-1"
            }`}
          >
            {tramos.map(({ label, hint, color }) => (
              <div key={label} className="flex items-center gap-2">
                <span
                  className="h-3 w-5 shrink-0 rounded-[3px]"
                  style={{ backgroundColor: `rgb(${color.join(",")})` }}
                />
                <span className="flex-1 text-[11px] tabular-nums text-slate-700">{label}</span>
                {mode !== "aspect" && <span className="text-[10px] text-slate-400">{hint}</span>}
              </div>
            ))}
          </div>
        )}

        <p className="border-t border-slate-100 bg-amber-50 px-2.5 py-1.5 text-[10px] leading-tight text-amber-900">
          {ACCURACY_USE}
        </p>
      </div>

      {/* La ventana de la resolución, y dónde se abre.
          En pantalla ancha sale **al costado izquierdo**, sobre el mapa: abierta
          por debajo tapaba la columna de botones entera —Dibujo, Terreno, 3D,
          GPS—, que es lo último que uno quiere esconder por leer una nota.
          En el teléfono no cabe al costado, porque la leyenda ya ocupa casi todo
          el ancho, así que ahí sí baja. */}
      {nota && infoAbierta ? (
        <div
          id={ID_NOTA}
          role="tooltip"
          className="absolute right-0 top-full z-20 mt-1 w-[min(17rem,calc(100vw-2rem))] rounded-lg border border-slate-200 bg-white p-2.5 shadow-lg sm:right-full sm:top-0 sm:mr-2 sm:mt-0"
        >
          <p className="text-[11px] font-medium text-slate-700">De dónde sale este mapa</p>

          <p className="mt-1 text-[11px] leading-snug text-slate-600">
            El modelo mide la altura del terreno cada ~{nota.source} m.{" "}
            {nota.interpolated ? (
              <>
                Aquí se dibuja sobre celdas de {nota.cell} m: las de en medio están{" "}
                <strong className="font-medium text-slate-700">interpoladas</strong> para que se vea
                suave, no son medidas nuevas.
              </>
            ) : (
              <>
                A este zoom se dibuja sobre celdas de {nota.cell} m, así que cada una{" "}
                <strong className="font-medium text-slate-700">resume</strong> varias medidas.
              </>
            )}
          </p>

          <p className="mt-1.5 text-[11px] leading-snug text-slate-600">
            Cada valor sale de mirar las celdas vecinas, así que lo que lees es el promedio de unos{" "}
            <strong className="font-medium text-slate-700">{nota.window} m</strong> de terreno. Nada
            más pequeño que eso aparece en el mapa.
          </p>

          <p className="mt-2 border-t border-slate-100 pt-1.5 text-[10px] leading-tight text-slate-400">
            Terrain Tiles (AWS Open Data). Alturas elipsoidales.
          </p>
        </div>
      ) : null}
    </div>
  )
}
