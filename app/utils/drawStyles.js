import { LAYER_PALETTE } from "./colors"

/**
 * El color con que se empieza a dibujar. Vivió un tiempo en `drawOptions.js`,
 * que era el módulo de opciones de dibujo de Leaflet; se mudó aquí para que el
 * visor MapLibre no tuviera que arrastrar Leaflet entero solo para leer un
 * color, y aquí se quedó cuando aquel módulo se borró con el visor viejo.
 */
export const DEFAULT_DRAWING_COLOR = "#f357a1"

/**
 * Los colores que ofrece la paleta del dibujo.
 *
 * Es la paleta de las capas con dos colores delante. Los dos primeros son de
 * aquí y no de allí por un motivo concreto: lo que se dibuja tiene que verse
 * **encima** de las capas, y la paleta de capas es deliberadamente apagada
 * —tierras, verdes, azules grisáceos— para que los títulos no compitan con el
 * mapa. Un polígono propio pintado con uno de esos colores se confunde con un
 * título de la ANM, que es justo lo contrario de para qué se dibuja.
 *
 * Detrás va la paleta compartida entera, y eso también es a propósito: permite
 * pintar un área propia exactamente del mismo color que una capa, que es lo que
 * hace falta cuando se quiere comparar una contra otra.
 *
 * Catorce, que son dos filas de siete justas. Antes eran ocho colores escritos a
 * mano en el componente del mapa, distintos de los del panel: dos juegos de
 * color en la misma pantalla para lo mismo.
 */
export const DRAW_PALETTE = [DEFAULT_DRAWING_COLOR, "#111827", ...LAYER_PALETTE]

/**
 * Cómo se pintan las figuras que dibuja el usuario, en MapLibre.
 *
 * En Leaflet cada figura llevaba su propio color pegado encima al crearla
 * (`shapeOptions`), y por eso cambiar el color obligaba a reconstruir el control
 * de dibujo entero. Aquí es al revés: el color se guarda como un dato de la
 * figura y el estilo lo lee. Cambiar de color no toca el control ni las figuras
 * ya dibujadas, que conservan el suyo.
 *
 * `user_color` con el prefijo no es una errata: mapbox-gl-draw guarda las
 * propiedades de cada figura anteponiéndoles `user_` para no chocar con las
 * suyas internas (`active`, `meta`, `mode`). Así que una propiedad puesta como
 * `color` se lee como `user_color`.
 */
const COLOR = ["coalesce", ["get", "user_color"], DEFAULT_DRAWING_COLOR]

// Las figuras a medio dibujar y las seleccionadas van punteadas: es la señal de
// "esto todavía se está editando".
const ACTIVE_DASH = [0.2, 2]

export const createDrawStyles = () => [
  {
    id: "gl-draw-polygon-fill",
    type: "fill",
    filter: ["all", ["==", "$type", "Polygon"], ["!=", "meta", "vertex"]],
    paint: {
      "fill-color": COLOR,
      // Translúcido a propósito: debajo van los títulos de la ANM y el usuario
      // dibuja justamente para compararlos con algo.
      "fill-opacity": 0.25,
    },
  },
  {
    id: "gl-draw-polygon-stroke-inactive",
    type: "line",
    filter: ["all", ["==", "$type", "Polygon"], ["!=", "active", "true"]],
    layout: { "line-cap": "round", "line-join": "round" },
    paint: { "line-color": COLOR, "line-width": 2 },
  },
  {
    id: "gl-draw-polygon-stroke-active",
    type: "line",
    filter: ["all", ["==", "$type", "Polygon"], ["==", "active", "true"]],
    layout: { "line-cap": "round", "line-join": "round" },
    paint: { "line-color": COLOR, "line-width": 2, "line-dasharray": ACTIVE_DASH },
  },
  {
    id: "gl-draw-line-inactive",
    type: "line",
    filter: ["all", ["==", "$type", "LineString"], ["!=", "active", "true"]],
    layout: { "line-cap": "round", "line-join": "round" },
    paint: { "line-color": COLOR, "line-width": 4 },
  },
  {
    id: "gl-draw-line-active",
    type: "line",
    filter: ["all", ["==", "$type", "LineString"], ["==", "active", "true"]],
    layout: { "line-cap": "round", "line-join": "round" },
    paint: { "line-color": COLOR, "line-width": 4, "line-dasharray": ACTIVE_DASH },
  },
  // Los puntos que dibuja el usuario, con halo blanco para que se vean sobre
  // satélite igual que sobre el mapa claro.
  {
    id: "gl-draw-point-halo",
    type: "circle",
    filter: ["all", ["==", "$type", "Point"], ["==", "meta", "feature"]],
    paint: { "circle-radius": 8, "circle-color": "#ffffff" },
  },
  {
    id: "gl-draw-point",
    type: "circle",
    filter: ["all", ["==", "$type", "Point"], ["==", "meta", "feature"]],
    paint: { "circle-radius": 6, "circle-color": COLOR },
  },
  // Los tiradores de los vértices, para mover esquinas.
  {
    id: "gl-draw-vertex-halo",
    type: "circle",
    filter: ["all", ["==", "meta", "vertex"], ["==", "$type", "Point"]],
    paint: { "circle-radius": 7, "circle-color": "#ffffff" },
  },
  {
    id: "gl-draw-vertex",
    type: "circle",
    filter: ["all", ["==", "meta", "vertex"], ["==", "$type", "Point"]],
    paint: { "circle-radius": 5, "circle-color": COLOR },
  },
  // Los puntos intermedios: se arrastran para añadir un vértice nuevo. Más
  // pequeños, para no confundirlos con los vértices de verdad.
  {
    id: "gl-draw-midpoint",
    type: "circle",
    filter: ["==", "meta", "midpoint"],
    paint: { "circle-radius": 3, "circle-color": COLOR },
  },
]
