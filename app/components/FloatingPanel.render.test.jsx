import React from "react"
import { render } from "@testing-library/react"
import { FloatingPanel } from "./FloatingPanel"

/**
 * La corrección de pantalla del panel **no puede colgar la aplicación**, pase lo
 * que pase.
 *
 * El visor no abría en el teléfono con «Maximum update depth exceeded», y la
 * traza minimizada señalaba sin margen de duda al `setPos` de esa corrección:
 * se pedía mover el panel, no surtía efecto, y se volvía a pedir para siempre.
 * No se consiguió reproducir en qué situación deja de converger, así que lo que
 * se prueba aquí no es una situación concreta sino **la propiedad**: con un
 * panel que se niega en redondo a moverse —el peor caso imaginable— el montaje
 * tiene que terminar igual.
 */

const rectOriginal = Element.prototype.getBoundingClientRect

afterEach(() => {
  Element.prototype.getBoundingClientRect = rectOriginal
})

/** Un panel que siempre se mide fuera de la pantalla, se le pida lo que se le pida. */
const nuncaSeMueve = () => {
  Element.prototype.getBoundingClientRect = function () {
    if (this.style.position !== "fixed") return rectOriginal.call(this)
    return {
      top: 5000,
      left: 5000,
      right: 5300,
      bottom: 5400,
      width: 300,
      height: 400,
    }
  }
}

/** Y uno que sí obedece, para comprobar que la corrección sigue funcionando. */
const obedece = ({ ancho, alto, inicio }) => {
  Element.prototype.getBoundingClientRect = function () {
    const s = this.style
    if (s.position !== "fixed") return rectOriginal.call(this)
    if (s.visibility === "hidden") {
      return { top: inicio.top, left: inicio.left, right: inicio.left + ancho,
               bottom: inicio.top + alto, width: ancho, height: alto }
    }
    const top = parseFloat(s.top)
    const right = window.innerWidth - parseFloat(s.right)
    return { top, left: right - ancho, right, bottom: top + alto, width: ancho, height: alto }
  }
}

const montar = () =>
  render(
    <FloatingPanel title="Prueba" collapsible={false}>
      <div>contenido</div>
    </FloatingPanel>,
  )

test("un panel que nunca obedece a la corrección no cuelga el visor", () => {
  nuncaSeMueve()
  expect(() => montar()).not.toThrow()
})

test("y uno que obedece acaba dentro de la pantalla", () => {
  // Nace fuera por abajo y por la derecha.
  obedece({ ancho: 300, alto: 400, inicio: { top: 700, left: 900 } })
  const { container } = montar()
  const panel = container.querySelector('[style*="fixed"]')
  const caja = panel.getBoundingClientRect()
  expect(caja.bottom).toBeLessThanOrEqual(window.innerHeight - 8 + 1)
  expect(caja.right).toBeLessThanOrEqual(window.innerWidth - 8 + 1)
})
