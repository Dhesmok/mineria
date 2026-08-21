"use client"

import { useEffect } from "react"
import { Rotate3d, X } from "lucide-react"

/**
 * Las piezas sueltas de la interfaz del mapa: un botón, una fila de ajuste, un
 * aviso y el cartel de cómo girar en 3D.
 *
 * Estaban dentro de `MapComponentGL`. Sacarlas de allí no cambia nada de lo que
 * hacen; deja ese archivo hablando solo del mapa, que es lo que le toca.
 */

/**
 * Botón de la columna de controles del mapa.
 *
 * Existe porque esos botones venían del componente genérico de la aplicación y
 * el panel de capas se rediseñó aparte: convivían dos tipografías, dos tamaños
 * y dos grises en la misma pantalla. Este reproduce el lenguaje del panel —13
 * píxeles, colores slate, esquinas de 8— para que el visor entero se lea como
 * una sola cosa.
 */
export const MapButton = ({ active, className = "", children, ...props }) => (
  <button
    type="button"
    {...props}
    className={`flex h-9 items-center gap-2 rounded-lg border px-3 text-[13px] font-medium shadow-sm transition-colors ${
      active
        ? "border-slate-300 bg-slate-900 text-white hover:bg-slate-700"
        : "border-slate-200 bg-white text-slate-700 hover:bg-slate-50"
    } ${className}`}
  >
    {children}
  </button>
)

/**
 * Una fila de ajuste: nombre, barra y valor, todo en un renglón.
 *
 * Va en horizontal y no con la etiqueta encima porque estos ajustes viven en un
 * panel flotante sobre el mapa, y en vertical ocupaban tanto que la columna de
 * botones acababa montándose sobre el panel lateral. Se vio en una captura: las
 * comprobaciones sobre el estado del mapa daban todas por buenas.
 */
export const SliderRow = ({ id, label, title, value, display, min, max, step, onChange }) => (
  <div className="flex items-center gap-2">
    {/* El aviso de que la exageración no cambia ningún dato vivía en un párrafo
        bajo la barra y era el renglón más alto del panel. Se lee una vez y
        estorba siempre, así que ahora va en el título de la etiqueta. */}
    <label
      htmlFor={id}
      title={title}
      className="w-20 shrink-0 text-[11px] leading-tight text-gray-700"
    >
      {label}
    </label>
    <input
      id={id}
      type="range"
      min={min}
      max={max}
      step={step}
      value={value}
      onChange={(event) => onChange(parseFloat(event.target.value))}
      className="min-w-0 flex-1"
    />
    <span className="w-11 shrink-0 text-right text-[11px] tabular-nums text-gray-600">
      {display}
    </span>
  </div>
)

/**
 * Un aviso sobre el mapa.
 *
 * Los tres que hay —zoom insuficiente, respuesta recortada y modelo de
 * elevación caído— eran píldoras redondas con tres estilos distintos entre sí y
 * ninguno igual al resto de la interfaz. Ahora comparten forma, tamaño y
 * tipografía; lo único que cambia es el color, que es lo que de verdad
 * distingue un dato de una advertencia.
 */
export const MapNotice = ({ tone = "info", icon: Icon, children, onClose }) => {
  const tonos = {
    info: "border-slate-200 bg-white text-slate-700",
    warning: "border-amber-200 bg-amber-50 text-amber-900",
  }

  return (
    <div
      role="status"
      className={`flex items-center gap-2.5 rounded-lg border py-2 pl-3 pr-2 text-[13px] shadow-lg ${tonos[tone]}`}
    >
      {Icon && <Icon className="h-4 w-4 shrink-0 opacity-70" />}
      <span className="leading-snug">{children}</span>
      {onClose && (
        <button
          type="button"
          onClick={onClose}
          aria-label="Cerrar el aviso"
          className="rounded p-1 opacity-60 transition-opacity hover:bg-black/5 hover:opacity-100"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      )}
    </div>
  )
}

/**
 * Aviso de cómo se gira el mapa con el ratón.
 *
 * En el celular el 3D se maneja solo: dos dedos y ya. En el navegador hay que
 * saber que se arrastra con Ctrl, y eso no está escrito en ninguna parte, así
 * que la primera vez que alguien entra en 3D se queda con un mapa inclinado que
 * no sabe girar. El aviso sale una vez por visita y se va solo.
 *
 * Era una píldora negra de 14 px, la única pieza oscura y redonda de toda la
 * pantalla: se leía como un error del sistema y no como una ayuda. Ahora usa el
 * mismo lenguaje que los botones del mapa —blanco, borde slate, 13 px, esquinas
 * de 8— y solo la tecla va resaltada, que es el único dato que hay que retener.
 */
export const RotateHint = ({ onClose }) => {
  useEffect(() => {
    const timer = setTimeout(onClose, 9000)
    return () => clearTimeout(timer)
  }, [onClose])

  return (
    <div className="pointer-events-auto absolute top-4 left-1/2 z-20 flex -translate-x-1/2 items-center gap-2.5 rounded-lg border border-slate-200 bg-white py-2 pl-3 pr-2 text-[13px] text-slate-700 shadow-lg">
      <Rotate3d className="h-4 w-4 shrink-0 text-slate-400" />
      <span>
        Mantén{" "}
        <kbd className="rounded border border-slate-300 bg-slate-100 px-1.5 py-px font-sans text-[11px] font-semibold text-slate-700">
          Ctrl
        </kbd>{" "}
        y arrastra para girar e inclinar la escena
      </span>
      <button
        type="button"
        onClick={onClose}
        aria-label="Cerrar el aviso"
        className="rounded p-1 text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-700"
      >
        <X className="h-3.5 w-3.5" />
      </button>
    </div>
  )
}
