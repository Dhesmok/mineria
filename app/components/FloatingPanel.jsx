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

/**
 * Por debajo de cuánto no vale la pena mover el panel.
 *
 * **Un píxel entero, y esto es lo que tumbaba el visor en el teléfono.**
 *
 * `getBoundingClientRect()` devuelve decimales, pero la pantalla de un móvil
 * tiene densidad fraccionaria —2,75 píxeles físicos por píxel CSS en muchos
 * Android— y el navegador redondea la posición usada a píxeles **físicos**. Así
 * que después de corregir, el panel no queda exactamente donde se le pidió sino
 * a una fracción de píxel: la corrección siguiente vuelve a salir distinta de
 * cero, y la siguiente, y la siguiente.
 *
 * Con `setPos` devolviendo siempre un objeto nuevo, React no se ahorraba ningún
 * render, y el `useLayoutEffect` que depende de `pos` volvía a medir y a
 * corregir. React lo cortaba con «Maximum update depth exceeded» y el visor no
 * abría: es el error que se veía en el celular y no en el escritorio, donde la
 * densidad es entera y el resto sale cero.
 *
 * Un píxel CSS es el tope de ese resto —un píxel físico nunca es mayor que uno
 * CSS mientras la densidad sea de uno o más— y es además una distancia que nadie
 * ve. Por debajo de eso, el panel ya está donde tiene que estar.
 */
const MINIMO_A_MOVER = 1

/**
 * Cuántas veces seguidas se acepta corregir antes de dejarlo estar.
 *
 * **Este es el tope que hace imposible el bucle**, y está aquí porque sé dónde
 * reventaba pero no exactamente por qué.
 *
 * El visor no abría en el teléfono, con «Maximum update depth exceeded». La
 * traza minimizada señalaba, sin margen de duda, al `setPos` de aquí abajo: la
 * corrección se pedía, no surtía efecto, y se volvía a pedir para siempre. Lo
 * que no conseguí es reproducir en qué situación deja de converger — ni con
 * pantallas más pequeñas que el panel, ni con densidades de píxel fraccionarias,
 * ni naciendo fuera de la pantalla.
 *
 * Corregir dos veces basta y sobra: la primera mete el panel por el lado que se
 * salía y la segunda ajusta el borde contrario cuando no cabe entero. Con cinco
 * hay holgura de sobra para cualquier caso legítimo, y ninguna para un bucle.
 *
 * No es un parche sobre un diagnóstico a medias: es que **una corrección de
 * pantalla no debe poder colgar la aplicación jamás**, sepamos o no por qué
 * deja de converger. Lo peor que puede pasar con este tope es que un panel
 * quede unos píxeles fuera de sitio.
 */
const MAXIMO_CORRECCIONES = 5

/**
 * Cuánto hay que mover el panel para que quepa en la pantalla.
 *
 * Se mide, no se calcula: el panel cambia de alto al desplegarse la paleta o al
 * guardarse en un botón, y cualquier número escrito a mano se queda viejo.
 *
 * El borde superior se corrige el último, a propósito: si el panel no cabe
 * entero, lo que tiene que quedar dentro es su barra, que es por donde se agarra
 * y se cierra.
 *
 * Está fuera del componente para poder probarle lo único que importa de verdad:
 * que **converja**. Ver `FloatingPanel.test.jsx`.
 */
export const correccionAPantalla = (caja, ventana, margen = MARGEN) => {
  const mover = { x: 0, y: 0 }
  if (caja.right > ventana.width - margen) mover.x = ventana.width - margen - caja.right
  if (caja.bottom > ventana.height - margen) mover.y = ventana.height - margen - caja.bottom
  if (caja.left + mover.x < margen) mover.x = margen - caja.left
  if (caja.top + mover.y < margen) mover.y = margen - caja.top

  // Lo que no llega a un píxel no se mueve. Ver `MINIMO_A_MOVER`.
  if (Math.abs(mover.x) < MINIMO_A_MOVER) mover.x = 0
  if (Math.abs(mover.y) < MINIMO_A_MOVER) mover.y = 0
  return mover
}

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
  /**
   * Cómo se llama la equis para quien no ve la pantalla.
   *
   * Por omisión se arma con el título, que funciona con «Dibujo» o «Opciones 3D».
   * Pero el título de la ficha del SGC es «En este punto», y «Cerrar En este
   * punto» no es una frase: por eso se puede dar el texto entero.
   */
  closeLabel = null,
  /**
   * Recogido: el panel se estrecha hasta lo que ocupe su contenido.
   *
   * Hace falta que lo sepa **el panel** y no solo su contenido. La primera
   * versión dejó de dibujar los textos pero mantuvo el ancho fijo de 16rem, así
   * que quedaban los iconos en una columna y medio panel vacío al lado. Se
   * comprobó midiendo el alto —que sí encogía— y dando por hecho lo demás.
   */
  compact = false,
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
  /** Cuántas veces se ha corregido seguidas sin llegar a estar quieto. */
  const correcciones = useRef(0)

  const devolverAPantalla = useCallback(() => {
    const caja = nodoRef.current?.getBoundingClientRect()
    if (!caja) return

    /**
     * Un elemento sin medidas todavía no está colocado, y no hay nada que
     * corregir.
     *
     * **Sin esta salida la corrección no converge.** Un rectángulo de ceros cae
     * siempre por encima y a la izquierda del margen, así que se pide moverlo;
     * pero como la medida sigue siendo de ceros, se vuelve a pedir en el
     * siguiente pintado, y otra vez. React lo corta con «Maximum update depth
     * exceeded» y el panel no llega a dibujarse.
     *
     * Pasa antes del primer trazado, dentro de un contenedor oculto, y en
     * cualquier entorno que no calcule maquetación. Se destapó al meter aquí la
     * ficha del SGC, que sí se prueba montada; el panel del 3D nunca lo hizo
     * saltar porque no tenía pruebas que lo montaran.
     */
    if (caja.width === 0 && caja.height === 0) return

    const mover = correccionAPantalla(caja, {
      width: window.innerWidth,
      height: window.innerHeight,
    })

    if (!mover.x && !mover.y) {
      // Quieto: se olvida lo corrido hasta ahora, para que el próximo cambio de
      // tamaño empiece con el cupo entero.
      correcciones.current = 0
      return
    }

    // Y si ya se ha corregido cinco veces sin que el panel se quede quieto, se
    // deja donde esté. Ver `MAXIMO_CORRECCIONES`.
    if (correcciones.current >= MAXIMO_CORRECCIONES) return
    correcciones.current += 1

    setPos((actual) => {
      if (!actual) return actual
      const siguiente = { top: actual.top + mover.y, right: actual.right - mover.x }
      // Y si la corrección no cambia nada, se devuelve el mismo objeto para que
      // React se ahorre el render. Sin esto, `setPos` devolvía **siempre** un
      // objeto nuevo, así que una corrección que no movía el panel volvía a
      // pedirse en cada pintado para siempre.
      return siguiente.top === actual.top && siguiente.right === actual.right ? actual : siguiente
    })
  }, [])

  useLayoutEffect(devolverAPantalla, [devolverAPantalla, pos, collapsed])

  useEffect(() => {
    // Al cambiar la ventana se devuelve el cupo de correcciones: el panel puede
    // haber quedado fuera por un motivo nuevo y legítimo.
    const alRedimensionar = () => {
      correcciones.current = 0
      devolverAPantalla()
    }
    window.addEventListener("resize", alRedimensionar)
    return () => window.removeEventListener("resize", alRedimensionar)
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
          className={`z-30 flex max-h-[calc(100vh-1rem)] flex-col overflow-hidden rounded-lg border border-slate-200 bg-white shadow-lg ${
            compact ? "w-fit" : "w-[min(16rem,calc(100vw-1.5rem))]"
          }`}
        >
          <div
            {...asa}
            className={`${asa.className} flex shrink-0 items-center gap-1.5 border-b border-slate-100 bg-slate-50 px-2 py-1.5`}
          >
            <GripHorizontal className="h-3.5 w-3.5 shrink-0 text-slate-400" />
            {!compact && (
              <span className="flex-1 select-none text-[11px] font-medium text-slate-600">
                {title}
              </span>
            )}
            {headerAction}
            <button
              type="button"
              onClick={() => {
                if (collapsible) setCollapsed(true)
                onRequestClose?.()
              }}
              aria-label={closeLabel ?? (collapsible ? `Guardar ${title}` : `Cerrar ${title}`)}
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
