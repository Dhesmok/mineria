import Component from '../components'

// Ruta de comparación durante la migración: el mismo panel lateral, pero con el
// mapa dibujado por MapLibre en vez de Leaflet. Se abre en /gl. Desaparece en la
// Fase 7, cuando MapLibre pase a ser el único motor y esto sea simplemente /.
export default function GlPage() {
  return <Component engine="maplibre" />
}
