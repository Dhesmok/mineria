"use client"

import React, { memo } from "react"
import { Eye, RotateCcw } from "lucide-react"

/**
 * Brújula 3D de Alta Precisión e Instrumentación Aeroespacial / GIS
 *
 * Características de diseño gráfico:
 * - Chasis circular con vidrio oscuro obsidian y desenfoque vítreo (backdrop-blur-xl).
 * - Bisel exterior graduado con ticks de precisión (cada 5° y 15°) y puntos cardinales N, E, S, O.
 * - Rosa de los vientos / aguja facetada 3D con reflejo especular e iluminación simulada.
 * - Marcador de índice fijo superior (caret de proa a las 12h).
 * - Píldora HUD de telemetría en tiempo real: rumbo numérico (000°-359°), cuadrante (N, NE, etc.) e inclinación (∠ pitch).
 * - Acciones interactivas: Clic para reorientar al Norte, botón para alternar vista Cenital (90°).
 */
const BlockCompass = memo(function BlockCompass({
  onResetNorth,
  onToggleCenital,
  isCenital = false,
  discRef,
  headingRef,
  pitchRef,
  alignedBadgeRef,
}) {
  return (
    <div className="absolute top-14 right-4 z-20 flex flex-col items-center select-none">
      {/* Contenedor del instrumento circular */}
      <div className="relative group">
        {/* Halo de resplandor ambiental interactivo */}
        <div className="absolute -inset-1 rounded-full bg-gradient-to-tr from-rose-500/20 via-sky-500/15 to-rose-500/20 opacity-0 group-hover:opacity-100 blur-md transition-opacity duration-300 pointer-events-none" />

        {/* Botón principal del dial de la brújula */}
        <button
          type="button"
          onClick={() => onResetNorth?.(false)}
          onDoubleClick={() => onToggleCenital?.()}
          title="Brújula 3D · Clic para orientar al Norte (0°) · Doble clic para vista cenital"
          aria-label="Reorientar bloque 3D al Norte"
          className="relative flex items-center justify-center w-[72px] h-[72px] sm:w-20 sm:h-20 rounded-full bg-zinc-950/85 backdrop-blur-xl border border-zinc-700/60 shadow-[0_8px_28px_-4px_rgba(0,0,0,0.7),inset_0_1px_1px_rgba(255,255,255,0.15)] hover:border-zinc-500/80 active:scale-95 transition-all duration-200 cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-rose-500/70"
        >
          {/* Marcador de Proa / Índice Superior Fijo (Caret a las 12h) */}
          <div className="absolute -top-1 left-1/2 -translate-x-1/2 z-20 pointer-events-none">
            <div className="w-0 h-0 border-l-[4px] border-l-transparent border-r-[4px] border-r-transparent border-t-[6px] border-t-rose-500 drop-shadow-[0_0_4px_rgba(244,63,94,0.8)]" />
          </div>

          {/* Disco Giratorio Vectorial SVG (Sincronizado a 60 fps con Three.js) */}
          <div
            ref={discRef}
            className="w-full h-full p-1 transition-transform ease-out will-change-transform"
            style={{ transform: "rotate(0deg)" }}
          >
            <svg
              viewBox="0 0 100 100"
              className="w-full h-full overflow-visible"
              aria-hidden="true"
            >
              <defs>
                {/* Degradado radial para fondo del dial */}
                <radialGradient id="compassDialBg" cx="50%" cy="50%" r="50%">
                  <stop offset="0%" stopColor="#18181b" stopOpacity="0.4" />
                  <stop offset="70%" stopColor="#09090b" stopOpacity="0.8" />
                  <stop offset="100%" stopColor="#000000" stopOpacity="0.95" />
                </radialGradient>

                {/* Brillo especular metálico para bisel */}
                <linearGradient id="metalBezel" x1="0%" y1="0%" x2="100%" y2="100%">
                  <stop offset="0%" stopColor="#52525b" />
                  <stop offset="50%" stopColor="#27272a" />
                  <stop offset="100%" stopColor="#71717a" />
                </linearGradient>

                {/* Facetas de la aguja Norte */}
                <linearGradient id="facetNorthLeft" x1="0%" y1="0%" x2="100%" y2="0%">
                  <stop offset="0%" stopColor="#f43f5e" />
                  <stop offset="100%" stopColor="#fb7185" />
                </linearGradient>
                <linearGradient id="facetNorthRight" x1="0%" y1="0%" x2="100%" y2="0%">
                  <stop offset="0%" stopColor="#9f1239" />
                  <stop offset="100%" stopColor="#be123c" />
                </linearGradient>

                {/* Facetas de la aguja Sur */}
                <linearGradient id="facetSouthLeft" x1="0%" y1="0%" x2="100%" y2="0%">
                  <stop offset="0%" stopColor="#e2e8f0" />
                  <stop offset="100%" stopColor="#f8fafc" />
                </linearGradient>
                <linearGradient id="facetSouthRight" x1="0%" y1="0%" x2="100%" y2="0%">
                  <stop offset="0%" stopColor="#475569" />
                  <stop offset="100%" stopColor="#64748b" />
                </linearGradient>

                {/* Filtro de sombra profunda para dar volumen 3D a la aguja */}
                <filter id="needleShadow" x="-20%" y="-20%" width="140%" height="140%">
                  <feDropShadow dx="0" dy="1.5" stdDeviation="1.8" floodColor="#000000" floodOpacity="0.65" />
                </filter>
              </defs>

              {/* Fondo del dial */}
              <circle cx="50" cy="50" r="46" fill="url(#compassDialBg)" stroke="url(#metalBezel)" strokeWidth="0.75" />

              {/* Anillo de precisión interior */}
              <circle cx="50" cy="50" r="37.5" fill="none" stroke="rgba(255,255,255,0.08)" strokeWidth="0.5" strokeDasharray="1 2" />

              {/* Marcas perimetrales graduadas cada 15° */}
              {Array.from({ length: 24 }).map((_, idx) => {
                const deg = idx * 15
                const isCardinal = deg % 90 === 0
                const isInter = deg % 45 === 0 && !isCardinal
                const y1 = isCardinal ? 6 : isInter ? 8 : 10
                const y2 = 12
                const width = isCardinal ? 1.6 : isInter ? 1.0 : 0.6
                const color = isCardinal
                  ? deg === 0
                    ? "#f43f5e"
                    : "#e4e4e7"
                  : isInter
                  ? "rgba(255,255,255,0.6)"
                  : "rgba(255,255,255,0.25)"

                return (
                  <line
                    key={deg}
                    x1="50"
                    y1={y1}
                    x2="50"
                    y2={y2}
                    stroke={color}
                    strokeWidth={width}
                    strokeLinecap="round"
                    transform={`rotate(${deg} 50 50)`}
                  />
                )
              })}

              {/* Letras Cardinales (N, E, S, O) con orientación vertical legible */}
              {/* NORTE */}
              <g transform="translate(50, 19)">
                <text
                  x="0"
                  y="0"
                  fill="#f43f5e"
                  fontSize="8.5"
                  fontWeight="800"
                  textAnchor="middle"
                  dominantBaseline="central"
                  fontFamily="system-ui, -apple-system, sans-serif"
                  style={{ filter: "drop-shadow(0 0 4px rgba(244,63,94,0.6))" }}
                >
                  N
                </text>
              </g>

              {/* ESTE */}
              <g transform="translate(81, 50)">
                <text
                  x="0"
                  y="0"
                  fill="#a1a1aa"
                  fontSize="7"
                  fontWeight="700"
                  textAnchor="middle"
                  dominantBaseline="central"
                  fontFamily="system-ui, -apple-system, sans-serif"
                >
                  E
                </text>
              </g>

              {/* SUR */}
              <g transform="translate(50, 81)">
                <text
                  x="0"
                  y="0"
                  fill="#a1a1aa"
                  fontSize="7"
                  fontWeight="700"
                  textAnchor="middle"
                  dominantBaseline="central"
                  fontFamily="system-ui, -apple-system, sans-serif"
                >
                  S
                </text>
              </g>

              {/* OESTE */}
              <g transform="translate(19, 50)">
                <text
                  x="0"
                  y="0"
                  fill="#a1a1aa"
                  fontSize="7"
                  fontWeight="700"
                  textAnchor="middle"
                  dominantBaseline="central"
                  fontFamily="system-ui, -apple-system, sans-serif"
                >
                  O
                </text>
              </g>

              {/* Aguja 3D Facetada Estilizada con sombras de volumen */}
              <g filter="url(#needleShadow)">
                {/* Punta Norte - Faceta Izquierda Iluminada */}
                <polygon points="50,22 46,50 50,47" fill="url(#facetNorthLeft)" />
                {/* Punta Norte - Faceta Derecha Sombra */}
                <polygon points="50,22 54,50 50,47" fill="url(#facetNorthRight)" />

                {/* Punta Sur - Faceta Izquierda Iluminada */}
                <polygon points="50,78 46,50 50,53" fill="url(#facetSouthLeft)" />
                {/* Punta Sur - Faceta Derecha Sombra */}
                <polygon points="50,78 54,50 50,53" fill="url(#facetSouthRight)" />

                {/* Cruz Cardinal Central Micro-facetada */}
                <polygon points="26,50 50,48 48,50" fill="rgba(255,255,255,0.4)" />
                <polygon points="74,50 50,52 52,50" fill="rgba(255,255,255,0.3)" />

                {/* Pivote Central */}
                <circle cx="50" cy="50" r="4.2" fill="#18181b" stroke="#3f3f46" strokeWidth="0.9" />
                <circle cx="50" cy="50" r="2.2" fill="#f43f5e" style={{ filter: "drop-shadow(0 0 2px rgba(244,63,94,0.9))" }} />
                <circle cx="50" cy="50" r="0.8" fill="#ffffff" />
              </g>
            </svg>
          </div>

          {/* Indicador de alineación exacta al Norte (anillo de pulso sutil) */}
          <div
            ref={alignedBadgeRef}
            className="absolute inset-0 rounded-full border border-rose-500/50 pointer-events-none opacity-0 transition-opacity duration-200 shadow-[0_0_12px_rgba(244,63,94,0.4)]"
          />
        </button>
      </div>

      {/* Píldora HUD de Telemetría (Rumbo + Inclinación) */}
      <div className="mt-1.5 flex items-center gap-1.5 bg-zinc-950/90 backdrop-blur-md px-2 py-0.5 rounded-full border border-zinc-800/90 shadow-lg text-[10px] font-mono tracking-tight text-zinc-300">
        <span
          ref={headingRef}
          className="font-bold text-rose-400 min-w-[50px] text-center"
          title="Rumbo actual de la vista (Azimut)"
        >
          000° N
        </span>
        <span className="text-zinc-600">|</span>
        <span
          ref={pitchRef}
          className="text-zinc-400 min-w-[34px] text-center"
          title="Ángulo de elevación / inclinación del terreno"
        >
          ∠ 45°
        </span>
      </div>

      {/* Botones de acción rápida: Reorientar Norte y Vista Cenital */}
      <div className="mt-1 flex items-center gap-1">
        <button
          type="button"
          onClick={() => onResetNorth?.(false)}
          className="p-1 rounded-md bg-zinc-900/80 hover:bg-zinc-800 text-zinc-400 hover:text-rose-400 border border-zinc-800/80 transition-colors shadow"
          title="Reorientar suavemente al Norte (0°)"
          aria-label="Reorientar al Norte"
        >
          <RotateCcw size={11} />
        </button>

        <button
          type="button"
          onClick={() => onToggleCenital?.()}
          className={`px-1.5 py-0.5 rounded-md text-[9px] font-medium border transition-colors shadow flex items-center gap-1 ${
            isCenital
              ? "bg-rose-950/60 text-rose-300 border-rose-800/60"
              : "bg-zinc-900/80 hover:bg-zinc-800 text-zinc-400 hover:text-sky-300 border-zinc-800/80"
          }`}
          title={isCenital ? "Cambiar a perspectiva inclinada 3D" : "Cambiar a vista cenital 2D (90° desde arriba)"}
          aria-label="Alternar vista cenital"
        >
          <Eye size={10} />
          <span>{isCenital ? "3D" : "Top"}</span>
        </button>
      </div>
    </div>
  )
})

export default BlockCompass