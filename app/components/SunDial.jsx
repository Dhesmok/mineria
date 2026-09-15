"use client"

import React, { useCallback, useEffect, useRef } from "react"

/**
 * Dial de azimut solar.
 *
 * El ángulo del sol da la vuelta entera: 355° y 5° son casi la misma posición del sol,
 * y una barra recta los manda a los dos extremos opuestos del control —para pasar de
 * uno a otro hay que recorrerla de punta a punta, atravesando todas las horas del día—.
 * Un dial los deja donde están, uno al lado del otro.
 *
 * Y de paso enseña lo que en realidad se está buscando cuando se toca este mando, que
 * no es un número: hacia dónde caen las sombras. El sol va marcado en su posición y
 * enfrente, al otro lado del eje, queda señalada la dirección de la sombra.
 *
 * El control visible es el dial, pero debajo hay un `input[type=range]` oculto a la
 * vista y no al teclado ni al lector de pantalla: un `div` no se recorre con las
 * flechas. El aro se ilumina cuando ese input tiene el foco (`focus-within`), así que
 * quien navegue con teclado ve dónde está.
 *
 * Trampa nº 17: el «soltar» se escucha en la ventana, no en el dial. El círculo mide
 * 54 px, así que el dedo se sale de él a la primera vuelta; un `pointerup` colgado del
 * propio dial no llegaría nunca y el mando se quedaría girando pegado al puntero.
 */

const DIAM = 54

export default function SunDial({ value = 0, onChange, step = 5, label, title }) {
  const dialRef = useRef(null)
  const arrastrandoRef = useRef(false)

  // 0° arriba y creciendo hacia la derecha, igual que la brújula de al lado: las dos
  // se leen a la vez y no pueden contar los grados de dos maneras distintas.
  const anguloDesdeEvento = useCallback(
    (ev) => {
      const el = dialRef.current
      if (!el) return null
      const caja = el.getBoundingClientRect()
      if (!caja.width || !caja.height) return null

      const dx = ev.clientX - (caja.left + caja.width / 2)
      const dy = ev.clientY - (caja.top + caja.height / 2)
      if (dx === 0 && dy === 0) return null

      let grados = (Math.atan2(dx, -dy) * 180) / Math.PI
      if (grados < 0) grados += 360
      return (Math.round(grados / step) * step) % 360
    },
    [step],
  )

  const aplicar = useCallback(
    (ev) => {
      const grados = anguloDesdeEvento(ev)
      if (grados !== null) onChange?.(grados)
    },
    [anguloDesdeEvento, onChange],
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

  const iniciar = (ev) => {
    arrastrandoRef.current = true
    aplicar(ev)
  }

  const rad = ((value % 360) * Math.PI) / 180
  const sx = 50 + 33 * Math.sin(rad)
  const sy = 50 - 33 * Math.cos(rad)
  const ox = 50 - 30 * Math.sin(rad)
  const oy = 50 + 30 * Math.cos(rad)

  return (
    <div className="relative shrink-0 rounded-full focus-within:ring-2 focus-within:ring-amber-400/70 focus-within:ring-offset-2 focus-within:ring-offset-zinc-950">
      <input
        type="range"
        min="0"
        max="360"
        step={step}
        value={value}
        onChange={(e) => onChange?.(parseInt(e.target.value))}
        title={title}
        aria-label={label}
        className="sr-only"
      />

      <div
        ref={dialRef}
        onPointerDown={iniciar}
        title={title}
        style={{ width: DIAM, height: DIAM, padding: 3 }}
        className="bm3d-bezel rounded-full cursor-pointer touch-none active:scale-95 transition-transform duration-100"
      >
        <svg viewBox="0 0 100 100" className="w-full h-full">
          <defs>
            <radialGradient id="bm3dSunFace" cx="50%" cy="36%" r="64%">
              <stop offset="0%" stopColor="#1c1917" />
              <stop offset="68%" stopColor="#0a0a0c" />
              <stop offset="100%" stopColor="#000000" />
            </radialGradient>
            <filter id="bm3dSunGlow" x="-60%" y="-60%" width="220%" height="220%">
              <feDropShadow dx="0" dy="0" stdDeviation="3.4" floodColor="#fbbf24" floodOpacity="0.95" />
            </filter>
          </defs>

          <circle cx="50" cy="50" r="47" fill="url(#bm3dSunFace)" stroke="#3f3f46" strokeWidth="1" />

          {/* Graduación cada 30°, marcada más fuerte en los cuatro cuadrantes */}
          {Array.from({ length: 12 }).map((_, i) => {
            const deg = i * 30
            const cuadrante = deg % 90 === 0
            return (
              <line
                key={deg}
                x1="50"
                y1={cuadrante ? 6 : 8}
                x2="50"
                y2="12"
                stroke={cuadrante ? "rgba(255,255,255,0.55)" : "rgba(255,255,255,0.22)"}
                strokeWidth={cuadrante ? 1.6 : 0.9}
                strokeLinecap="round"
                transform={`rotate(${deg} 50 50)`}
              />
            )
          })}

          {/* Eje sol → sombra: la mitad iluminada y la mitad que queda a contraluz */}
          <line x1={sx} y1={sy} x2={ox} y2={oy} stroke="rgba(251,191,36,0.28)" strokeWidth="1.3" />
          <circle cx={ox} cy={oy} r="3.6" fill="rgba(255,255,255,0.14)" />

          <g filter="url(#bm3dSunGlow)">
            <circle cx={sx} cy={sy} r="7.6" fill="#fbbf24" stroke="#fffbeb" strokeWidth="1" />
          </g>

          <circle cx="50" cy="50" r="2.6" fill="#52525b" stroke="#18181b" strokeWidth="0.8" />
        </svg>
      </div>
    </div>
  )
}
