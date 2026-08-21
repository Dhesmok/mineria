"use client"

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react"
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
/** Cuánto respira el panel contra el borde de la pantalla. */
const MARGEN = 8

export const FloatingPanel = ({ title, icon: Icon, children, onRequestClose }) => {
  const [collapsed, setCollapsed] = useState(false)
  const [offset, setOffset] = useState({ x: 0, y: 0 })
  const dragRef = useRef(null)
  const nodoRef = useRef(null)
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

  /**
   * Devolver el panel a la pantalla si se salió.
   *
   * **Se mide, no se calcula.** La versión anterior recortaba la posición con
   * dos números fijos —220 y 160— que pretendían ser el tamaño del panel, y solo
   * lo hacía al cambiar el tamaño de la ventana. Eso dejaba pasar el caso que de
   * verdad rompía: arrimar el botón guardado al borde y desplegarlo. El panel
   * abierto es mucho más grande que el botón, así que crecía hacia fuera de la
   * pantalla y se llevaba consigo su barra —con el asa para moverlo y la equis
   * para cerrarlo—. A partir de ahí no había manera de recuperarlo salvo salir
   * del 3D y volver a entrar.
   *
   * Ahora se mide el rectángulo real y se corrige lo que sobresalga. Corregir el
   * borde izquierdo y el superior en último lugar es deliberado: si el panel no
   * cabe entero, lo que tiene que quedar dentro es su barra, que es por donde se
   * agarra y se cierra.
   */
  const devolverAPantalla = useCallback(() => {
    const caja = nodoRef.current?.getBoundingClientRect()
    if (!caja) return

    let mover = { x: 0, y: 0 }
    if (caja.right > window.innerWidth - MARGEN) mover.x = window.innerWidth - MARGEN - caja.right
    if (caja.bottom > window.innerHeight - MARGEN) mover.y = window.innerHeight - MARGEN - caja.bottom
    if (caja.left + mover.x < MARGEN) mover.x = MARGEN - caja.left
    if (caja.top + mover.y < MARGEN) mover.y = MARGEN - caja.top

    if (!mover.x && !mover.y) return
    // `offset` se mide hacia dentro desde el borde inferior derecho: mover el
    // panel a la derecha es restarle, no sumarle.
    setOffset((actual) => ({ x: actual.x - mover.x, y: actual.y - mover.y }))
  }, [])

  // Tras cada cambio de sitio y cada cambio de forma —abrirse o cerrarse—, antes
  // de que el navegador pinte, para que el usuario no llegue a ver el panel a
  // medio salir.
  useLayoutEffect(devolverAPantalla, [devolverAPantalla, offset, collapsed])

  useEffect(() => {
    window.addEventListener("resize", devolverAPantalla)
    return () => window.removeEventListener("resize", devolverAPantalla)
  }, [devolverAPantalla])

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
          ref={nodoRef}
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
      ref={nodoRef}
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
