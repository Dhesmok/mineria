"use client"

import React from "react"

/**
 * Chasis del visor 3D: las piezas con las que se construye su instrumentación.
 *
 * Es el mismo lenguaje que el resto del visor —vidrio claro, iconos sin caja, un
 * solo azul para lo encendido—, y no uno propio. Una versión anterior imitaba un
 * instrumento de aluminio, con teclas abombadas, pilotos y cifras de colores en
 * grande; junto a la barra lateral nueva parecía otra aplicación.
 *
 * - `bm3d-panel`   el vidrio: lo mismo que `.glass` de globals.css, repetido aquí
 *                  porque esta hoja de estilo viaja con el componente.
 * - `bm3d-groove`  la línea fina que separa una bahía de la siguiente.
 * - `bm3d-key`     el botón de icono: transparente, gris al pasar, azul encendido.
 * - `bm3d-readout` las cifras, con ancho fijo para que no bailen al cambiar.
 *
 * La brújula es la excepción a propósito: es el único instrumento de verdad de la
 * pantalla y conserva su volumen.
 */

export const PANEL = "bm3d-panel rounded-2xl"
export const PANEL_SM = "bm3d-panel rounded-xl"
export const PANEL_PILL = "bm3d-panel rounded-full"

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
 * Tecla del panel. `active` la deja encendida en azul lavado: un botón que cambia el
 * estado del visor tiene que poder verse encendido sin abrir un menú ni pasar el ratón.
 * Basta con el color, como en las barras de macOS; el piloto que llevaba antes era
 * una segunda señal para decir lo mismo.
 */
export function BlockKey({
  active = false,
  danger = false,
  onClick,
  title,
  label,
  size = 34,
  round = false,
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
      className={`relative flex items-center justify-center ${round ? "rounded-full" : "rounded-[9px]"} shrink-0 transition-colors ${tono}`}
    >
      {children}
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

/* Teclas sin caja: el icono solo, con un fondo gris al pasar por encima y azul
   lavado cuando están encendidas. Antes cada una era un cuadrito gris, y una fila
   de cinco cuadritos se leía como un teclado y no como una barra de herramientas. */
.bm3d-key {
  background: transparent;
}
.bm3d-key:hover { background: rgba(120,120,128,0.12); }
.bm3d-key:active { background: rgba(120,120,128,0.2); }
.bm3d-key-on,
.bm3d-key-on:hover {
  background: rgba(0,113,227,0.11);
  color: #0066cc;
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
