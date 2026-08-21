import Component from './components'
import { ErrorBoundary } from './components/ErrorBoundary'

/**
 * El visor va envuelto en un límite de errores.
 *
 * Sin él, una excepción durante el pintado desmonta el árbol entero de React y
 * deja la pantalla en blanco —ya ocurrió—. Va aquí arriba, en la página, para
 * que cubra también los fallos del propio panel y no solo los del mapa.
 */
export default function Page() {
  return (
    <ErrorBoundary>
      <Component />
    </ErrorBoundary>
  )
}
