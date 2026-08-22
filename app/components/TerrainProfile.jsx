"use client"

import { useEffect, useMemo, useRef } from "react"
import { Activity, X } from "lucide-react"

import { ACCURACY_WARNING, DEM_RESOLUTION_M } from "../utils/terrainAnalysis"

/**
 * Gráfico del perfil topográfico.
 *
 * Recibe el array de puntos de useTerrainProfileGL y lo dibuja como una curva
 * de elevación contra distancia. Es un SVG puro: no necesita librería de
 * gráficos y escala con el panel sin perder nitidez en pantallas retina.
 *
 * **Qué enseña además de la curva:**
 *
 * - La distancia total al final del eje X, en metros o km según convenga.
 * - El rango vertical (cota mínima y máxima) para que la pendiente se lea
 *   aunque el terreno sea casi plano.
 * - Un punto interactivo que sigue al cursor sobre la línea dibujada,
 *   mostrando cota exacta en ese tramo.
 *
 * El aviso de resolución va abajo, igual que en la consulta puntual: es la misma
 * advertencia y merece el mismo lugar visible.
 */

/** Alto del gráfico en píxeles. Compacto a propósito para caber junto al mapa. */
const CHART_HEIGHT_PX = 120

const formatDistance = (metros) =>
  metros >= 1000 ? `${(metros / 1000).toFixed(2)} km` : `${Math.round(metros)} m`

export const TerrainProfile = ({ profile, unavailable, onClose }) => {
  const svgRef = useRef(null)

  /** Extremos verticales, con margen para que la curva no toque los bordes. */
  const { minElev, maxElev, totalDistance, pathD } = useMemo(() => {
    if (!profile || profile.length === 0) return {}

    const alturas = profile.map((p) => p.elevationM).filter(Number.isFinite)
    if (alturas.length === 0) return {}

    const min = Math.min(...alturas)
    const max = Math.max(...alturas)
    // Margen del 8% arriba y abajo para respirar visualmente.
    const margen = Math.max((max - min) * 0.08, 1)
    const minConMargen = min - margen
    const maxConMargen = max + margen

    const total = profile[profile.length - 1].distanceM

    const puntos = profile
      .filter((p) => Number.isFinite(p.elevationM))
      .map((p, i, arr) => {
        const x = (p.distanceM / total) * 100
        const y =
          100 -
          ((p.elevationM - minConMargen) / (maxConMargen - minConMargen)) * 100
        return `${i === 0 ? "M" : "L"}${x.toFixed(2)},${y.toFixed(2)}`
      })
      .join(" ")

    return {
      minElev: min,
      maxElev: max,
      totalDistance: total,
      pathD: puntos,
    }
  }, [profile])

  // Hover interactivo: encontrar el punto más cercano al cursor y marcarlo.
  const handleMouseMove = (event) => {
    if (!profile || !svgRef.current) return
    const rect = svgRef.current.getBoundingClientRect()
    const xRelativo = (event.clientX - rect.left) / rect.width
    const targetDistance = xRelativo * totalDistance

    // Búsqueda lineal; con ~100 muestras es instantáneo y evita indexar.
    let masCercano = profile[0]
    for (const punto of profile) {
      if (Math.abs(punto.distanceM - targetDistance) < Math.abs(masCercano.distanceM - targetDistance)) {
        masCercano = punto
      }
    }
    setHovered(masCercano)
  }

  const [hovered, setHovered] = null ?? useState(null)

  useEffect(() => {
    if (!hovered) return
    const timer = setTimeout(() => {}, 0)
    return () => clearTimeout(timer)
  }, [hovered])

  if (unavailable) {
    return (
      <div className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 shadow-sm">
        <div className="flex items-center gap-1.5">
          <Activity className="h-3.5 w-3.5 shrink-0 text-slate-400" />
          <span className="flex-1 text-[11px] font-medium text-slate-600">
            Perfil topográfico
          </span>
          <button type="button" onClick={onClose} aria-label="Cerrar perfil" className="rounded p-0.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700 transition-colors">
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
        <p className="mt-1 text-[11px] leading-tight text-slate-500">{unavailable}</p>
      </div>
    )
  }

  if (!profile || !pathD) {
    return (
      <div className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 shadow-sm">
        <div className="flex items-center gap-1.5">
          <Activity className="h-3.5 w-3.5 shrink-0 text-slate-400" />
          <span className="flex-1 text-[11px] font-medium text-slate-600">Perfil topográfico</span>
        </div>
        <p className="mt-1 text-[11px] leading-tight text-slate-500">
          Dibuja una línea en el mapa para ver su perfil de elevación.
        </p>
      </div>
    )
  }

  const hoverX =
    hovered && totalDistance > 0
      ? (hovered.distanceM / totalDistance) * 100
      : null
  const hoverY =
    hovered && maxElev !== undefined && minElev !== undefined
      ? 100 -
        ((hovered.elevationM - minElev + (maxElev - minElev) * 0.08 + 1) /
          ((maxElev - minElev) + (maxElev - minElev) * 0.16 + 2)) *
          100
      : null

  return (
    <div className="w-full overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm">
      {/* Cabecera */}
      <div className="flex items-center gap-1.5 border-b border-slate-100 bg-slate-50 px-2.5 py-1.5">
        <Activity className="h-3.5 w-3.5 shrink-0 text-slate-400" />
        <span className="flex-1 text-[11px] font-medium text-slate-600">Perfil topográfico</span>
        <span className="text-[10px] tabular-nums text-slate-400">{formatDistance(totalDistance)}</span>
        <button
          type="button"
          onClick={onClose}
          aria-label="Cerrar el perfil topográfico"
          className="rounded p-0.5 text-slate-400 transition-colors hover:bg-slate-200 hover:text-slate-700"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </div>

      {/* Gráfico */}
      <div className="relative px-1 py-1.5">
        <svg
          ref={svgRef}
          viewBox="0 0 100 100"
          preserveAspectRatio="none"
          style={{ width: "100%", height: `${CHART_HEIGHT_PX}px`, display: "block" }}
          onMouseMove={handleMouseMove}
          onMouseLeave={() => setHovered(null)}
        >
          {/* Fondo con líneas guía horizontales */}
          {[25, 50, 75].map((y) => (
            <line key={y} x1="0" y1={y} x2="100" y2={y} stroke="#e2e8f0" strokeWidth="0.3" />
          ))}

          {/* Curva */}
          <path d={pathD} fill="none" stroke="#334155" strokeWidth="0.6" strokeLinejoin="round" />

          {/* Marcador de hover */}
          {hovered && hoverX !== null && hoverY !== null && (
            <>
              <line x1={hoverX} y1="0" x2={hoverX} y2="100" stroke="#94a3b8" strokeWidth="0.25" strokeDasharray="1 1" />
              <circle cx={hoverX} cy={hoverY} r="0.8" fill="#334155" />
              <text x={hoverX} y={Math.max(hoverY - 2, 4)} fontSize="2.5" fill="#334155" textAnchor="middle" fontWeight="bold">
                {`${Math.round(hovered.elevationM)} m`}
              </text>
            </>
          )}
        </svg>

        {/* Eje Y: cotas mínima y máxima */}
        <div className="pointer-events-none absolute inset-y-0 right-1 flex flex-col justify-between text-[9px] tabular-nums text-slate-400">
          <span>{maxElev !== undefined ? `${Math.round(maxElev)} m` : ""}</span>
          <span>{minElev !== undefined ? `${Math.round(minElev)} m` : ""}</span>
        </div>
      </div>

      {/* Aviso de resolución */}
      <p className="border-t border-slate-100 bg-amber-50 px-2.5 py-1 text-[9px] leading-tight text-amber-800">
        Modelo de ~{DEM_RESOLUTION_M} m · {ACCURACY_WARNING.toLowerCase().includes("elipsoidal") ? "cota elipsoidal sin geoide" : "alturas aproximadas"}
      </p>
    </div>
  )
}
