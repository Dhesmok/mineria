"use client"

import React from "react"

/**
 * Chasis del visor 3D: las piezas con las que se construye toda su instrumentación.
 *
 * La primera versión de esta pantalla resolvía cada control con un rectángulo oscuro
 * translúcido y un borde de un píxel. Funcionaba, pero podía ser el panel de cualquier
 * cosa: no se parecía ni a un instrumento de campo ni a lo único de esta pantalla que
 * sí tiene carácter propio, que es la brújula —bisel mecanizado, capas a distinta
 * profundidad, aguja que flota sobre su sombra—.
 *
 * Así que la brújula deja de ser la excepción y pasa a ser la regla. Todo lo demás se
 * construye con su misma gramática:
 *
 * - `bm3d-panel`   la cara de aluminio anodizado: degradado vertical, filo de luz en el
 *                  borde superior y sombra propia debajo. Es lo que da el volumen.
 * - `bm3d-groove`  la ranura fresada que separa una bahía de la siguiente: una línea
 *                  negra con un filo claro a un lado. Separa sin dibujar una caja nueva.
 * - `bm3d-key`     la tecla: cara abombada, se hunde al pulsarla y enciende un piloto
 *                  cuando queda activada.
 * - `bm3d-readout` la lectura: mono de cifras de ancho fijo con un halo del propio color,
 *                  para que el número se lea como un display y no como texto suelto.
 *
 * El color queda para decir algo, no para adornar: azul y ámbar solo en las dos
 * magnitudes que se gradúan, rojo solo en lo que cierra o borra, gris en todo lo demás.
 */

export const PANEL = "bm3d-panel rounded-2xl"
export const PANEL_SM = "bm3d-panel rounded-xl"

/** Ranura de separación entre bahías contiguas. */
export function Groove({ vertical = true, className = "" }) {
  return (
    <div
      aria-hidden="true"
      className={`${vertical ? "bm3d-groove self-stretch" : "bm3d-groove-h"} ${className}`}
    />
  )
}

/**
 * Tecla del panel. `active` la deja encendida con su piloto: un botón que cambia el
 * estado del visor tiene que poder verse encendido sin abrir un menú ni pasar el ratón.
 */
export function BlockKey({
  active = false,
  danger = false,
  onClick,
  title,
  label,
  size = 38,
  children,
}) {
  const tono = active
    ? "bm3d-key bm3d-key-on text-sky-200"
    : danger
    ? "bm3d-key text-zinc-400 hover:text-rose-300"
    : "bm3d-key text-zinc-400 hover:text-zinc-50"

  return (
    <button
      type="button"
      onClick={onClick}
      title={title}
      aria-label={label || title}
      aria-pressed={active ? true : undefined}
      style={{ width: size, height: size }}
      className={`relative flex items-center justify-center rounded-[10px] shrink-0 transition-colors ${tono}`}
    >
      {children}
      {active && (
        <span
          aria-hidden="true"
          className="absolute top-1 right-1 w-1.5 h-1.5 rounded-full bg-sky-300 shadow-[0_0_6px_rgba(56,189,248,0.95)]"
        />
      )}
    </button>
  )
}

/**
 * Hoja de estilo del chasis.
 *
 * Va en una etiqueta `<style>` y no en Tailwind porque son sombras interiores
 * encadenadas y pseudoelementos de `input[type=range]`, que no tienen utilidad
 * equivalente. El tirador de los deslizadores toma `currentColor`, así que cada uno
 * hereda el color de su magnitud desde una clase de texto y la regla no se repite
 * una vez por color.
 */
export const BLOCK_CHROME_CSS = `
.bm3d-panel {
  background: linear-gradient(180deg, #1d1d22 0%, #141418 42%, #0a0a0c 100%);
  border: 1px solid #2c2c33;
  box-shadow:
    inset 0 1px 0 rgba(255,255,255,0.10),
    inset 0 -1px 0 rgba(0,0,0,0.75),
    0 12px 34px rgba(0,0,0,0.70);
}

.bm3d-groove {
  width: 1px;
  background: #000000;
  box-shadow: 1px 0 0 rgba(255,255,255,0.07);
}

.bm3d-groove-h {
  height: 1px;
  background: #000000;
  box-shadow: 0 1px 0 rgba(255,255,255,0.07);
}

.bm3d-key {
  background: linear-gradient(180deg, #2a2a31 0%, #17171b 100%);
  border: 1px solid #35353d;
  box-shadow: inset 0 1px 0 rgba(255,255,255,0.09), 0 1px 3px rgba(0,0,0,0.7);
}
.bm3d-key:hover { background: linear-gradient(180deg, #32323a 0%, #1c1c21 100%); }
.bm3d-key:active {
  background: linear-gradient(180deg, #131317 0%, #212127 100%);
  box-shadow: inset 0 2px 5px rgba(0,0,0,0.85);
}
.bm3d-key-on {
  background: linear-gradient(180deg, #0f3c53 0%, #07212e 100%);
  border-color: #0e7490;
  box-shadow: inset 0 1px 0 rgba(255,255,255,0.14), 0 0 14px rgba(56,189,248,0.28);
}

.bm3d-readout { text-shadow: 0 0 12px currentColor; }

/* Bisel circular: el mismo aro mecanizado de la brújula, para el dial del sol */
.bm3d-bezel {
  background: linear-gradient(180deg, #2e2e36 0%, #0a0a0c 100%);
  border: 1px solid #35353d;
  box-shadow: inset 0 1px 0 rgba(255,255,255,0.16), 0 3px 8px rgba(0,0,0,0.85);
}

/* Deslizador graduado: carril hundido y tirador con luz propia */
.bm3d-range { -webkit-appearance: none; appearance: none; background: transparent; height: 20px; width: 100%; }
.bm3d-range:focus { outline: none; }
.bm3d-range::-webkit-slider-runnable-track {
  height: 5px; border-radius: 9999px;
  background: linear-gradient(180deg, #000000 0%, #1b1b20 100%);
  box-shadow: inset 0 1px 2px rgba(0,0,0,0.95), 0 1px 0 rgba(255,255,255,0.07);
}
.bm3d-range::-webkit-slider-thumb {
  -webkit-appearance: none; appearance: none;
  width: 17px; height: 17px; margin-top: -6px; border-radius: 9999px;
  background: radial-gradient(circle at 50% 28%, #ffffff 0%, currentColor 58%, rgba(0,0,0,0.6) 100%);
  border: 1px solid rgba(0,0,0,0.65);
  box-shadow: 0 1px 3px rgba(0,0,0,0.85), 0 0 10px currentColor;
}
.bm3d-range::-moz-range-track {
  height: 5px; border-radius: 9999px;
  background: linear-gradient(180deg, #000000 0%, #1b1b20 100%);
  box-shadow: inset 0 1px 2px rgba(0,0,0,0.95);
}
.bm3d-range::-moz-range-thumb {
  width: 17px; height: 17px; border-radius: 9999px;
  background: radial-gradient(circle at 50% 28%, #ffffff 0%, currentColor 58%, rgba(0,0,0,0.6) 100%);
  border: 1px solid rgba(0,0,0,0.65);
  box-shadow: 0 1px 3px rgba(0,0,0,0.85), 0 0 10px currentColor;
}

/* Barra de carga del modelo de elevación: dice "estoy trabajando" sin escribirlo */
.bm3d-load { position: relative; overflow: hidden; background: rgba(255,255,255,0.07); }
.bm3d-load::after {
  content: ""; position: absolute; top: 0; bottom: 0; left: 0; width: 38%;
  background: linear-gradient(90deg, transparent, #38bdf8, transparent);
  animation: bm3dLoad 1.15s linear infinite;
}
@keyframes bm3dLoad {
  0%   { transform: translateX(-110%); }
  100% { transform: translateX(370%); }
}
@media (prefers-reduced-motion: reduce) {
  .bm3d-load::after { animation: none; width: 100%; opacity: 0.45; }
}
`
