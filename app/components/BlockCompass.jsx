"use client"

import React, { memo } from "react"
import { Eye, RotateCcw } from "lucide-react"

/**
 * Brújula 3D de Alta Precisión e Instrumentación Aeroespacial / GIS
 *
 * Construcción espacial 3D multicapa:
 * - Escenario con perspectiva 3D (perspective: 750px) y preservación tridimensional (preserve-3d).
 * - Gimbal aeroespacial que inclina el instrumento en 3D (rotateX) sincronizado con el cabeceo (pitch) de la cámara.
 * - Cilindro con profundidad física Z (-14px a +28px):
 *   * Base y sombra profunda: translateZ(-14px)
 *   * Pared cilíndrica de titanio: translateZ(-8px)
 *   * Bisel exterior moleteado: translateZ(0px)
 *   * Plato del dial con ranuras radiales: translateZ(4px)
 *   * Sombra dinámica arrojada por la aguja: translateZ(6px) con paralaje real
 *   * Aguja 3D facetada flotante: suspendida físicamente en translateZ(18px)
 *   * Pivote central y microgema rubí: translateZ(24px)
 *   * Cúpula de cristal de zafiro con brillo curvo: translateZ(28px)
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
    <div className="absolute top-14 right-4 z-20 flex flex-col items-center select-none">
      {/* Escenario con perspectiva 3D */}
      <div
        className="relative group"
        style={{ perspective: "750px", perspectiveOrigin: "50% 50%" }}
      >
        {/* Resplandor ambiental de fondo */}
        <div className="absolute -inset-2 rounded-full bg-gradient-to-tr from-rose-500/20 via-sky-500/15 to-rose-500/20 opacity-0 group-hover:opacity-100 blur-xl transition-opacity duration-300 pointer-events-none" />

        {/* Botón táctil principal que contiene el Gimbal 3D */}
        <button
          type="button"
          onClick={() => onResetNorth?.(false)}
          onDoubleClick={() => onToggleCenital?.()}
          title="Brújula 3D · Clic para orientar al Norte (0°) · Doble clic para vista cenital"
          aria-label="Reorientar bloque 3D al Norte"
          className="relative w-[76px] h-[76px] sm:w-[84px] sm:h-[84px] flex items-center justify-center p-0 rounded-full focus:outline-none focus-visible:ring-2 focus-visible:ring-rose-500/70 active:scale-95 transition-transform duration-150 cursor-pointer bg-transparent"
        >
          {/* Caret Superior Fijo de Proa (Marcador de mira a las 12h) */}
          <div className="absolute -top-1.5 left-1/2 -translate-x-1/2 z-30 pointer-events-none">
            <div className="w-0 h-0 border-l-[4.5px] border-l-transparent border-r-[4.5px] border-r-transparent border-t-[7px] border-t-rose-500 drop-shadow-[0_0_5px_rgba(244,63,94,0.9)]" />
          </div>

          {/* GIMBAL 3D ESPACIAL: Se inclina en 3D (rotateX) con la inclinación del terreno */}
          <div
            ref={gimbalRef}
            className="relative w-full h-full rounded-full flex items-center justify-center will-change-transform"
            style={{
              transformStyle: "preserve-3d",
              transform: "rotateX(42deg)",
              transition: "transform 0.08s ease-out",
            }}
          >
            {/* CAPA 1: Placa de Base y Sombra Profunda 3D (Z = -14px) */}
            <div
              className="absolute inset-0 rounded-full bg-black/80 shadow-[0_20px_35px_rgba(0,0,0,0.85)] border border-zinc-900 pointer-events-none"
              style={{ transform: "translateZ(-14px)" }}
            />

            {/* CAPA 2: Pared Cilíndrica Inferior (Z = -8px) con degradado metálico */}
            <div
              className="absolute inset-[1px] rounded-full bg-gradient-to-b from-zinc-800 via-zinc-900 to-black border border-zinc-700/50 shadow-inner pointer-events-none"
              style={{ transform: "translateZ(-8px)" }}
            />

            {/* CAPA 3: Bisel Exterior con Moleteado (Z = 0px) */}
            <div
              className="absolute inset-[2px] rounded-full bg-zinc-950/90 backdrop-blur-xl border border-zinc-700/70 shadow-[inset_0_1px_2px_rgba(255,255,255,0.2)] pointer-events-none"
              style={{ transform: "translateZ(0px)" }}
            />

            {/* CAPA 4: Plato del Dial y Marcaciones Horarias (Z = 4px) */}
            <div
              className="absolute inset-[3px] rounded-full overflow-hidden pointer-events-none"
              style={{ transform: "translateZ(4px)" }}
            >
              <svg viewBox="0 0 100 100" className="w-full h-full">
                <defs>
                  <radialGradient id="dialInnerFace" cx="50%" cy="50%" r="50%">
                    <stop offset="0%" stopColor="#1c1917" stopOpacity="0.6" />
                    <stop offset="65%" stopColor="#09090b" stopOpacity="0.9" />
                    <stop offset="100%" stopColor="#000000" stopOpacity="1" />
                  </radialGradient>
                </defs>
                <circle cx="50" cy="50" r="46" fill="url(#dialInnerFace)" stroke="#3f3f46" strokeWidth="0.5" />
                <circle cx="50" cy="50" r="37" fill="none" stroke="rgba(255,255,255,0.08)" strokeWidth="0.5" strokeDasharray="1 2" />

                {/* Marcas perimetrales graduadas cada 15° y 45° */}
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

                {/* Puntos Cardinales */}
                <text x="50" y="20" fill="#f43f5e" fontSize="9" fontWeight="800" textAnchor="middle" dominantBaseline="central">
                  N
                </text>
                <text x="80" y="50" fill="#a1a1aa" fontSize="7.5" fontWeight="700" textAnchor="middle" dominantBaseline="central">
                  E
                </text>
                <text x="50" y="80" fill="#a1a1aa" fontSize="7.5" fontWeight="700" textAnchor="middle" dominantBaseline="central">
                  S
                </text>
                <text x="20" y="50" fill="#a1a1aa" fontSize="7.5" fontWeight="700" textAnchor="middle" dominantBaseline="central">
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
                opacity: 0.65,
              }}
            >
              <svg viewBox="0 0 100 100" className="w-full h-full">
                <polygon points="50,22 46,50 50,47" fill="#000000" />
                <polygon points="50,22 54,50 50,47" fill="#000000" />
                <polygon points="50,78 46,50 50,53" fill="#000000" />
                <polygon points="50,78 54,50 50,53" fill="#000000" />
                <circle cx="50" cy="50" r="4.5" fill="#000000" />
              </svg>
            </div>

            {/* CAPA 6: AGUJA 3D FACETADA FLOTANTE (Elevada en Z = 18px) */}
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
                    <stop offset="0%" stopColor="#f43f5e" />
                    <stop offset="100%" stopColor="#fb7185" />
                  </linearGradient>
                  <linearGradient id="gFacetNRight" x1="0%" y1="0%" x2="100%" y2="0%">
                    <stop offset="0%" stopColor="#9f1239" />
                    <stop offset="100%" stopColor="#be123c" />
                  </linearGradient>

                  {/* Facetas de la aguja Sur */}
                  <linearGradient id="gFacetSLeft" x1="0%" y1="0%" x2="100%" y2="0%">
                    <stop offset="0%" stopColor="#f1f5f9" />
                    <stop offset="100%" stopColor="#cbd5e1" />
                  </linearGradient>
                  <linearGradient id="gFacetSRight" x1="0%" y1="0%" x2="100%" y2="0%">
                    <stop offset="0%" stopColor="#475569" />
                    <stop offset="100%" stopColor="#64748b" />
                  </linearGradient>
                </defs>

                {/* Faceta Norte Izquierda (Luz) */}
                <polygon points="50,22 46,50 50,47" fill="url(#gFacetNLeft)" />
                {/* Faceta Norte Derecha (Sombra) */}
                <polygon points="50,22 54,50 50,47" fill="url(#gFacetNRight)" />

                {/* Faceta Sur Izquierda (Luz) */}
                <polygon points="50,78 46,50 50,53" fill="url(#gFacetSLeft)" />
                {/* Faceta Sur Derecha (Sombra) */}
                <polygon points="50,78 54,50 50,53" fill="url(#gFacetSRight)" />

                {/* Brazos Este/Oeste micro-facetados */}
                <polygon points="27,50 50,48 48,50" fill="rgba(255,255,255,0.4)" />
                <polygon points="73,50 50,52 52,50" fill="rgba(255,255,255,0.3)" />

                {/* Arista dorsal iluminada de la aguja norte */}
                <line x1="50" y1="23" x2="50" y2="47" stroke="#ffffff" strokeWidth="0.5" opacity="0.8" />
              </svg>
            </div>

            {/* CAPA 7: Pivote Central Elevado con Gema Rubí (Z = 24px) */}
            <div
              className="absolute w-3.5 h-3.5 rounded-full flex items-center justify-center pointer-events-none"
              style={{
                transform: "translateZ(24px)",
                background: "radial-gradient(circle, #3f3f46 0%, #18181b 100%)",
                boxShadow: "0 2px 5px rgba(0,0,0,0.6)",
                border: "0.75px solid #71717a",
              }}
            >
              <div className="w-1.5 h-1.5 rounded-full bg-rose-500 shadow-[0_0_6px_rgba(244,63,94,1)]" />
            </div>

            {/* CAPA 8: Cúpula de Cristal de Zafiro Curvo con Brillo Especular (Z = 28px) */}
            <div
              className="absolute inset-[2px] rounded-full pointer-events-none border border-white/25"
              style={{
                transform: "translateZ(28px)",
                background:
                  "linear-gradient(135deg, rgba(255,255,255,0.3) 0%, rgba(255,255,255,0.06) 40%, transparent 60%)",
                boxShadow: "inset 0 1px 2px rgba(255,255,255,0.4)",
              }}
            />

            {/* CAPA 9: Aro exterior de pulso de alineación exacta al Norte */}
            <div
              ref={alignedBadgeRef}
              className="absolute inset-0 rounded-full border-2 border-rose-500 pointer-events-none opacity-0 transition-opacity duration-200 shadow-[0_0_16px_rgba(244,63,94,0.7)]"
              style={{ transform: "translateZ(12px)" }}
            />
          </div>
        </button>
      </div>

      {/* Píldora HUD de Telemetría (Rumbo + Inclinación) */}
      <div className="mt-2 flex items-center gap-1.5 bg-zinc-950/90 backdrop-blur-md px-2 py-0.5 rounded-full border border-zinc-800/90 shadow-lg text-[10px] font-mono tracking-tight text-zinc-300">
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