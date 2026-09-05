"use client"

import { useEffect, useRef, useState } from "react"
import { Box, Orbit, Rotate3d, X } from "lucide-react"

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
    className={`flex h-10 items-center gap-2 rounded-xl border px-3 text-[12.5px] font-medium shadow-sm transition-all md:h-9 ${
      active
        ? "border-zinc-700 bg-zinc-800 text-white shadow"
        : "border-zinc-800/80 bg-[#09090b]/90 text-zinc-300 hover:bg-zinc-800/80 hover:text-white"
    } ${className}`}
  >
    {Icon && <Icon className="h-4 w-4 shrink-0" />}
    <span className="hidden whitespace-nowrap md:inline">{children}</span>
    {badge && (
      <span
        className={`ml-0.5 hidden rounded px-1.5 py-0.5 text-[9px] font-semibold md:inline ${
          active ? "bg-white/20 text-white" : "bg-zinc-800 text-zinc-400"
        }`}
      >
        {badge}
      </span>
    )}
  </button>
)

/**
 * HUD unificado compacto para el mapa (Norte, Zoom +, Zoom -, 3D).
 * Cero duplicidades en el lienzo.
 */
export const MapHUD = ({
  bearing = 0,
  is3D = false,
  hud3DOpen = false,
  onResetNorth,
  onZoomIn,
  onZoomOut,
  onToggle3D,
}) => (
  <div
    role="toolbar"
    aria-label="Controles de navegación del mapa"
    className="flex flex-col items-center gap-1 rounded-2xl border border-zinc-800/90 bg-[#09090b]/90 p-1.5 shadow-2xl backdrop-blur-2xl"
  >
    {/* Brújula interactiva */}
    <button
      type="button"
      onClick={onResetNorth}
      title="Orientar al Norte (0°)"
      aria-label="Orientar al Norte"
      className="flex h-9 w-9 items-center justify-center rounded-xl text-zinc-300 hover:bg-zinc-800 hover:text-white transition-colors"
    >
      <div
        style={{ transform: `rotate(${-bearing}deg)` }}
        className="transition-transform duration-150"
      >
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
          <polygon points="12,2 16,12 12,9 8,12" fill="#ef4444" />
          <polygon points="12,22 16,12 12,9 8,12" fill="#71717a" />
        </svg>
      </div>
    </button>

    <div className="h-px w-6 bg-zinc-800" />

    {/* Zoom In */}
    <button
      type="button"
      onClick={onZoomIn}
      title="Acercar mapa (+)"
      aria-label="Acercar mapa"
      className="flex h-9 w-9 items-center justify-center rounded-xl text-zinc-300 hover:bg-zinc-800 hover:text-white transition-colors text-lg font-semibold"
    >
      +
    </button>

    {/* Zoom Out */}
    <button
      type="button"
      onClick={onZoomOut}
      title="Alejar mapa (−)"
      aria-label="Alejar mapa"
      className="flex h-9 w-9 items-center justify-center rounded-xl text-zinc-300 hover:bg-zinc-800 hover:text-white transition-colors text-lg font-semibold"
    >
      −
    </button>

    <div className="h-px w-6 bg-zinc-800" />

    {/* 3D / 2D Toggle */}
    <button
      type="button"
      onClick={onToggle3D}
      title={is3D ? "Volver a vista plana (2D)" : "Activar perspectiva 3D"}
      aria-label={is3D ? "Volver a 2D" : "Perspectiva 3D"}
      aria-pressed={is3D}
      className={`flex h-9 w-9 items-center justify-center rounded-xl text-xs font-bold transition-all ${
        is3D || hud3DOpen
          ? "bg-white text-black shadow-sm"
          : "text-zinc-400 hover:bg-zinc-800 hover:text-white"
      }`}
    >
      {is3D ? "2D" : "3D"}
    </button>
  </div>
)

/**
 * Una fila de ajuste: nombre, barra y valor, todo en un renglón.
 */
export const SliderRow = ({ id, label, title, value, display, min, max, step, onChange }) => (
  <div className="flex items-center gap-2">
    <label
      htmlFor={id}
      title={title}
      className="w-20 shrink-0 text-[11px] leading-tight text-zinc-400"
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
      className="min-w-0 flex-1 h-1.5 cursor-pointer appearance-none rounded-lg bg-zinc-800 accent-white"
    />
    <span className="w-11 shrink-0 text-right text-[11px] tabular-nums text-zinc-300">
      {display}
    </span>
  </div>
)

/**
 * Un aviso sobre el mapa.
 */
export const MapNotice = ({ tone = "info", icon: Icon, children, onClose }) => {
  const tonos = {
    info: "border-zinc-800 bg-[#09090b]/95 text-zinc-200",
    warning: "border-amber-900/60 bg-[#1c1408]/95 text-amber-200",
  }

  return (
    <div
      role="status"
      className={`flex items-center gap-2.5 rounded-xl border py-2 pl-3 pr-2 text-[12.5px] shadow-2xl backdrop-blur-xl ${tonos[tone]}`}
    >
      {Icon && <Icon className="h-4 w-4 shrink-0 opacity-70" />}
      <span className="leading-snug">{children}</span>
      {onClose && (
        <button
          type="button"
          onClick={onClose}
          aria-label="Cerrar el aviso"
          className="rounded p-1 opacity-60 transition-opacity hover:bg-white/10 hover:opacity-100"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      )}
    </div>
  )
}

/**
 * Aviso de cómo se gira el mapa con el ratón.
 */
export const RotateHint = ({ onClose }) => {
  useEffect(() => {
    const timer = setTimeout(onClose, 9000)
    return () => clearTimeout(timer)
  }, [onClose])

  return (
    <div className="pointer-events-auto absolute top-4 left-1/2 z-20 flex -translate-x-1/2 items-center gap-2.5 rounded-xl border border-zinc-800/90 bg-[#09090b]/95 py-2 pl-3 pr-2 text-[12.5px] text-zinc-200 shadow-2xl backdrop-blur-2xl">
      <Rotate3d className="h-4 w-4 shrink-0 text-zinc-400" />
      <span>
        Mantén{" "}
        <kbd className="rounded border border-zinc-700 bg-zinc-800 px-1.5 py-0.5 font-sans text-[11px] font-semibold text-zinc-100">
          Ctrl
        </kbd>{" "}
        y arrastra para girar e inclinar la escena
      </span>
      <button
        type="button"
        onClick={onClose}
        aria-label="Cerrar el aviso"
        className="rounded p-1 text-zinc-400 transition-colors hover:bg-zinc-800 hover:text-white"
      >
        <X className="h-3.5 w-3.5" />
      </button>
    </div>
  )
}

/**
 * HUD 3D de alta precisión con controles continuos y giro automático ("Girar solo").
 * Permite cambiar la inclinación (tilt), la exageración de relieve vertical (hasta 5×),
 * la orientación y activar la rotación continua fluida.
 */
/**
 * Controlador interactivo de esfera 3D (Trackball / Gizmo)
 */
const GizmoSphere = ({
  pitch,
  bearing,
  onChangePitch,
  onChangeBearing,
  onResetNorth,
}) => {
  const isDragging = useRef(false)
  const startPos = useRef({ x: 0, y: 0, pitch: 0, bearing: 0 })

  const handlePointerDown = (e) => {
    isDragging.current = true
    startPos.current = {
      x: e.clientX,
      y: e.clientY,
      pitch,
      bearing,
    }
    e.currentTarget.setPointerCapture?.(e.pointerId)
  }

  const handlePointerMove = (e) => {
    if (!isDragging.current) return
    const dx = e.clientX - startPos.current.x
    const dy = e.clientY - startPos.current.y

    // Movimiento horizontal ajusta el rumbo orbital (bearing)
    const newBearing = ((startPos.current.bearing + dx * 0.75) % 360 + 360) % 360
    // Movimiento vertical ajusta la inclinación (pitch) restringida de 0° (2D) a 65° (máximo terreno sin colisión)
    const newPitch = Math.max(0, Math.min(65, startPos.current.pitch - dy * 0.45))

    onChangeBearing?.(Math.round(newBearing))
    onChangePitch?.(Math.round(newPitch))
  }

  const handlePointerUp = (e) => {
    if (isDragging.current) {
      isDragging.current = false
      e.currentTarget.releasePointerCapture?.(e.pointerId)
    }
  }

  return (
    <div className="flex flex-col items-center py-1 select-none">
      {/* Esfera 3D Interactivo */}
      <div
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerUp}
        className="relative h-36 w-36 cursor-grab active:cursor-grabbing rounded-full border border-zinc-700/80 bg-gradient-to-b from-zinc-850 to-zinc-950 shadow-[inset_0_0_24px_rgba(0,0,0,0.8),0_8px_20px_rgba(0,0,0,0.6)] flex items-center justify-center overflow-hidden touch-none"
        title="Arrastra para rotar el rumbo e inclinar la vista 3D"
      >
        {/* Anillos de latitud y longitud estilo giroscopio */}
        <div
          className="absolute inset-2 rounded-full border border-dashed border-zinc-600/40 pointer-events-none transition-transform duration-75"
          style={{
            transform: `perspective(300px) rotateX(${pitch}deg) rotateZ(${-bearing}deg)`,
          }}
        />
        <div
          className="absolute inset-5 rounded-full border border-zinc-500/30 pointer-events-none transition-transform duration-75"
          style={{
            transform: `perspective(300px) rotateX(${pitch}deg) rotateZ(${-bearing}deg)`,
          }}
        />

        {/* Eje y aguja central orientada con bearing y pitch */}
        <div
          className="relative h-20 w-20 flex items-center justify-center pointer-events-none transition-transform duration-75"
          style={{
            transform: `perspective(240px) rotateX(${pitch}deg) rotateZ(${-bearing}deg)`,
            transformStyle: "preserve-3d",
          }}
        >
          {/* Marcador Norte */}
          <div className="absolute top-0 flex flex-col items-center">
            <span className="text-[10px] font-bold text-rose-400 font-mono tracking-wider">N</span>
            <div className="h-4 w-1 bg-rose-500 rounded-full shadow-sm" />
          </div>
          {/* Marcador Sur */}
          <div className="absolute bottom-0 flex flex-col items-center">
            <div className="h-4 w-1 bg-zinc-500 rounded-full" />
            <span className="text-[10px] font-bold text-zinc-400 font-mono">S</span>
          </div>
          {/* Marcador Este */}
          <div className="absolute right-0 flex items-center">
            <div className="w-4 h-1 bg-zinc-500 rounded-full" />
            <span className="text-[10px] font-bold text-zinc-400 font-mono ml-0.5">E</span>
          </div>
          {/* Marcador Oeste */}
          <div className="absolute left-0 flex items-center">
            <span className="text-[10px] font-bold text-zinc-400 font-mono mr-0.5">O</span>
            <div className="w-4 h-1 bg-zinc-500 rounded-full" />
          </div>
          {/* Centro */}
          <div className="h-3 w-3 rounded-full bg-white shadow-md ring-2 ring-zinc-700" />
        </div>

        {/* Pista de interacción */}
        <span className="absolute bottom-2 text-[8.5px] font-mono text-zinc-500 pointer-events-none uppercase tracking-widest opacity-80">
          Arrastrar
        </span>
      </div>

      {/* Botones de perspectiva rápida */}
      <div className="mt-2.5 grid grid-cols-4 gap-1 w-full">
        <button
          type="button"
          onClick={onResetNorth}
          className="rounded-lg border border-zinc-800 bg-zinc-900/80 py-1 text-center text-[10.5px] font-medium text-zinc-200 hover:bg-zinc-800 hover:text-white transition-colors"
        >
          Norte
        </button>
        <button
          type="button"
          onClick={() => onChangeBearing?.(90)}
          className="rounded-lg border border-zinc-800 bg-zinc-900/80 py-1 text-center text-[10.5px] font-medium text-zinc-200 hover:bg-zinc-800 hover:text-white transition-colors"
        >
          Este
        </button>
        <button
          type="button"
          onClick={() => onChangeBearing?.(180)}
          className="rounded-lg border border-zinc-800 bg-zinc-900/80 py-1 text-center text-[10.5px] font-medium text-zinc-200 hover:bg-zinc-800 hover:text-white transition-colors"
        >
          Sur
        </button>
        <button
          type="button"
          onClick={() => onChangeBearing?.(270)}
          className="rounded-lg border border-zinc-800 bg-zinc-900/80 py-1 text-center text-[10.5px] font-medium text-zinc-200 hover:bg-zinc-800 hover:text-white transition-colors"
        >
          Oeste
        </button>
      </div>
    </div>
  )
}

/**
 * Consola flotante de controles para navegación en perspectiva 3D.
 * Permite alternar entre modo deslizadores y esfera interactiva (Gizmo).
 */
export const Hud3DPopover = ({
  pitch = 0,
  exaggeration = 1.5,
  bearing = 0,
  isSpinning = false,
  onToggleSpin,
  onChangePitch,
  onChangeExaggeration,
  onChangeBearing,
  onRotateBy,
  onResetNorth,
  onClose,
}) => {
  const [modeView, setModeView] = useState("sliders")
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
      className="pointer-events-auto w-[305px] rounded-2xl border border-zinc-800/90 bg-[#09090b]/95 p-3.5 text-zinc-100 shadow-2xl backdrop-blur-2xl transition-all"
    >
      {/* Cabecera */}
      <div className="mb-3 flex items-center justify-between border-b border-zinc-800/80 pb-2">
        <div className="flex items-center gap-2 text-xs font-semibold text-zinc-100">
          <Box className="h-4 w-4 text-white" />
          <span className="tracking-wide">Perspectiva 3D</span>
        </div>
        <div className="flex items-center gap-1.5">
          {/* Botón Girar */}
          <button
            type="button"
            onClick={onToggleSpin}
            title={isSpinning ? "Detener giro" : "Girar continuamente"}
            aria-pressed={isSpinning}
            className={`flex items-center gap-1 rounded-lg px-2 py-0.5 text-[10.5px] font-medium transition-all ${
              isSpinning
                ? "bg-white text-black font-semibold shadow-sm"
                : "border border-zinc-800 bg-zinc-900/80 text-zinc-300 hover:bg-zinc-800 hover:text-white"
            }`}
          >
            <Rotate3d className={`h-3 w-3 ${isSpinning ? "animate-spin" : ""}`} />
            <span>Girar</span>
          </button>

          {/* Botón Vista */}
          <button
            type="button"
            onClick={() => setModeView((m) => (m === "sliders" ? "gizmo" : "sliders"))}
            title={modeView === "sliders" ? "Cambiar a esfera de orientación 3D" : "Cambiar a deslizadores"}
            className={`flex items-center gap-1 rounded-lg px-2 py-0.5 text-[10.5px] font-medium transition-all ${
              modeView === "gizmo"
                ? "bg-zinc-800 text-white border border-zinc-700 font-semibold shadow-sm"
                : "border border-zinc-800 bg-zinc-900/80 text-zinc-300 hover:bg-zinc-800 hover:text-white"
            }`}
          >
            <Orbit className="h-3 w-3" />
            <span>Vista</span>
          </button>

          {onClose && (
            <button
              type="button"
              onClick={onClose}
              aria-label="Cerrar controles 3D"
              className="rounded p-1 text-zinc-400 transition-colors hover:bg-zinc-800 hover:text-white"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
      </div>

      {modeView === "gizmo" ? (
        <>
          <GizmoSphere
            pitch={normPitch}
            bearing={normBearing}
            onChangePitch={onChangePitch}
            onChangeBearing={onChangeBearing}
            onResetNorth={onResetNorth}
          />
          {/* Lectura de ángulos y ajuste de relieve */}
          <div className="mt-2 border-t border-zinc-800/80 pt-2.5">
            <div className="mb-2 flex items-center justify-between text-[11px] font-mono">
              <span className="text-zinc-400">
                Inclinación: <span className="text-white font-semibold">{normPitch}°</span>
              </span>
              <span className="text-zinc-400">
                Rumbo: <span className="text-white font-semibold">{normBearing}° {compassHeading(normBearing)}</span>
              </span>
            </div>
            <div className="flex items-center justify-between text-[11px] mb-1">
              <span className="font-medium text-zinc-300">Exageración vertical</span>
              <span className="font-mono text-[10px] font-semibold text-white">
                {Number(exaggeration).toFixed(1)}×
              </span>
            </div>
            <input
              type="range"
              min="0.5"
              max="5"
              step="0.25"
              value={exaggeration}
              onChange={(e) => onChangeExaggeration?.(parseFloat(e.target.value))}
              className="h-1.5 w-full cursor-pointer appearance-none rounded-lg bg-zinc-800 accent-white"
              aria-label="Ajustar exageración vertical de relieve"
            />
          </div>
        </>
      ) : (
        <>
          {/* 1. Inclinación de Cámara (Tilt) continua */}
          <div className="mb-3">
            <div className="mb-1 flex items-center justify-between text-[11px]">
              <span className="font-medium text-zinc-300">Inclinación de cámara</span>
              <span className="font-mono text-[10px] font-semibold text-white">
                {normPitch === 0 ? "0° (2D)" : `${normPitch}°`}
              </span>
            </div>
            <input
              type="range"
              min="0"
              max="65"
              step="1"
              value={normPitch}
              onChange={(e) => onChangePitch?.(parseFloat(e.target.value))}
              className="h-1.5 w-full cursor-pointer appearance-none rounded-lg bg-zinc-800 accent-white"
              aria-label="Ajustar inclinación de cámara"
            />
            <div className="mt-1 flex justify-between text-[9px] font-mono text-zinc-500">
              <span>0°</span>
              <span>30°</span>
              <span>45°</span>
              <span>65° Máx</span>
            </div>
          </div>

          {/* 2. Exageración Vertical continua (hasta 5x) */}
          <div className="mb-3">
            <div className="mb-1 flex items-center justify-between text-[11px]">
              <span className="font-medium text-zinc-300">Exageración vertical</span>
              <span className="font-mono text-[10px] font-semibold text-white">
                {Number(exaggeration).toFixed(1)}×
              </span>
            </div>
            <input
              type="range"
              min="0.5"
              max="5"
              step="0.25"
              value={exaggeration}
              onChange={(e) => onChangeExaggeration?.(parseFloat(e.target.value))}
              className="h-1.5 w-full cursor-pointer appearance-none rounded-lg bg-zinc-800 accent-white"
              aria-label="Ajustar exageración vertical de relieve"
            />
            <div className="mt-1 flex justify-between text-[9px] font-mono text-zinc-500">
              <span>0.5×</span>
              <span>1.5×</span>
              <span>3×</span>
              <span>5× Máx</span>
            </div>
          </div>

          {/* 3. Rotación Orbital continua */}
          <div>
            <div className="mb-1 flex items-center justify-between text-[11px]">
              <span className="font-medium text-zinc-300">Orientación</span>
              <span className="font-mono text-[10px] text-zinc-300">
                {normBearing}° {compassHeading(normBearing)}
              </span>
            </div>
            <input
              type="range"
              min="0"
              max="360"
              step="1"
              value={normBearing}
              onChange={(e) => onChangeBearing?.(parseFloat(e.target.value))}
              className="h-1.5 w-full cursor-pointer appearance-none rounded-lg bg-zinc-800 accent-white"
              aria-label="Ajustar orientación horizontal"
            />
            <div className="mt-2 grid grid-cols-3 gap-1">
              <button
                type="button"
                onClick={() => {
                  if (onRotateBy) onRotateBy(-45)
                  else onChangeBearing?.((normBearing - 45 + 360) % 360)
                }}
                title="Girar 45° a la izquierda suavemente"
                className="rounded-lg border border-zinc-800 bg-zinc-900/60 py-1 text-center text-[10.5px] font-medium text-zinc-300 transition-colors hover:bg-zinc-800 hover:text-white"
              >
                ↺ -45°
              </button>
              <button
                type="button"
                onClick={onResetNorth}
                title="Orientar al Norte (0°)"
                className="rounded-lg border border-zinc-700 bg-zinc-800/80 py-1 text-center text-[10.5px] font-medium text-white transition-colors hover:bg-zinc-700"
              >
                Norte 0°
              </button>
              <button
                type="button"
                onClick={() => {
                  if (onRotateBy) onRotateBy(45)
                  else onChangeBearing?.((normBearing + 45) % 360)
                }}
                title="Girar 45° a la derecha suavemente"
                className="rounded-lg border border-zinc-800 bg-zinc-900/60 py-1 text-center text-[10.5px] font-medium text-zinc-300 transition-colors hover:bg-zinc-800 hover:text-white"
              >
                ↻ +45°
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  )
}

