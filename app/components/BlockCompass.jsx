"use client"

import React, { memo } from "react"
import { Eye, RotateCcw } from "lucide-react"

/**
 * Brújula 3D de Alta Precisión e Instrumentación Aeroespacial / GIS
 *
 * Mejoras de visibilidad con inclinación 3D extrema:
 * - Baliza de Norte Perimétrica (Crown Beacon) en el borde exterior del dial con resplandor neón rubí.
 * - Insignia "N" de alto contraste integrada directamente en la punta de la aguja, siempre visible sin importar la inclinación.
 * - Aguja Norte elongada con arista dorsal iluminada (white-hot spine) y facetas de gran contraste lumínico.
 * - Puntero Sur en titanio satinado atenuado para eliminar cualquier ambigüedad direccional.
 * - Sombra dinámica de paralaje en translateZ(6px) y aguja flotante en translateZ(18px).
 * - Cúpula protectora de zafiro con brillo curvo especular.
 */
const BlockCompass = memo(function BlockCompass({
  onResetNorth,
  onToggleCenital,
  isCenital = false,
  gimbalRef,
  discRef,
  needleShadowRef,
  headingRef,
  pitchRef,
  alignedBadgeRef,
}) {
  return (
    <div className="absolute top-[5.25rem] right-3 z-20 flex flex-col items-center select-none">
      {/* Escenario con perspectiva 3D calibrada */}
      <div
        className="relative group"
        style={{ perspective: "800px", perspectiveOrigin: "50% 50%" }}
      >
        {/* Resplandor ambiental de fondo */}
        <div className="absolute -inset-2.5 rounded-full bg-gradient-to-tr from-rose-500/25 via-sky-500/20 to-rose-500/25 opacity-0 group-hover:opacity-100 blur-xl transition-opacity duration-300 pointer-events-none" />

        {/* Botón táctil principal que contiene el Gimbal 3D */}
        <button
          type="button"
          onClick={() => onResetNorth?.(false)}
          onDoubleClick={() => onToggleCenital?.()}
          title="Brújula 3D · Clic para orientar al Norte (0°) · Doble clic para vista cenital"
          aria-label="Reorientar bloque 3D al Norte"
          className="relative w-[78px] h-[78px] sm:w-[86px] sm:h-[86px] flex items-center justify-center p-0 rounded-full focus:outline-none focus-visible:ring-2 focus-visible:ring-rose-500/70 active:scale-95 transition-transform duration-150 cursor-pointer bg-transparent"
        >
          {/* Caret Superior Fijo de Proa (Marcador de mira a las 12h con halo luminoso) */}
          <div className="absolute -top-2 left-1/2 -translate-x-1/2 z-30 pointer-events-none flex flex-col items-center">
            <div className="w-0 h-0 border-l-[5px] border-l-transparent border-r-[5px] border-r-transparent border-t-[8px] border-t-rose-500 drop-shadow-[0_0_6px_rgba(244,63,94,1)]" />
            <div className="w-1 h-1 rounded-full bg-white -mt-0.5 shadow-[0_0_4px_#ffffff]" />
          </div>

          {/* GIMBAL 3D ESPACIAL: Se inclina en 3D (rotateX) con la inclinación del terreno */}
          <div
            ref={gimbalRef}
            className="relative w-full h-full rounded-full flex items-center justify-center will-change-transform"
            style={{
              transformStyle: "preserve-3d",
              transform: "rotateX(28deg)",
              transition: "transform 0.08s ease-out",
            }}
          >
            {/* CAPA 1: Placa de Base y Sombra Profunda 3D (Z = -14px) */}
            <div
              className="absolute inset-0 rounded-full bg-black/85 shadow-[0_22px_40px_rgba(0,0,0,0.9)] border border-zinc-900 pointer-events-none"
              style={{ transform: "translateZ(-14px)" }}
            />

            {/* CAPA 2: Pared Cilíndrica Inferior de Titanio (Z = -8px) */}
            <div
              className="absolute inset-[1px] rounded-full bg-gradient-to-b from-zinc-750 via-zinc-900 to-black border border-zinc-700/60 shadow-inner pointer-events-none"
              style={{ transform: "translateZ(-8px)" }}
            />

            {/* CAPA 3: Bisel Exterior con Moleteado (Z = 0px) */}
            <div
              className="absolute inset-[2px] rounded-full bg-zinc-950/95 backdrop-blur-xl border border-zinc-700/80 shadow-[inset_0_1px_2px_rgba(255,255,255,0.25)] pointer-events-none"
              style={{ transform: "translateZ(0px)" }}
            />

            {/* CAPA 4: Plato del Dial Rehundido (Z = 4px) */}
            <div
              className="absolute inset-[3px] rounded-full overflow-hidden pointer-events-none"
              style={{ transform: "translateZ(4px)" }}
            >
              <svg viewBox="0 0 100 100" className="w-full h-full">
                <defs>
                  <radialGradient id="dialInnerFace" cx="50%" cy="50%" r="50%">
                    <stop offset="0%" stopColor="#1c1917" stopOpacity="0.5" />
                    <stop offset="65%" stopColor="#09090b" stopOpacity="0.9" />
                    <stop offset="100%" stopColor="#000000" stopOpacity="1" />
                  </radialGradient>
                </defs>
                <circle cx="50" cy="50" r="46" fill="url(#dialInnerFace)" stroke="#3f3f46" strokeWidth="0.6" />
                <circle cx="50" cy="50" r="37.5" fill="none" stroke="rgba(255,255,255,0.1)" strokeWidth="0.5" strokeDasharray="1 2" />

                {/* Marcas perimetrales graduadas cada 15° y 45° */}
                {Array.from({ length: 24 }).map((_, idx) => {
                  const deg = idx * 15
                  const isCardinal = deg % 90 === 0
                  const isInter = deg % 45 === 0 && !isCardinal
                  const y1 = isCardinal ? 6 : isInter ? 8 : 10
                  const y2 = 12
                  const width = isCardinal ? 1.8 : isInter ? 1.1 : 0.6
                  const color = isCardinal
                    ? deg === 0
                      ? "#f43f5e"
                      : "#f4f4f5"
                    : isInter
                    ? "rgba(255,255,255,0.65)"
                    : "rgba(255,255,255,0.3)"

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

                {/* Puntos Cardinales de Fondo en el Dial */}
                <text x="50" y="21" fill="#f43f5e" fontSize="9" fontWeight="800" textAnchor="middle" dominantBaseline="central">
                  N
                </text>
                <text x="79" y="50" fill="#a1a1aa" fontSize="7.5" fontWeight="700" textAnchor="middle" dominantBaseline="central">
                  E
                </text>
                <text x="50" y="79" fill="#a1a1aa" fontSize="7.5" fontWeight="700" textAnchor="middle" dominantBaseline="central">
                  S
                </text>
                <text x="21" y="50" fill="#a1a1aa" fontSize="7.5" fontWeight="700" textAnchor="middle" dominantBaseline="central">
                  O
                </text>
              </svg>
            </div>

            {/* CAPA 5: Sombra Dinámica Proyectada de la Aguja Flotante (Z = 6px) */}
            <div
              ref={needleShadowRef}
              className="absolute inset-[3px] rounded-full pointer-events-none will-change-transform"
              style={{
                transform: "translateZ(6px) rotateZ(0deg)",
                filter: "blur(2.5px)",
                opacity: 0.7,
              }}
            >
              <svg viewBox="0 0 100 100" className="w-full h-full">
                {/* Sombra de la Baliza y Flecha Norte */}
                <polygon points="50,4 41,18 50,14 59,18" fill="#000000" />
                <polygon points="50,14 44,50 50,46" fill="#000000" />
                <polygon points="50,14 56,50 50,46" fill="#000000" />
                {/* Sombra de la Flecha Sur */}
                <polygon points="50,74 46,50 50,53" fill="#000000" />
                <polygon points="50,74 54,50 50,53" fill="#000000" />
                <circle cx="50" cy="50" r="5" fill="#000000" />
              </svg>
            </div>

            {/* CAPA 6: AGUJA 3D FACETADA FLOTANTE CON BALIZA DE ALTA VISIBILIDAD (Z = 18px) */}
            <div
              ref={discRef}
              className="absolute inset-[3px] rounded-full pointer-events-none will-change-transform"
              style={{
                transformStyle: "preserve-3d",
                transform: "translateZ(18px) rotateZ(0deg)",
              }}
            >
              <svg viewBox="0 0 100 100" className="w-full h-full overflow-visible">
                <defs>
                  {/* Facetas de la aguja Norte */}
                  <linearGradient id="gFacetNLeft" x1="0%" y1="0%" x2="100%" y2="0%">
                    <stop offset="0%" stopColor="#ff1744" />
                    <stop offset="100%" stopColor="#f43f5e" />
                  </linearGradient>
                  <linearGradient id="gFacetNRight" x1="0%" y1="0%" x2="100%" y2="0%">
                    <stop offset="0%" stopColor="#9f1239" />
                    <stop offset="100%" stopColor="#be123c" />
                  </linearGradient>

                  {/* Resplandor neón para la baliza perimétrica de Norte */}
                  <filter id="beaconGlow" x="-30%" y="-30%" width="160%" height="160%">
                    <feDropShadow dx="0" dy="0" stdDeviation="2.5" floodColor="#f43f5e" floodOpacity="0.95" />
                  </filter>

                  {/* Facetas de la aguja Sur */}
                  <linearGradient id="gFacetSLeft" x1="0%" y1="0%" x2="100%" y2="0%">
                    <stop offset="0%" stopColor="#e2e8f0" />
                    <stop offset="100%" stopColor="#cbd5e1" />
                  </linearGradient>
                  <linearGradient id="gFacetSRight" x1="0%" y1="0%" x2="100%" y2="0%">
                    <stop offset="0%" stopColor="#334155" />
                    <stop offset="100%" stopColor="#475569" />
                  </linearGradient>
                </defs>

                {/* 1. BALIZA PERIMÉTRICA DE NORTE (Crown Beacon en el borde exterior Z=18px) */}
                <g filter="url(#beaconGlow)">
                  <polygon points="50,3 41,18 50,13 59,18" fill="#f43f5e" stroke="#ffffff" strokeWidth="0.75" />
                  <circle cx="50" cy="11" r="2" fill="#ffffff" />
                </g>

                {/* 2. FLECHA NORTE FACETADA ELONGADA */}
                {/* Faceta Norte Izquierda (Luz reflectiva) */}
                <polygon points="50,13 44,50 50,46" fill="url(#gFacetNLeft)" />
                {/* Faceta Norte Derecha (Sombra modelada) */}
                <polygon points="50,13 56,50 50,46" fill="url(#gFacetNRight)" />

                {/* Arista dorsal iluminada de luz blanca de alta visibilidad */}
                <line x1="50" y1="5" x2="50" y2="46" stroke="#ffffff" strokeWidth="1.2" strokeLinecap="round" />

                {/* Insignia "N" en alto relieve integrada en la aguja */}
                <g transform="translate(50, 23)">
                  <rect x="-5" y="-5.5" width="10" height="11" rx="2.5" fill="#f43f5e" stroke="#ffffff" strokeWidth="0.8" />
                  <text
                    x="0"
                    y="0.5"
                    fill="#ffffff"
                    fontSize="7.5"
                    fontWeight="900"
                    textAnchor="middle"
                    dominantBaseline="central"
                    fontFamily="ui-sans-serif, system-ui, sans-serif"
                  >
                    N
                  </text>
                </g>

                {/* 3. FLECHA SUR ATENUADA (Titanio satinado más corta para contraste) */}
                <polygon points="50,74 46,50 50,53" fill="url(#gFacetSLeft)" />
                <polygon points="50,74 54,50 50,53" fill="url(#gFacetSRight)" />

                {/* Brazos Este/Oeste micro-facetados de referencia */}
                <polygon points="27,50 50,48 48,50" fill="rgba(255,255,255,0.4)" />
                <polygon points="73,50 50,52 52,50" fill="rgba(255,255,255,0.3)" />
              </svg>
            </div>

            {/* CAPA 7: Pivote Central Elevado con Gema Rubí (Z = 24px) */}
            <div
              className="absolute w-4 h-4 rounded-full flex items-center justify-center pointer-events-none"
              style={{
                transform: "translateZ(24px)",
                background: "radial-gradient(circle, #3f3f46 0%, #18181b 100%)",
                boxShadow: "0 2px 6px rgba(0,0,0,0.7)",
                border: "0.8px solid #71717a",
              }}
            >
              <div className="w-1.5 h-1.5 rounded-full bg-rose-500 shadow-[0_0_8px_rgba(244,63,94,1)] border border-white/50" />
            </div>

            {/* CAPA 8: Cúpula de Cristal de Zafiro Curvo con Brillo Especular (Z = 28px) */}
            <div
              className="absolute inset-[2px] rounded-full pointer-events-none border border-white/20"
              style={{
                transform: "translateZ(28px)",
                background:
                  "linear-gradient(135deg, rgba(255,255,255,0.28) 0%, rgba(255,255,255,0.05) 40%, transparent 60%)",
                boxShadow: "inset 0 1px 2px rgba(255,255,255,0.35)",
              }}
            />

            {/* CAPA 9: Aro exterior de pulso de alineación exacta al Norte */}
            <div
              ref={alignedBadgeRef}
              className="absolute inset-0 rounded-full border-2 border-rose-500 pointer-events-none opacity-0 transition-opacity duration-200 shadow-[0_0_16px_rgba(244,63,94,0.75)]"
              style={{ transform: "translateZ(12px)" }}
            />
          </div>
        </button>
      </div>

      {/* Píldora HUD de Telemetría (Rumbo con Flecha Activa + Inclinación) */}
      <div className="mt-2 flex items-center gap-1.5 bg-zinc-950/95 backdrop-blur-md px-2.5 py-0.5 rounded-full border border-zinc-800/90 shadow-xl text-[10px] font-mono tracking-tight text-zinc-300">
        <span
          ref={headingRef}
          className="font-bold text-rose-400 min-w-[62px] text-center flex items-center justify-center gap-1"
          title="Rumbo actual de la vista (Azimut)"
        >
          ↑ 000° N
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