"use client"

import { useEffect, useRef, useState } from "react"
import { Box, Orbit, Pin, PinOff, Rotate3d, X } from "lucide-react"

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
    className={`flex h-10 items-center gap-2 rounded-full border px-4 text-[13px] font-medium transition-all md:h-9 ${
      active
        ? "border-transparent bg-primary/10 text-primary"
        : "glass text-label-2 hover:text-foreground"
    } ${className}`}
  >
    {Icon && <Icon className="h-4 w-4 shrink-0" />}
    <span className="hidden whitespace-nowrap md:inline">{children}</span>
    {badge && (
      <span
        className={`ml-0.5 hidden rounded px-1.5 py-0.5 text-[9px] font-semibold md:inline ${
          active ? "bg-foreground/10 text-foreground" : "bg-fill-strong text-label-3"
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
  onMouseEnter3D,
}) => (
  <div
    role="toolbar"
    aria-label="Controles de navegación del mapa"
    className="glass flex flex-col items-center gap-0.5 rounded-[14px] p-1"
  >
    {/* Brújula interactiva */}
    <button
      type="button"
      onClick={onResetNorth}
      title="Orientar al Norte (0°)"
      aria-label="Orientar al Norte"
      className="flex h-11 w-11 md:h-9 md:w-9 items-center justify-center rounded-[10px] text-label-2 hover:bg-fill-strong hover:text-foreground transition-colors"
    >
      <div
        style={{ transform: `rotate(${-bearing}deg)` }}
        className="transition-transform duration-150"
      >
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
          <polygon points="12,2 16,12 12,9 8,12" fill="#ff3b30" />
          <polygon points="12,22 16,12 12,9 8,12" fill="#c7c7cc" />
        </svg>
      </div>
    </button>

    <div className="h-px w-5 bg-border" />

    {/* Zoom In */}
    <button
      type="button"
      onClick={onZoomIn}
      title="Acercar mapa (+)"
      aria-label="Acercar mapa"
      className="flex h-11 w-11 md:h-9 md:w-9 items-center justify-center rounded-[10px] text-label-2 hover:bg-fill-strong hover:text-foreground transition-colors text-lg font-normal"
    >
      +
    </button>

    {/* Zoom Out */}
    <button
      type="button"
      onClick={onZoomOut}
      title="Alejar mapa (−)"
      aria-label="Alejar mapa"
      className="flex h-11 w-11 md:h-9 md:w-9 items-center justify-center rounded-[10px] text-label-2 hover:bg-fill-strong hover:text-foreground transition-colors text-lg font-normal"
    >
      −
    </button>

    <div className="h-px w-5 bg-border" />

    {/* 3D / 2D Toggle */}
    <button
      type="button"
      onClick={onToggle3D}
      onMouseEnter={onMouseEnter3D}
      title={
        !is3D
          ? "Activar perspectiva 3D"
          : hud3DOpen
            ? "Volver a vista plana (2D)"
            : "Abrir controles 3D"
      }
      aria-label={is3D ? "Volver a 2D" : "Perspectiva 3D"}
      aria-pressed={is3D}
      className={`flex h-11 w-11 md:h-9 md:w-9 items-center justify-center rounded-[10px] text-[12px] font-semibold transition-all ${
        is3D || hud3DOpen
          ? "bg-primary text-primary-foreground shadow-sm"
          : "text-label-3 hover:bg-fill-strong hover:text-foreground"
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
      className="w-20 shrink-0 text-[11px] leading-tight text-label-3"
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
      className="min-w-0 flex-1 h-1.5 cursor-pointer appearance-none rounded-lg bg-fill-strong accent-primary"
    />
    <span className="w-11 shrink-0 text-right text-[11px] tabular-nums text-label-2">
      {display}
    </span>
  </div>
)

/**
 * Un aviso sobre el mapa.
 */
export const MapNotice = ({ tone = "info", icon: Icon, children, onClose }) => {
  const tonos = {
    info: "glass text-foreground",
    warning: "border-warning/30 glass text-warning",
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
          className="rounded p-1 opacity-60 transition-opacity hover:bg-foreground/5 hover:opacity-100"
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
    <div className="pointer-events-auto absolute top-20 left-1/2 z-20 flex -translate-x-1/2 items-center gap-2.5 rounded-xl border glass py-2 pl-3 pr-2 text-[12.5px] text-foreground">
      <Rotate3d className="h-4 w-4 shrink-0 text-label-3" />
      <span>
        Mantén{" "}
        <kbd className="rounded border border-input bg-fill-strong px-1.5 py-0.5 font-sans text-[11px] font-semibold text-foreground">
          Ctrl
        </kbd>{" "}
        y arrastra para girar e inclinar la escena
      </span>
      <button
        type="button"
        onClick={onClose}
        aria-label="Cerrar el aviso"
        className="rounded p-1 text-label-3 transition-colors hover:bg-fill-strong hover:text-foreground"
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
        className="relative h-36 w-36 cursor-grab active:cursor-grabbing rounded-full border border-border bg-gradient-to-b from-card to-card shadow-lg flex items-center justify-center overflow-hidden touch-none"
        title="Arrastra para rotar el rumbo e inclinar la vista 3D"
      >
        {/* Anillos de latitud y longitud estilo giroscopio */}
        <div
          className="absolute inset-2 rounded-full border border-dashed border-input pointer-events-none transition-transform duration-75"
          style={{
            transform: `perspective(300px) rotateX(${pitch}deg) rotateZ(${-bearing}deg)`,
          }}
        />
        <div
          className="absolute inset-5 rounded-full border border-label-5 pointer-events-none transition-transform duration-75"
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
            <span className="text-[10px] font-bold text-danger tabular-nums tracking-wider">N</span>
            <div className="h-4 w-1 bg-danger rounded-full shadow-sm" />
          </div>
          {/* Marcador Sur */}
          <div className="absolute bottom-0 flex flex-col items-center">
            <div className="h-4 w-1 bg-label-4 rounded-full" />
            <span className="text-[10px] font-bold text-label-3 tabular-nums">S</span>
          </div>
          {/* Marcador Este */}
          <div className="absolute right-0 flex items-center">
            <div className="w-4 h-1 bg-label-4 rounded-full" />
            <span className="text-[10px] font-bold text-label-3 tabular-nums ml-0.5">E</span>
          </div>
          {/* Marcador Oeste */}
          <div className="absolute left-0 flex items-center">
            <span className="text-[10px] font-bold text-label-3 tabular-nums mr-0.5">O</span>
            <div className="w-4 h-1 bg-label-4 rounded-full" />
          </div>
          {/* Centro */}
          <div className="h-3 w-3 rounded-full bg-white shadow-md ring-2 ring-border" />
        </div>

        {/* Pista de interacción */}
        <span className="absolute bottom-2 text-[8.5px] tabular-nums text-label-4 pointer-events-none uppercase tracking-widest opacity-80">
          Arrastrar
        </span>
      </div>

      {/* Botones de perspectiva rápida */}
      <div className="mt-2.5 grid grid-cols-4 gap-1 w-full">
        <button
          type="button"
          onClick={onResetNorth}
          className="rounded-lg border border-border bg-fill py-1 text-center text-[10.5px] font-medium text-foreground hover:bg-fill-strong hover:text-foreground transition-colors"
        >
          Norte
        </button>
        <button
          type="button"
          onClick={() => onChangeBearing?.(90)}
          className="rounded-lg border border-border bg-fill py-1 text-center text-[10.5px] font-medium text-foreground hover:bg-fill-strong hover:text-foreground transition-colors"
        >
          Este
        </button>
        <button
          type="button"
          onClick={() => onChangeBearing?.(180)}
          className="rounded-lg border border-border bg-fill py-1 text-center text-[10.5px] font-medium text-foreground hover:bg-fill-strong hover:text-foreground transition-colors"
        >
          Sur
        </button>
        <button
          type="button"
          onClick={() => onChangeBearing?.(270)}
          className="rounded-lg border border-border bg-fill py-1 text-center text-[10.5px] font-medium text-foreground hover:bg-fill-strong hover:text-foreground transition-colors"
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
  isPinned: controlledPinned,
  onTogglePin,
  onToggleSpin,
  onChangePitch,
  onChangeExaggeration,
  onChangeBearing,
  onRotateBy,
  onResetNorth,
  onClose,
  onMouseEnter,
  onMouseLeave,
}) => {
  const [localPinned, setLocalPinned] = useState(false)
  const isPinned = controlledPinned !== undefined ? controlledPinned : localPinned
  const handleTogglePin = onTogglePin || (() => setLocalPinned((p) => !p))

  const [modeView, setModeView] = useState("sliders")
  const leaveTimerRef = useRef(null)

  const handleMouseEnter = (e) => {
    if (leaveTimerRef.current) {
      clearTimeout(leaveTimerRef.current)
      leaveTimerRef.current = null
    }
    onMouseEnter?.(e)
  }

  const handleMouseLeave = (e) => {
    onMouseLeave?.(e)
    if (controlledPinned === undefined && !isPinned && onClose) {
      leaveTimerRef.current = setTimeout(() => {
        onClose()
      }, 700)
    }
  }

  useEffect(() => {
    return () => {
      if (leaveTimerRef.current) {
        clearTimeout(leaveTimerRef.current)
      }
    }
  }, [])

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
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
      className="pointer-events-auto w-[min(305px,calc(100vw-4.5rem))] rounded-2xl border glass-strong p-3.5 text-foreground transition-all select-none"
    >
      {/* Cabecera */}
      <div className="mb-3 flex items-center justify-between border-b border-border pb-2">
        <div className="flex items-center gap-2 text-xs font-semibold text-foreground">
          <Box className="h-4 w-4 text-foreground" />
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
                ? "bg-primary text-primary-foreground font-semibold shadow-sm"
                : "border border-border bg-fill text-label-2 hover:bg-fill-strong hover:text-foreground"
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
                ? "border border-transparent bg-primary/10 text-primary"
                : "border border-border bg-fill text-label-2 hover:bg-fill-strong hover:text-foreground"
            }`}
          >
            <Orbit className="h-3 w-3" />
            <span>Vista</span>
          </button>

          {/* Botón Fijar (Pin) - Solo ícono */}
          <button
            type="button"
            onClick={handleTogglePin}
            title={isPinned ? "Panel fijado (no se oculta automáticamente)" : "Fijar panel 3D"}
            aria-pressed={isPinned}
            aria-label={isPinned ? "Desfijar panel 3D" : "Fijar panel 3D"}
            className={`flex h-6 w-6 items-center justify-center rounded-lg border transition-all ${
              isPinned
                ? "border-transparent bg-primary/10 text-primary"
                : "border-border bg-fill text-label-3 hover:bg-fill-strong hover:text-foreground"
            }`}
          >
            {isPinned ? <Pin className="h-3.5 w-3.5 fill-current" /> : <PinOff className="h-3.5 w-3.5" />}
          </button>
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
          <div className="mt-2 border-t border-border pt-2.5">
            <div className="mb-2 flex items-center justify-between text-[11px] tabular-nums">
              <span className="text-label-3">
                Inclinación: <span className="text-foreground font-semibold">{normPitch}°</span>
              </span>
              <span className="text-label-3">
                Rumbo: <span className="text-foreground font-semibold">{normBearing}° {compassHeading(normBearing)}</span>
              </span>
            </div>
            <div className="flex items-center justify-between text-[11px] mb-1">
              <span className="font-medium text-label-2">Exageración vertical</span>
              <span className="tabular-nums text-[10px] font-semibold text-foreground">
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
              className="h-1.5 w-full cursor-pointer appearance-none rounded-lg bg-fill-strong accent-primary"
              aria-label="Ajustar exageración vertical de relieve"
            />
          </div>
        </>
      ) : (
        <>
          {/* 1. Inclinación de Cámara (Tilt) continua */}
          <div className="mb-3">
            <div className="mb-1 flex items-center justify-between text-[11px]">
              <span className="font-medium text-label-2">Inclinación de cámara</span>
              <span className="tabular-nums text-[10px] font-semibold text-foreground">
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
              className="h-1.5 w-full cursor-pointer appearance-none rounded-lg bg-fill-strong accent-primary"
              aria-label="Ajustar inclinación de cámara"
            />
            <div className="mt-1 flex justify-between text-[9px] tabular-nums text-label-4">
              <span>0°</span>
              <span>30°</span>
              <span>45°</span>
              <span>65° Máx</span>
            </div>
          </div>

          {/* 2. Exageración Vertical continua (hasta 5x) */}
          <div className="mb-3">
            <div className="mb-1 flex items-center justify-between text-[11px]">
              <span className="font-medium text-label-2">Exageración vertical</span>
              <span className="tabular-nums text-[10px] font-semibold text-foreground">
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
              className="h-1.5 w-full cursor-pointer appearance-none rounded-lg bg-fill-strong accent-primary"
              aria-label="Ajustar exageración vertical de relieve"
            />
            <div className="mt-1 flex justify-between text-[9px] tabular-nums text-label-4">
              <span>0.5×</span>
              <span>1.5×</span>
              <span>3×</span>
              <span>5× Máx</span>
            </div>
          </div>

          {/* 3. Rotación Orbital continua */}
          <div>
            <div className="mb-1 flex items-center justify-between text-[11px]">
              <span className="font-medium text-label-2">Orientación</span>
              <span className="tabular-nums text-[10px] text-label-2">
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
              className="h-1.5 w-full cursor-pointer appearance-none rounded-lg bg-fill-strong accent-primary"
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
                className="rounded-lg border border-border bg-fill/70 py-1 text-center text-[10.5px] font-medium text-label-2 transition-colors hover:bg-fill-strong hover:text-foreground"
              >
                ↺ -45°
              </button>
              <button
                type="button"
                onClick={onResetNorth}
                title="Orientar al Norte (0°)"
                className="rounded-lg bg-fill-strong py-1 text-center text-[10.5px] font-medium text-foreground transition-colors hover:bg-label-5/40"
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
                className="rounded-lg border border-border bg-fill/70 py-1 text-center text-[10.5px] font-medium text-label-2 transition-colors hover:bg-fill-strong hover:text-foreground"
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
