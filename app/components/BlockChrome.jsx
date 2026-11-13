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
    ? "bm3d-key bm3d-key-on text-primary"
    : danger
    ? "bm3d-key text-label-3 hover:text-danger"
    : "bm3d-key text-label-3 hover:text-foreground"

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
          className="absolute top-1 right-1 w-1.5 h-1.5 rounded-full bg-primary"
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
  background: rgba(255,255,255,0.82);
  -webkit-backdrop-filter: blur(24px) saturate(180%);
  backdrop-filter: blur(24px) saturate(180%);
  border: 1px solid rgba(255,255,255,0.7);
  box-shadow:
    0 0 0 0.5px rgba(29,29,31,0.10),
    0 10px 30px -8px rgba(29,29,31,0.18);
}

.bm3d-groove {
  width: 1px;
  background: rgba(60,60,67,0.12);
}

.bm3d-groove-h {
  height: 1px;
  background: rgba(60,60,67,0.12);
}

.bm3d-key {
  background: rgba(120,120,128,0.08);
  border: 1px solid transparent;
}
.bm3d-key:hover { background: rgba(120,120,128,0.16); }
.bm3d-key:active { background: rgba(120,120,128,0.22); }
.bm3d-key-on {
  background: rgba(0,113,227,0.10);
  border-color: rgba(0,113,227,0.22);
  color: #0060c0;
}

.bm3d-readout { font-variant-numeric: tabular-nums; }

/* Aro del dial del sol: un círculo blanco con borde fino, como la brújula */
.bm3d-bezel {
  background: #ffffff;
  border: 1px solid rgba(60,60,67,0.14);
  box-shadow: 0 1px 4px rgba(29,29,31,0.10);
}

/* Deslizador: carril gris y tirador blanco con sombra, como los de iOS. El
   tirador lleva un anillo del color de su magnitud (currentColor) para que se
   siga sabiendo cuál es cuál sin el brillo de neón de antes. */
.bm3d-range { -webkit-appearance: none; appearance: none; background: transparent; height: 20px; width: 100%; }
.bm3d-range:focus { outline: none; }
.bm3d-range::-webkit-slider-runnable-track {
  height: 4px; border-radius: 9999px;
  background: rgba(120,120,128,0.2);
}
.bm3d-range::-webkit-slider-thumb {
  -webkit-appearance: none; appearance: none;
  width: 18px; height: 18px; margin-top: -7px; border-radius: 9999px;
  background: #ffffff;
  border: 2px solid currentColor;
  box-shadow: 0 1px 4px rgba(29,29,31,0.25);
}
.bm3d-range::-moz-range-track {
  height: 4px; border-radius: 9999px;
  background: rgba(120,120,128,0.2);
}
.bm3d-range::-moz-range-thumb {
  width: 16px; height: 16px; border-radius: 9999px;
  background: #ffffff;
  border: 2px solid currentColor;
  box-shadow: 0 1px 4px rgba(29,29,31,0.25);
}

/* Barra de carga del modelo de elevación: dice "estoy trabajando" sin escribirlo */
.bm3d-load { position: relative; overflow: hidden; background: rgba(120,120,128,0.14); }
.bm3d-load::after {
  content: ""; position: absolute; top: 0; bottom: 0; left: 0; width: 38%;
  background: linear-gradient(90deg, transparent, #0071e3, transparent);
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
