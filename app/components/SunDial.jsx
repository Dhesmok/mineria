"use client"

import React, { useCallback, useEffect, useRef } from "react"

/**
 * Carta solar: un solo mando para los dos ángulos con los que se sombrea un relieve.
 *
 * Es el mismo dibujo que una carta de trayectoria solar de las de toda la vida, leído
 * desde arriba: el borde del círculo es el horizonte y el centro es el cenit. Así que
 * la posición del sol dentro del disco dice las dos cosas a la vez —hacia dónde está
 * (el ángulo) y cuánto ha subido (la distancia al centro)—, que es exactamente lo que
 * hace falta para un sombreado y lo que un mapa de sombras declara en su leyenda.
 *
 * Por qué un disco y no dos barras:
 *
 * - El azimut da la vuelta entera. En una barra recta, 355° y 5° —casi la misma
 *   posición del sol— caen en los dos extremos opuestos del control, y para ir de uno
 *   a otro hay que recorrerla de punta a punta.
 * - Los dos ángulos se miran juntos. Separados en dos barras hay que componer la
 *   posición del sol de cabeza; aquí se ve puesta, con el rayo de sombra saliendo por
 *   el lado contrario y alargándose a medida que el sol baja, que es para lo que se
 *   toca este mando.
 *
 * Lo que se ve es el disco, pero debajo hay dos `input[type=range]` ocultos a la vista
 * y no al teclado ni al lector de pantalla: un `div` no se recorre con las flechas. El
 * aro se ilumina cuando uno de los dos tiene el foco.
 *
 * Trampa nº 17: el «soltar» se escucha en la ventana, no en el disco. El aro mide 66 px
 * y el dedo se sale de él en cuanto se empieza a girar; un `pointerup` colgado del
 * propio disco no llegaría nunca y el mando se quedaría pegado al puntero.
 */

const DIAM = 66

// Altura útil. Por debajo de 10° las sombras se alargan más allá de la caja de sombra
// del motor y aparecen cortadas; por encima de 85° el sol está en la vertical y el
// azimut deja de significar nada, así que no hay nada que ganar en los dos extremos.
export const ALT_MIN = 10
export const ALT_MAX = 85

// Radio que ocupa el cielo dentro del recuadro de 100 del SVG, y su equivalente sobre
// el elemento real: el sol llega hasta aquí, y de aquí al borde queda el bisel.
const R_CIELO = 42
const FRACCION_UTIL = R_CIELO / 50

const acotar = (v, min, max) => Math.min(max, Math.max(min, v))

/** Pasa un par (azimut, altura) al punto del disco donde se dibuja. */
export function puntoEnCarta(azimut, altura, radio = R_CIELO) {
  const rad = ((azimut % 360) * Math.PI) / 180
  const r = radio * (1 - acotar(altura, 0, 90) / 90)
  return { x: 50 + r * Math.sin(rad), y: 50 - r * Math.cos(rad), r }
}

export default function SunDial({
  azimuth = 0,
  altitude = 45,
  onChange,
  step = 5,
  azimuthLabel,
  altitudeLabel,
  title,
}) {
  const discoRef = useRef(null)
  const arrastrandoRef = useRef(false)

  // Los valores en curso, para que el manejador de la ventana no se recree en cada
  // grado movido —y para poder conservar el azimut si el puntero cae justo en el centro,
  // donde no hay dirección que leer—.
  const valorRef = useRef({ azimuth, altitude })
  valorRef.current = { azimuth, altitude }

  const desdeEvento = useCallback(
    (ev) => {
      const el = discoRef.current
      if (!el) return null
      const caja = el.getBoundingClientRect()
      if (!caja.width || !caja.height) return null

      const dx = ev.clientX - (caja.left + caja.width / 2)
      const dy = ev.clientY - (caja.top + caja.height / 2)

      // 0° arriba y creciendo hacia la derecha, igual que la brújula de al lado: las
      // dos se leen a la vez y no pueden contar los grados de dos maneras distintas.
      let azimut = valorRef.current.azimuth
      if (dx !== 0 || dy !== 0) {
        azimut = (Math.atan2(dx, -dy) * 180) / Math.PI
        if (azimut < 0) azimut += 360
        azimut = (Math.round(azimut / step) * step) % 360
      }

      const radioUtil = (Math.min(caja.width, caja.height) / 2) * FRACCION_UTIL
      const proporcion = acotar(Math.hypot(dx, dy) / radioUtil, 0, 1)
      const altura = acotar(
        Math.round(((1 - proporcion) * 90) / step) * step,
        ALT_MIN,
        ALT_MAX,
      )

      return { azimut, altura }
    },
    [step],
  )

  const aplicar = useCallback(
    (ev) => {
      const v = desdeEvento(ev)
      if (v) onChange?.(v.azimut, v.altura)
    },
    [desdeEvento, onChange],
  )

  useEffect(() => {
    if (typeof window === "undefined") return undefined

    const mover = (ev) => {
      if (!arrastrandoRef.current) return
      ev.preventDefault()
      aplicar(ev)
    }
    const soltar = () => {
      arrastrandoRef.current = false
    }

    window.addEventListener("pointermove", mover, { passive: false })
    window.addEventListener("pointerup", soltar)
    window.addEventListener("pointercancel", soltar)
    return () => {
      window.removeEventListener("pointermove", mover)
      window.removeEventListener("pointerup", soltar)
      window.removeEventListener("pointercancel", soltar)
    }
  }, [aplicar])

  const sol = puntoEnCarta(azimuth, altitude)

  // La sombra sale por el lado contrario y se alarga a medida que el sol baja: con el
  // sol en la vertical casi no hay sombra, y rozando el horizonte se va hasta el borde.
  const radSombra = (((azimuth + 180) % 360) * Math.PI) / 180
  const largoSombra = R_CIELO * Math.cos((acotar(altitude, 0, 90) * Math.PI) / 180)
  const sx = 50 + largoSombra * Math.sin(radSombra)
  const sy = 50 - largoSombra * Math.cos(radSombra)

  return (
    <div className="relative shrink-0 rounded-full focus-within:ring-2 focus-within:ring-amber-400/70 focus-within:ring-offset-2 focus-within:ring-offset-zinc-950">
      <input
        type="range"
        min="0"
        max="360"
        step={step}
        value={azimuth}
        onChange={(e) => onChange?.(parseInt(e.target.value), valorRef.current.altitude)}
        title={title}
        aria-label={azimuthLabel}
        className="sr-only"
      />
      <input
        type="range"
        min={ALT_MIN}
        max={ALT_MAX}
        step={step}
        value={altitude}
        onChange={(e) => onChange?.(valorRef.current.azimuth, parseInt(e.target.value))}
        title={title}
        aria-label={altitudeLabel}
        className="sr-only"
      />

      <div
        ref={discoRef}
        onPointerDown={(ev) => {
          arrastrandoRef.current = true
          aplicar(ev)
        }}
        title={title}
        style={{ width: DIAM, height: DIAM, padding: 3 }}
        className="bm3d-bezel rounded-full cursor-pointer touch-none active:scale-95 transition-transform duration-100"
      >
        <svg viewBox="0 0 100 100" className="w-full h-full">
          <defs>
            <radialGradient id="bm3dSkyFace" cx="50%" cy="36%" r="64%">
              <stop offset="0%" stopColor="#1c1917" />
              <stop offset="68%" stopColor="#0a0a0c" />
              <stop offset="100%" stopColor="#000000" />
            </radialGradient>
            <filter id="bm3dSunGlow" x="-60%" y="-60%" width="220%" height="220%">
              <feDropShadow dx="0" dy="0" stdDeviation="3.2" floodColor="#fbbf24" floodOpacity="0.95" />
            </filter>
          </defs>

          <circle cx="50" cy="50" r="47" fill="url(#bm3dSkyFace)" stroke="#3f3f46" strokeWidth="1" />

          {/* Almucantarates: las circunferencias de altura constante de una carta solar.
              El borde es el horizonte (0°) y el centro el cenit (90°). */}
          <circle cx="50" cy="50" r={R_CIELO} fill="none" stroke="rgba(255,255,255,0.20)" strokeWidth="0.7" />
          {[30, 60].map((grados) => (
            <circle
              key={grados}
              cx="50"
              cy="50"
              r={R_CIELO * (1 - grados / 90)}
              fill="none"
              stroke="rgba(255,255,255,0.13)"
              strokeWidth="0.6"
              strokeDasharray="1.4 2.2"
            />
          ))}

          {/* Graduación del horizonte cada 30°, marcada en los cuatro cuadrantes */}
          {Array.from({ length: 12 }).map((_, i) => {
            const deg = i * 30
            const cuadrante = deg % 90 === 0
            return (
              <line
                key={deg}
                x1="50"
                y1={cuadrante ? 4 : 5.5}
                x2="50"
                y2="9.5"
                stroke={cuadrante ? "rgba(255,255,255,0.55)" : "rgba(255,255,255,0.22)"}
                strokeWidth={cuadrante ? 1.6 : 0.9}
                strokeLinecap="round"
                transform={`rotate(${deg} 50 50)`}
              />
            )
          })}

          {/* Rayo de sombra: por dónde se van a tumbar las sombras, y cuánto */}
          <line
            x1="50"
            y1="50"
            x2={sx}
            y2={sy}
            stroke="rgba(148,163,184,0.5)"
            strokeWidth="1.4"
            strokeLinecap="round"
          />
          <circle cx={sx} cy={sy} r="2.6" fill="rgba(226,232,240,0.45)" />

          {/* Radio del sol, del centro a su posición */}
          <line
            x1="50"
            y1="50"
            x2={sol.x}
            y2={sol.y}
            stroke="rgba(251,191,36,0.32)"
            strokeWidth="1.2"
          />

          <g filter="url(#bm3dSunGlow)">
            <circle cx={sol.x} cy={sol.y} r="7.2" fill="#fbbf24" stroke="#fffbeb" strokeWidth="1" />
          </g>

          <circle cx="50" cy="50" r="1.8" fill="#52525b" stroke="#18181b" strokeWidth="0.6" />
        </svg>
      </div>
    </div>
  )
}
