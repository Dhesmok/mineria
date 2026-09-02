"use client"

import { Component } from "react"
import { AlertTriangle, RefreshCw } from "lucide-react"

/**
 * La red que evita la pantalla en blanco.
 *
 * En React, una excepción mientras se pinta no rompe solo el trozo que falló:
 * desmonta el árbol entero. Un descuido en una esquina del panel se lleva por
 * delante el mapa, los datos y todo lo demás, y quien abre el visor ve una
 * página en blanco, sin diferencia alguna con que el sitio estuviera caído.
 *
 * Pasó de verdad: una variable que se usaba sin haberla declarado dejó el visor
 * en blanco, y ni la compilación ni las pruebas lo vieron. Desde entonces hay
 * dos defensas: ESLint atrapa esa clase de error antes de publicar, y esto
 * atrapa lo que se le escape.
 *
 * Tiene que ser una clase. Es la única cosa en React que los *hooks* todavía no
 * saben hacer: `componentDidCatch` no existe en forma de función.
 */
export class ErrorBoundary extends Component {
  constructor(props) {
    super(props)
    this.state = { error: null, componentStack: null }
  }

  static getDerivedStateFromError(error) {
    return { error }
  }

  componentDidCatch(error, info) {
    // A la consola, con la pila de componentes: es lo que hace falta para
    // encontrar el sitio, y sin esto el mensaje amable de abajo escondería la
    // única pista útil.
    console.error("El visor falló al pintarse:", error, info?.componentStack)
    // **Y también a la pantalla.** La consola no existe en un teléfono: quien
    // se encuentra el fallo en campo copia lo que ve, y lo que veía era la pila
    // de JavaScript ya minimizada —`at ik`, `at nf`— que no señala a ningún
    // componente. La pila de componentes sí los nombra, y es la diferencia
    // entre poder arreglar el fallo con un reporte y tener que adivinarlo.
    this.setState({ componentStack: info?.componentStack ?? null })
  }

  render() {
    if (!this.state.error) return this.props.children

    return (
      <div className="flex h-screen w-full items-center justify-center bg-slate-50 p-6">
        <div className="w-full max-w-md rounded-xl border border-slate-200 bg-white p-6 shadow-lg">
          <div className="flex items-center gap-2.5">
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-amber-100">
              <AlertTriangle className="h-4 w-4 text-amber-700" />
            </span>
            <h1 className="text-[15px] font-semibold text-slate-900">El visor no pudo abrirse</h1>
          </div>

          <p className="mt-3 text-[13px] leading-relaxed text-slate-600">
            Algo falló mientras se dibujaba la página. No se perdió ningún dato:
            todo lo que enseña el visor se vuelve a pedir a los servicios cada
            vez que se abre.
          </p>

          {/* El detalle técnico va plegado. Quien pueda usarlo lo despliega;
              a los demás no les dice nada y solo asusta. */}
          <details className="mt-3">
            <summary className="cursor-pointer text-[11px] text-slate-500 hover:text-slate-700">
              Detalle técnico
            </summary>
            <pre className="mt-1.5 max-h-40 select-all overflow-auto rounded-md bg-slate-50 p-2 font-mono text-[10px] leading-tight text-slate-600">
              {[
                String(this.state.error?.stack || this.state.error),
                // La pila de componentes va **después** de la de JavaScript y
                // separada: son dos cosas distintas —dónde reventó el motor y
                // qué parte del visor lo pedía— y pegadas se leen como una sola.
                this.state.componentStack && `\nComponentes:${this.state.componentStack}`,
              ]
                .filter(Boolean)
                .join("\n")}
            </pre>
          </details>

          <button
            type="button"
            onClick={() => window.location.reload()}
            className="mt-4 flex h-9 w-full items-center justify-center gap-2 rounded-md bg-slate-900 text-[13px] font-medium text-white transition-colors hover:bg-slate-700"
          >
            <RefreshCw className="h-4 w-4" />
            Recargar el visor
          </button>
        </div>
      </div>
    )
  }
}
