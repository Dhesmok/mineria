"use client"

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react"
import { GripHorizontal, X } from "lucide-react"

/**
 * Un panel que se puede mover y guardar.
 *
 * El de ajustes del 3D se abre solo al entrar en 3D y estorba en cuanto uno
 * quiere mirar el terreno que hay debajo. En vez de obligar a salir del 3D para
 * quitarlo de en medio, se arrastra por su barra, y su equis lo reduce a un
 * botón pequeño que también se arrastra y que vuelve a abrirlo. El de dibujo usa
 * el mismo envoltorio, pero su equis lo cierra del todo (ver `collapsible`).
 *
 * **Se ancla por su esquina superior derecha, no por la inferior.** Esto no es
 * un detalle de implementación: es lo que decide hacia dónde crece. Anclado por
 * abajo —como estaba— cualquier cambio de alto movía el borde de arriba, y eso
 * daba los dos defectos que se veían:
 *
 * - Al desplegar la paleta de colores el panel entero **saltaba hacia arriba**,
 *   en vez de que los colores aparecieran debajo.
 * - Al pulsar la equis, el botón guardado —mucho más bajo que el panel—
 *   aparecía **más abajo** que la equis que se acababa de pulsar, y por un
 *   instante se perdía de vista.
 *
 * Anclado por arriba, el borde superior no se mueve: el contenido crece hacia
 * abajo y el botón guardado sale justo donde estaba la equis.
 *
 * La posición de partida la marca un hueco invisible que sí vive en el flujo del
 * documento, así el panel nace donde lo pone la maquetación —al costado de la
 * columna de botones— sin que este componente tenga que saber nada de ella.
 *
 * Va con eventos de puntero, no con la API de arrastre de HTML: aquella no
 * existe en pantallas táctiles y el visor se usa en campo desde el celular.
 */

/** Cuánto respira el panel contra el borde de la pantalla. */
const MARGEN = 8

export const FloatingPanel = ({
  title,
  icon: Icon,
  children,
  onRequestClose,
  /**
   * Qué hace la equis. Con `true` —lo de siempre— reduce el panel a un botón
   * pequeño que lo devuelve al pulsarlo, que es lo que quiere el de 3D: se abre
   * solo al entrar en 3D y no hay otra forma de recuperarlo. Con `false` lo
   * cierra del todo, para los paneles que ya tienen su propio botón en la
   * columna y no necesitan dejar un segundo rastro en pantalla.
   */
  collapsible = true,
  /** Botón extra a la izquierda de la equis, para lo que necesite cada panel. */
  headerAction = null,
}) => {
  const [collapsed, setCollapsed] = useState(false)
  /** Dónde está, en píxeles de ventana. `null` hasta que se mide el hueco. */
  const [pos, setPos] = useState(null)
  const dragRef = useRef(null)
  const nodoRef = useRef(null)
  const huecoRef = useRef(null)
  // Si el puntero se movió de verdad, lo que viene después es el final de un
  // arrastre y no un clic.
  const movedRef = useRef(false)

  /**
   * La posición de partida: donde marca el hueco del flujo.
   *
   * El hueco está alineado abajo con la columna de botones, así que el panel
   * nace con su borde inferior ahí. A partir de ese momento manda el borde
   * superior, que es lo que lo hace crecer hacia abajo.
   */
  useLayoutEffect(() => {
    if (pos) return
    const hueco = huecoRef.current?.getBoundingClientRect()
    const caja = nodoRef.current?.getBoundingClientRect()
    if (!hueco || !caja) return
    setPos({
      top: hueco.bottom - caja.height,
      right: Math.max(MARGEN, window.innerWidth - hueco.right),
    })
  }, [pos])

  /**
   * Devolver el panel a la pantalla si se salió.
   *
   * Se mide, no se calcula: el panel cambia de alto al desplegarse la paleta o
   * al guardarse en un botón, y cualquier número escrito a mano se queda viejo.
   * El borde superior se corrige el último, a propósito: si el panel no cabe
   * entero, lo que tiene que quedar dentro es su barra, que es por donde se
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
    setPos((actual) =>
      actual ? { top: actual.top + mover.y, right: actual.right - mover.x } : actual,
    )
  }, [])

  useLayoutEffect(devolverAPantalla, [devolverAPantalla, pos, collapsed])

  useEffect(() => {
    window.addEventListener("resize", devolverAPantalla)
    return () => window.removeEventListener("resize", devolverAPantalla)
  }, [devolverAPantalla])

  const startDrag = (event) => {
    // Un pointerdown que nace en un botón de dentro de la barra —la equis— no es
    // un arrastre. En el estado guardado la propia asa *es* el botón, y ahí sí.
    const boton = event.target.closest?.("button")
    if (boton && boton !== event.currentTarget) return

    // **Aquí no puede ir `preventDefault()`.** Cancelarlo en `pointerdown`
    // cancela también los eventos de ratón que vienen detrás, incluido el clic:
    // con él puesto, ni la equis guardaba el panel ni el botón guardado volvía a
    // abrirlo. El arrastre funcionaba, el clic no, y en el código las dos cosas
    // parecían bien. Se vio pulsando la equis en un navegador de verdad.
    event.currentTarget.setPointerCapture?.(event.pointerId)
    movedRef.current = false
    dragRef.current = { startX: event.clientX, startY: event.clientY, base: pos }
  }

  const moveDrag = (event) => {
    const drag = dragRef.current
    if (!drag?.base) return
    const dx = event.clientX - drag.startX
    const dy = event.clientY - drag.startY
    // Cuatro píxeles de margen: el temblor de la mano al pulsar no puede contar
    // como arrastre, o el botón guardado dejaría de abrirse.
    if (Math.abs(dx) > 4 || Math.abs(dy) > 4) movedRef.current = true

    // `right` se mide desde el borde derecho: arrastrar a la derecha lo reduce.
    setPos({ top: drag.base.top + dy, right: drag.base.right - dx })
  }

  const endDrag = () => {
    dragRef.current = null
  }

  const asa = {
    onPointerDown: startDrag,
    onPointerMove: moveDrag,
    onPointerUp: endDrag,
    onPointerCancel: endDrag,
    // `select-none` hace lo que antes hacía `preventDefault()`: sin él,
    // arrastrar la barra selecciona su texto y el panel se ve subrayado en azul.
    className: "cursor-grab touch-none select-none active:cursor-grabbing",
  }

  // En el primer pintado todavía no hay medida. Se dibuja invisible en el sitio
  // del hueco y se coloca en el mismo fotograma, así nadie ve el salto.
  const estilo = pos
    ? { position: "fixed", top: pos.top, right: pos.right }
    : { position: "fixed", visibility: "hidden" }

  const contenedor = (
    <>
      {/* El hueco. Mide cero y no se ve; solo marca dónde nace el panel. */}
      <span ref={huecoRef} aria-hidden className="block h-0 w-0" />

      {collapsed ? (
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
          style={estilo}
          // Oscuro, y no blanco como los demás botones del mapa. Guardado es un
          // botón suelto sobre el mapa, sin la columna al lado que le dé
          // contexto, y en blanco sobre el fondo claro de CARTO se perdía: había
          // que buscarlo. Además el 3D está encendido mientras existe, así que
          // el oscuro dice lo mismo que en el resto del visor.
          className={`${asa.className} z-30 flex h-9 items-center gap-2 rounded-lg border border-slate-700 bg-slate-900 px-3 text-[13px] font-medium text-white shadow-lg transition-colors hover:bg-slate-700`}
        >
          {Icon && <Icon className="h-4 w-4" />}
          {title}
        </button>
      ) : (
        <div
          ref={nodoRef}
          // Con nombre propio, como las demás superficies flotantes del visor. No
          // lleva `aria-modal`: no bloquea el mapa, se trabaja con él a la vez
          // —que es justamente para lo que se puede arrastrar—.
          role="dialog"
          aria-label={title}
          style={estilo}
          className="z-30 flex max-h-[calc(100vh-1rem)] w-[min(16rem,calc(100vw-1.5rem))] flex-col overflow-hidden rounded-lg border border-slate-200 bg-white shadow-lg"
        >
          <div
            {...asa}
            className={`${asa.className} flex shrink-0 items-center gap-1.5 border-b border-slate-100 bg-slate-50 px-2 py-1.5`}
          >
            <GripHorizontal className="h-3.5 w-3.5 shrink-0 text-slate-400" />
            <span className="flex-1 select-none text-[11px] font-medium text-slate-600">
              {title}
            </span>
            {headerAction}
            <button
              type="button"
              onClick={() => {
                if (collapsible) setCollapsed(true)
                onRequestClose?.()
              }}
              aria-label={collapsible ? `Guardar ${title}` : `Cerrar ${title}`}
              title={collapsible ? "Guardar en un botón" : "Cerrar"}
              className="rounded p-0.5 text-slate-400 transition-colors hover:bg-slate-200 hover:text-slate-700"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
          {/* Si el contenido no cabe en la pantalla se desplaza por dentro, en
              vez de empujar el panel hacia arriba. Es lo que permite que la
              paleta de colores se despliegue hacia abajo aunque el panel viva
              pegado al borde inferior. */}
          <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-3 py-2">
            {children}
          </div>
        </div>
      )}
    </>
  )

  return contenedor
}
