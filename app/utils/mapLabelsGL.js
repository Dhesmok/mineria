import { getFeatureLabel, getLabelCoordinates } from "./mapUtils"

/**
 * Etiquetas de los polígonos para el visor MapLibre.
 *
 * **Por qué no se usan `symbol` layers**, que es lo que pedía el plan y sería lo
 * idiomático en MapLibre: para dibujar texto, MapLibre no usa las fuentes del
 * sistema, sino unos archivos de glifos precocinados (`.pbf`) que hay que
 * servir desde algún sitio. Las opciones eran depender de un servidor público
 * ajeno o montar un proceso de generación de fuentes, y ninguna de las dos
 * merece frenar esta fase. Con marcadores HTML el resultado es idéntico al que
 * daba el visor Leaflet, se reutiliza el CSS `.map-label` (definido en
 * `MapComponentGL`), y no se depende de nadie.
 *
 * Lo que se pierde frente a `symbol`: MapLibre esconde solo las etiquetas que se
 * pisan entre sí, y esto no. Pero el visor Leaflet tampoco lo hacía, así que no
 * es un retroceso. Queda anotado en el plan como mejora, con lo que costaría.
 *
 * La posición de la etiqueta y su texto salen de `mapUtils`, que ya tiene tests
 * y no sabe nada de mapas: es la parte difícil (encontrar un punto interior de
 * un polígono con huecos) y no había por qué reescribirla.
 */

/**
 * Elemento HTML de una etiqueta, listo para colgarlo de un marcador.
 *
 * Se usa `textContent` y no `innerHTML`: los atributos vienen de la ANM sin
 * sanear, y aquí el navegador los trata como texto pase lo que pase.
 *
 * @returns {{element: HTMLElement, coordinates: number[]}|null} null si la
 *   geometría no permite ubicar la etiqueta
 */
export const createLabelElement = (feature) => {
  const coordinates = getLabelCoordinates(feature)
  if (!coordinates) return null

  const element = document.createElement("div")
  element.className = "map-label"

  const inner = document.createElement("div")
  inner.textContent = getFeatureLabel(feature?.properties)
  element.appendChild(inner)

  return { element, coordinates }
}
