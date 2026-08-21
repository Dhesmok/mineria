"use client"

import { useEffect, useState } from "react"
import { Download, Image as ImageIcon, Loader2, X } from "lucide-react"

import {
  EXPORT_SCALES,
  buildFooter,
  exportFileName,
  metersPerPixel,
  scaleBarFor,
} from "../utils/imageExport"

/**
 * Exportar el mapa como imagen.
 *
 * Que sirva de verdad, no que sea un botón más. Tres decisiones lo separan de
 * una captura de pantalla:
 *
 * 1. **No sale ni un control.** Lo que se guarda es el mapa, no la interfaz.
 *    Para eso no se fotografía la pantalla: se lee el lienzo de MapLibre y se
 *    vuelve a componer encima lo que sí tiene que salir.
 * 2. **Se elige qué entra.** Fondo, capas, dibujo, etiquetas, escala, norte y
 *    pie: cada uno se puede quitar. Un mapa para un informe y uno para enseñar
 *    dónde queda algo no llevan lo mismo.
 * 3. **El pie va automático**: capas, sistema de coordenadas, fecha y fuentes.
 *    Una imagen de un título minero sin esos cuatro datos no sirve como soporte
 *    de nada, y ponerlos a mano es justo lo que nadie hace.
 *
 * La parte incómoda: **las etiquetas no están en el lienzo**. Son elementos
 * HTML colgados del mapa —ver `mapLabelsGL.js` para el porqué—, así que el
 * lienzo no las trae y hay que volver a pintarlas una a una sobre la imagen.
 */

/** Lo que se puede meter o quitar de la imagen. */
const PIECES = [
  { id: "basemap", label: "Mapa de fondo", hint: "La imagen o el callejero de debajo" },
  { id: "layers", label: "Capas encendidas", hint: "Títulos, solicitudes y demás" },
  { id: "drawings", label: "Lo dibujado", hint: "Polígonos, líneas y puntos" },
  { id: "labels", label: "Etiquetas", hint: "Los códigos de expediente" },
  { id: "scale", label: "Escala", hint: "Barra con la distancia" },
  { id: "north", label: "Flecha de norte", hint: "Orientada según el giro del mapa" },
  { id: "footer", label: "Pie de datos", hint: "Sistema, fecha y fuentes" },
]

const DEFAULTS = {
  basemap: true,
  layers: true,
  drawings: true,
  labels: true,
  scale: true,
  north: true,
  footer: true,
}

const FOOTER_LINE_HEIGHT = 18
const FOOTER_PADDING = 12

/** El pie: una franja blanca bajo el mapa con las líneas de datos. */
const drawFooter = (ctx, lineas, ancho, arriba, escala) => {
  const alto = lineas.length * FOOTER_LINE_HEIGHT + FOOTER_PADDING * 2

  ctx.save()
  ctx.scale(escala, escala)
  ctx.fillStyle = "#ffffff"
  ctx.fillRect(0, arriba / escala, ancho / escala, alto)
  ctx.fillStyle = "#e2e8f0"
  ctx.fillRect(0, arriba / escala, ancho / escala, 1)

  ctx.fillStyle = "#475569"
  ctx.font = "12px system-ui, -apple-system, sans-serif"
  ctx.textBaseline = "top"
  lineas.forEach((linea, i) => {
    ctx.fillText(linea, FOOTER_PADDING, arriba / escala + FOOTER_PADDING + i * FOOTER_LINE_HEIGHT)
  })
  ctx.restore()
}

/** La barra de escala, abajo a la izquierda del mapa. */
const drawScaleBar = (ctx, barra, altoMapa, escala) => {
  const x = 12
  const y = altoMapa / escala - 22

  ctx.save()
  ctx.scale(escala, escala)
  ctx.fillStyle = "rgba(255,255,255,0.9)"
  ctx.fillRect(x - 4, y - 14, barra.width + 40, 26)

  ctx.strokeStyle = "#0f172a"
  ctx.lineWidth = 2
  ctx.beginPath()
  ctx.moveTo(x, y - 4)
  ctx.lineTo(x, y + 2)
  ctx.lineTo(x + barra.width, y + 2)
  ctx.lineTo(x + barra.width, y - 4)
  ctx.stroke()

  ctx.fillStyle = "#0f172a"
  ctx.font = "11px system-ui, -apple-system, sans-serif"
  ctx.textBaseline = "bottom"
  ctx.fillText(barra.label, x + barra.width + 6, y + 4)
  ctx.restore()
}

/**
 * La flecha de norte, arriba a la derecha.
 *
 * Girada según el rumbo de la cámara: en un mapa que se puede rotar, una flecha
 * que siempre apunte hacia arriba es peor que no poner ninguna.
 */
const drawNorthArrow = (ctx, bearing, anchoMapa, escala) => {
  const cx = anchoMapa / escala - 32
  const cy = 34

  ctx.save()
  ctx.scale(escala, escala)
  ctx.translate(cx, cy)

  ctx.fillStyle = "rgba(255,255,255,0.9)"
  ctx.beginPath()
  ctx.arc(0, 0, 22, 0, Math.PI * 2)
  ctx.fill()

  ctx.rotate((-bearing * Math.PI) / 180)
  ctx.fillStyle = "#0f172a"
  ctx.beginPath()
  ctx.moveTo(0, -14)
  ctx.lineTo(6, 8)
  ctx.lineTo(0, 4)
  ctx.lineTo(-6, 8)
  ctx.closePath()
  ctx.fill()
  ctx.restore()

  ctx.save()
  ctx.scale(escala, escala)
  ctx.fillStyle = "#0f172a"
  ctx.font = "bold 10px system-ui, -apple-system, sans-serif"
  ctx.textAlign = "center"
  ctx.fillText("N", cx, cy + 20)
  ctx.restore()
}

/** Las etiquetas HTML, repintadas sobre la imagen en su sitio. */
const drawLabels = (ctx, etiquetas, escala) => {
  ctx.save()
  ctx.scale(escala, escala)
  ctx.font = "600 10px system-ui, -apple-system, sans-serif"
  ctx.textAlign = "center"
  ctx.textBaseline = "middle"

  etiquetas.forEach(({ text, x, y }) => {
    const ancho = ctx.measureText(text).width + 10

    ctx.fillStyle = "rgba(255,255,255,0.92)"
    ctx.strokeStyle = "rgba(15,23,42,0.25)"
    ctx.lineWidth = 1
    ctx.beginPath()
    ctx.roundRect(x - ancho / 2, y - 9, ancho, 18, 4)
    ctx.fill()
    ctx.stroke()

    ctx.fillStyle = "#0f172a"
    ctx.fillText(text, x, y)
  })
  ctx.restore()
}

export const ImageExport = ({ map, crs, layerNames, sources, onClose }) => {
  const [pieces, setPieces] = useState(DEFAULTS)
  const [scale, setScale] = useState(2)
  const [working, setWorking] = useState(false)
  const [error, setError] = useState(null)

  useEffect(() => {
    const escape = (event) => {
      if (event.key === "Escape") onClose()
    }
    document.addEventListener("keydown", escape)
    return () => document.removeEventListener("keydown", escape)
  }, [onClose])

  const alternar = (id) => setPieces((actual) => ({ ...actual, [id]: !actual[id] }))

  const lienzo = map?.getCanvas()
  const ancho = Math.round((lienzo?.clientWidth ?? 0) * scale)
  const alto = Math.round((lienzo?.clientHeight ?? 0) * scale)

  const exportar = async () => {
    if (!map) return
    setWorking(true)
    setError(null)

    // Qué capas hay que apagar mientras se hace la foto, para volver a
    // encenderlas después pase lo que pase.
    const apagadas = []

    try {
      const esFondo = (id) => id.startsWith("bm-") || id === "hillshade"
      const esDibujo = (id) => id.startsWith("gl-draw-")
      const esCapa = (id) => id.startsWith("anm-") || id.startsWith("search-")

      map.getStyle().layers.forEach(({ id }) => {
        const sobra =
          (!pieces.basemap && esFondo(id)) ||
          (!pieces.drawings && esDibujo(id)) ||
          (!pieces.layers && esCapa(id))
        if (!sobra) return
        if (map.getLayoutProperty(id, "visibility") === "none") return
        map.setLayoutProperty(id, "visibility", "none")
        apagadas.push(id)
      })

      // Esperar a que el mapa termine de repintarse: sin esto, la foto sale del
      // fotograma anterior y todavía lleva lo que se acaba de apagar.
      await new Promise((resolve) => {
        map.once("idle", resolve)
        map.triggerRepaint()
      })

      // Las etiquetas se leen del documento antes de componer, con su posición
      // en pantalla: en la imagen van en el mismo sitio.
      const cajaMapa = lienzo.getBoundingClientRect()
      const etiquetas = pieces.labels
        ? [...document.querySelectorAll(".map-label")].map((nodo) => {
            const caja = nodo.getBoundingClientRect()
            return {
              text: nodo.textContent.trim(),
              x: caja.left + caja.width / 2 - cajaMapa.left,
              y: caja.top + caja.height / 2 - cajaMapa.top,
            }
          })
        : []

      const pie = pieces.footer
        ? buildFooter({
            crsLabel: crs.label,
            crsId: crs.id,
            layers: layerNames,
            sources,
          })
        : []
      const altoPie = pie.length > 0 ? pie.length * FOOTER_LINE_HEIGHT + FOOTER_PADDING * 2 : 0

      const salida = document.createElement("canvas")
      salida.width = ancho
      salida.height = alto + Math.round(altoPie * scale)
      const ctx = salida.getContext("2d")

      ctx.fillStyle = "#ffffff"
      ctx.fillRect(0, 0, salida.width, salida.height)
      ctx.drawImage(lienzo, 0, 0, ancho, alto)

      if (etiquetas.length > 0) drawLabels(ctx, etiquetas, scale)

      if (pieces.scale) {
        const centro = map.getCenter()
        const barra = scaleBarFor(
          metersPerPixel(centro.lat, map.getZoom()),
          Math.min(160, lienzo.clientWidth / 3),
        )
        drawScaleBar(ctx, barra, alto, scale)
      }

      if (pieces.north) drawNorthArrow(ctx, map.getBearing(), ancho, scale)
      if (pie.length > 0) drawFooter(ctx, pie, ancho, alto, scale)

      const blob = await new Promise((resolve) => salida.toBlob(resolve, "image/png"))
      const url = URL.createObjectURL(blob)
      const enlace = document.createElement("a")
      enlace.href = url
      enlace.download = exportFileName()
      enlace.click()
      URL.revokeObjectURL(url)

      onClose()
    } catch (err) {
      console.error("No se pudo exportar la imagen:", err)
      setError("No se pudo generar la imagen. Inténtalo otra vez.")
    } finally {
      // Devolver el mapa como estaba, aunque algo haya fallado a mitad.
      apagadas.forEach((id) => {
        if (map.getLayer(id)) map.setLayoutProperty(id, "visibility", "visible")
      })
      setWorking(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-slate-900/30 p-0 backdrop-blur-[2px] sm:items-center sm:p-4">
      <div className="flex max-h-[85vh] w-full max-w-md flex-col overflow-hidden rounded-t-xl border border-slate-200 bg-white shadow-2xl sm:rounded-xl">
        <div className="flex items-center gap-2.5 border-b border-slate-200 px-4 py-3">
          <ImageIcon className="h-4 w-4 text-slate-400" />
          <h2 className="text-[15px] font-semibold text-slate-900">Exportar imagen</h2>
          <span className="flex-1" />
          <button
            type="button"
            onClick={onClose}
            aria-label="Cerrar"
            className="rounded-md p-1.5 text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-700"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="flex-1 space-y-4 overflow-y-auto p-4">
          <div>
            <p className="mb-2 text-[10px] font-medium uppercase tracking-wide text-slate-500">
              Qué incluir
            </p>
            <div className="space-y-1">
              {PIECES.map(({ id, label, hint }) => (
                <label
                  key={id}
                  className="flex min-h-[44px] cursor-pointer items-center gap-3 rounded-lg px-2 transition-colors hover:bg-slate-50 md:min-h-0 md:py-1.5"
                >
                  <input
                    type="checkbox"
                    checked={pieces[id]}
                    onChange={() => alternar(id)}
                    className="h-4 w-4 shrink-0 accent-slate-900"
                  />
                  <span className="min-w-0 flex-1">
                    <span className="block text-[13px] leading-tight text-slate-900">{label}</span>
                    <span className="block text-[11px] leading-tight text-slate-500">{hint}</span>
                  </span>
                </label>
              ))}
            </div>
          </div>

          <div>
            <p className="mb-2 text-[10px] font-medium uppercase tracking-wide text-slate-500">
              Tamaño
            </p>
            <div className="flex rounded-lg bg-slate-100 p-0.5">
              {EXPORT_SCALES.map((opcion) => (
                <button
                  key={opcion.id}
                  type="button"
                  onClick={() => setScale(opcion.id)}
                  aria-pressed={scale === opcion.id}
                  title={opcion.hint}
                  className={`flex-1 rounded-md px-2 py-1.5 text-[12px] font-medium transition-colors ${
                    scale === opcion.id
                      ? "bg-white text-slate-900 shadow-sm"
                      : "text-slate-500 hover:text-slate-700"
                  }`}
                >
                  {opcion.label}
                </button>
              ))}
            </div>
            <p className="mt-1.5 text-[11px] tabular-nums text-slate-500">
              {ancho} × {alto} píxeles
            </p>
          </div>

          {error && <p className="text-[12px] text-red-600">{error}</p>}
        </div>

        <div className="border-t border-slate-200 p-3">
          <button
            type="button"
            onClick={exportar}
            disabled={working}
            className="flex h-11 w-full items-center justify-center gap-2 rounded-md bg-slate-900 text-[13px] font-medium text-white transition-colors hover:bg-slate-700 disabled:opacity-60"
          >
            {working ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
            {working ? "Generando…" : "Descargar PNG"}
          </button>
        </div>
      </div>
    </div>
  )
}
