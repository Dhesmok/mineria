"use client"

import { useEffect } from "react"
import { Box, Rotate3d, X } from "lucide-react"

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
 *
 * **En pantalla estrecha se queda solo con el icono.** Los cinco botones con su
 * texto miden más que un teléfono de ancho, así que en la columna vertical
 * acababan tapando el mapa entero. El texto sigue estando en `title` y en el
 * nombre accesible, que es lo que necesitan un lector de pantalla y quien deja
 * el dedo encima.
 *
 * El blanco de pulsación no baja de 44 px de alto en táctil: por debajo de eso
 * un dedo falla más veces de las que acierta.
 */
export const MapButton = ({ active, icon: Icon, badge, className = "", children, ...props }) => (
  <button
    type="button"
    title={typeof children === "string" ? children : undefined}
    aria-label={typeof children === "string" ? children : undefined}
    {...props}
    className={`flex h-11 items-center gap-2 rounded-lg border px-3 text-[13px] font-medium shadow-sm transition-colors md:h-9 ${
      active
        ? "border-slate-300 bg-slate-900 text-white hover:bg-slate-700"
        : "border-slate-200 bg-white text-slate-700 hover:bg-slate-50"
    } ${className}`}
  >
    {Icon && <Icon className="h-4 w-4 shrink-0" />}
    <span className="hidden whitespace-nowrap md:inline">{children}</span>
    {badge && (
      <span
        className={`ml-0.5 hidden rounded px-1 py-px text-[9px] font-semibold md:inline ${
          active ? "bg-white/20" : "bg-slate-100 text-slate-500"
        }`}
      >
        {badge}
      </span>
    )}
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

/**
 * HUD 3D de alta precisión con botones segmentados (CERO SLIDERS).
 * Permite cambiar la inclinación (tilt), la exageración de relieve vertical (hasta 5×)
 * y la rotación orbital horizontal de forma instantánea y elegante.
 */
export const Hud3DPopover = ({
  pitch = 0,
  exaggeration = 1.5,
  bearing = 0,
  onChangePitch,
  onChangeExaggeration,
  onChangeBearing,
  onResetNorth,
  onClose,
}) => {
  const normBearing = Math.round(((bearing % 360) + 360) % 360)
  const normPitch = Math.round(pitch)

  const compassHeading = (b) => {
    if (b >= 337.5 || b < 22.5) return "Norte"
    if (b >= 22.5 && b < 67.5) return "NE"
    if (b >= 67.5 && b < 112.5) return "Este"
    if (b >= 112.5 && b < 157.5) return "SE"
    if (b >= 157.5 && b < 202.5) return "Sur"
    if (b >= 202.5 && b < 247.5) return "SO"
    if (b >= 247.5 && b < 292.5) return "Oeste"
    return "NO"
  }

  return (
    <div
      role="dialog"
      aria-label="Perspectiva 3D del Terreno"
      className="pointer-events-auto w-[295px] rounded-xl border border-slate-750/80 bg-[#0b1329]/95 p-3.5 text-slate-100 shadow-2xl backdrop-blur-2xl transition-all"
    >
      {/* Cabecera */}
      <div className="mb-3 flex items-center justify-between border-b border-slate-800/80 pb-2">
        <div className="flex items-center gap-2 text-xs font-semibold text-sky-400">
          <Box className="h-4 w-4 text-sky-400" />
          <span className="tracking-wide">Perspectiva 3D del Terreno</span>
        </div>
        {onClose && (
          <button
            type="button"
            onClick={onClose}
            aria-label="Cerrar controles 3D"
            className="rounded p-1 text-slate-400 transition-colors hover:bg-slate-800 hover:text-white"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        )}
      </div>

      {/* 1. Inclinación (Tilt) - Cero sliders */}
      <div className="mb-3">
        <div className="mb-1.5 flex items-center justify-between text-[11px]">
          <span className="font-medium text-slate-300">Inclinación de Cámara</span>
          <span className="rounded bg-sky-950/80 px-1.5 py-0.5 font-mono text-[10px] font-semibold text-sky-300 border border-sky-800/50">
            {normPitch === 0 ? "0° 2D" : `${normPitch}°`}
          </span>
        </div>
        <div className="grid grid-cols-4 gap-1 rounded-lg bg-slate-950/70 p-1 border border-slate-800/70">
          {[
            { label: "0° 2D", val: 0 },
            { label: "30°", val: 30 },
            { label: "45°", val: 45 },
            { label: "60°", val: 60 },
          ].map((item) => {
            const active = normPitch === item.val
            return (
              <button
                key={item.val}
                type="button"
                onClick={() => onChangePitch?.(item.val)}
                aria-pressed={active}
                className={`rounded-md py-1 text-center text-[11px] font-medium transition-all ${
                  active
                    ? "bg-blue-600 text-white shadow-sm font-semibold"
                    : "text-slate-400 hover:bg-slate-800/60 hover:text-slate-200"
                }`}
              >
                {item.label}
              </button>
            )
          })}
        </div>
      </div>

      {/* 2. Exageración Vertical - Hasta 5x (Cero sliders) */}
      <div className="mb-3">
        <div className="mb-1.5 flex items-center justify-between text-[11px]">
          <span className="font-medium text-slate-300">Exageración Vertical</span>
          <span className="rounded bg-emerald-950/80 px-1.5 py-0.5 font-mono text-[10px] font-semibold text-emerald-300 border border-emerald-800/50">
            {Number(exaggeration).toFixed(1)}×
          </span>
        </div>
        <div className="grid grid-cols-4 gap-1 rounded-lg bg-slate-950/70 p-1 border border-slate-800/70">
          {[
            { label: "1×", val: 1 },
            { label: "2×", val: 2 },
            { label: "3×", val: 3 },
            { label: "5× Máx", val: 5 },
          ].map((item) => {
            const active = Math.round(exaggeration) === item.val
            return (
              <button
                key={item.val}
                type="button"
                onClick={() => onChangeExaggeration?.(item.val)}
                aria-pressed={active}
                className={`rounded-md py-1 text-center text-[11px] font-medium transition-all ${
                  active
                    ? "bg-emerald-600 text-white shadow-sm font-semibold"
                    : "text-slate-400 hover:bg-slate-800/60 hover:text-slate-200"
                }`}
              >
                {item.label}
              </button>
            )
          })}
        </div>
      </div>

      {/* 3. Rotación Orbital Rápida */}
      <div>
        <div className="mb-1.5 flex items-center justify-between text-[11px]">
          <span className="font-medium text-slate-300">Rotación Horizontal</span>
          <span className="rounded bg-slate-900 px-1.5 py-0.5 font-mono text-[10px] text-slate-300 border border-slate-800">
            {normBearing}° {compassHeading(normBearing)}
          </span>
        </div>
        <div className="grid grid-cols-4 gap-1">
          <button
            type="button"
            onClick={() => onChangeBearing?.((normBearing - 45 + 360) % 360)}
            title="Girar 45° a la izquierda"
            className="rounded-lg border border-slate-800 bg-slate-950/60 py-1.5 text-center text-[11px] font-medium text-slate-300 transition-colors hover:bg-slate-800 hover:text-white"
          >
            ↺ -45°
          </button>
          <button
            type="button"
            onClick={onResetNorth}
            title="Orientar al Norte (0°)"
            className="rounded-lg border border-blue-900/60 bg-blue-950/40 py-1.5 text-center text-[11px] font-medium text-blue-300 transition-colors hover:bg-blue-900/60 hover:text-white"
          >
            Norte 0°
          </button>
          <button
            type="button"
            onClick={() => onChangeBearing?.((normBearing + 45) % 360)}
            title="Girar 45° a la derecha"
            className="rounded-lg border border-slate-800 bg-slate-950/60 py-1.5 text-center text-[11px] font-medium text-slate-300 transition-colors hover:bg-slate-800 hover:text-white"
          >
            ↻ +45°
          </button>
          <button
            type="button"
            onClick={() => onChangeBearing?.(180)}
            title="Mirar hacia el Sur (180°)"
            className="rounded-lg border border-slate-800 bg-slate-950/60 py-1.5 text-center text-[11px] font-medium text-slate-300 transition-colors hover:bg-slate-800 hover:text-white"
          >
            180° Sur
          </button>
        </div>
      </div>
    </div>
  )
}

