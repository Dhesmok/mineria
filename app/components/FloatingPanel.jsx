"use client"

import { useEffect, useRef, useState } from "react"
import { GripHorizontal, X } from "lucide-react"

/**
 * Un panel que se puede mover y guardar.
 *
 * El de ajustes del 3D se abre solo al entrar en 3D y estorba en cuanto uno
 * quiere mirar el terreno que hay debajo. En vez de obligar a salir del 3D para
 * quitarlo de en medio, se arrastra por su barra, y su X lo reduce a un botón
 * pequeño que también se arrastra y que vuelve a abrirlo.
 *
 * **La posición se guarda entre el panel y el botón**, así que cerrarlo y
 * volverlo a abrir lo deja donde el usuario lo había dejado, no donde nació.
 *
 * Va con eventos de puntero, no con la API de arrastre de HTML: aquella no
 * existe en pantallas táctiles y el visor se usa en campo desde el celular. La
 * posición se guarda como distancia al borde inferior derecho, que es la esquina
 * donde vive la columna de controles: así, al cambiar el tamaño de la ventana, el
 * panel no se va fuera de la pantalla.
 */
export const FloatingPanel = ({ title, icon: Icon, children, onRequestClose }) => {
  const [collapsed, setCollapsed] = useState(false)
  const [offset, setOffset] = useState({ x: 0, y: 0 })
  const dragRef = useRef(null)
  // Si el puntero se movió de verdad, lo que viene después es el final de un
  // arrastre y no un clic.
  const movedRef = useRef(false)

  const startDrag = (event) => {
    // Un pointerdown que nace en un botón de dentro de la barra —la X— no es un
    // arrastre. En el estado guardado la propia asa *es* el botón, y ahí sí.
    const boton = event.target.closest?.("button")
    if (boton && boton !== event.currentTarget) return

    // **Aquí no puede ir `preventDefault()`.** Cancelarlo en `pointerdown`
    // cancela también los eventos de ratón que vienen detrás, incluido el clic:
    // con él puesto, ni la X guardaba el panel ni el botón guardado volvía a
    // abrirlo. El arrastre funcionaba, el clic no, y en el código las dos cosas
    // parecían bien. Se vio pulsando la X en un navegador de verdad.
    event.currentTarget.setPointerCapture?.(event.pointerId)
    movedRef.current = false
    dragRef.current = { startX: event.clientX, startY: event.clientY, base: offset }
  }

  const moveDrag = (event) => {
    const drag = dragRef.current
    if (!drag) return
    const dx = event.clientX - drag.startX
    const dy = event.clientY - drag.startY
    // Cuatro píxeles de margen: el temblor de la mano al pulsar no puede contar
    // como arrastre, o el botón guardado dejaría de abrirse.
    if (Math.abs(dx) > 4 || Math.abs(dy) > 4) movedRef.current = true

    // Restar y no sumar: `offset` se mide hacia dentro desde el borde inferior
    // derecho, así que arrastrar a la izquierda tiene que aumentarlo.
    setOffset({ x: drag.base.x - dx, y: drag.base.y - dy })
  }

  const endDrag = () => {
    dragRef.current = null
  }

  // Si la ventana encoge, el panel podría quedar fuera. Se recorta al volver a
  // dibujarse en vez de dejarlo inalcanzable.
  useEffect(() => {
    const alRedimensionar = () => {
      setOffset((actual) => ({
        x: Math.min(Math.max(actual.x, 0), Math.max(window.innerWidth - 220, 0)),
        y: Math.min(Math.max(actual.y, 0), Math.max(window.innerHeight - 160, 0)),
      }))
    }
    window.addEventListener("resize", alRedimensionar)
    return () => window.removeEventListener("resize", alRedimensionar)
  }, [])

  const asa = {
    onPointerDown: startDrag,
    onPointerMove: moveDrag,
    onPointerUp: endDrag,
    onPointerCancel: endDrag,
    // `select-none` hace lo que antes hacía `preventDefault()`: sin él,
    // arrastrar la barra selecciona su texto y el panel se ve subrayado en azul.
    className: "cursor-grab touch-none select-none active:cursor-grabbing",
  }

  const posicion = { transform: `translate(${-offset.x}px, ${-offset.y}px)` }

  if (collapsed) {
    return (
      <div style={posicion} className="flex justify-end">
        <button
          type="button"
          {...asa}
          onClick={() => {
            // Soltar tras arrastrar dispara un clic; abrir el panel ahí sería
            // reabrirlo cada vez que se cambia de sitio.
            if (movedRef.current) return
            setCollapsed(false)
          }}
          title={`Abrir ${title.toLowerCase()} · arrastra para moverlo`}
          aria-label={`Abrir ${title}`}
          className={`${asa.className} flex h-9 items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 text-[13px] font-medium text-slate-700 shadow-sm transition-colors hover:bg-slate-50`}
        >
          {Icon && <Icon className="h-4 w-4" />}
          {title}
        </button>
      </div>
    )
  }

  return (
    <div
      style={posicion}
      className="w-[min(16rem,calc(100vw-1.5rem))] overflow-hidden rounded-lg border border-slate-200 bg-white shadow-lg"
    >
      <div
        {...asa}
        className={`${asa.className} flex items-center gap-1.5 border-b border-slate-100 bg-slate-50 px-2 py-1.5`}
      >
        <GripHorizontal className="h-3.5 w-3.5 shrink-0 text-slate-400" />
        <span className="flex-1 select-none text-[11px] font-medium text-slate-600">{title}</span>
        <button
          type="button"
          onClick={() => {
            setCollapsed(true)
            onRequestClose?.()
          }}
          aria-label={`Guardar ${title}`}
          title="Guardar en un botón"
          className="rounded p-0.5 text-slate-400 transition-colors hover:bg-slate-200 hover:text-slate-700"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </div>
      <div className="px-3 py-2">{children}</div>
    </div>
  )
}
