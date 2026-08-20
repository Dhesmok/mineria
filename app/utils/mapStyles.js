/**
 * Estilo base del mapa en MapLibre.
 *
 * MapLibre no arma el mapa a punta de llamadas como Leaflet: recibe un objeto
 * JSON que describe de dónde salen las teselas y cómo se pintan. Ese objeto es
 * el "estilo". Vive aquí, aparte del componente, porque es un dato puro: se
 * puede revisar con un test sin abrir un navegador ni una tarjeta gráfica.
 *
 * Ojo con el orden de las coordenadas: MapLibre usa [longitud, latitud] y
 * Leaflet usa [latitud, longitud]. Es la fuente número uno de mapas que
 * aparecen en medio del océano Índico al portar código de uno a otro.
 */

import {
  ANM_LAYERS,
  anmFillLayerId,
  anmLineLayerId,
  anmSourceId,
  emptyFeatureCollection,
  LAYERS_MIN_ZOOM,
} from "./anmLayers"

/** Centro y zoom iniciales, los mismos del visor Leaflet pero en orden [lon, lat]. */
export const INITIAL_CENTER = [-72, 4]
export const INITIAL_ZOOM = 5

/**
 * Hasta dónde deja acercarse el mapa. Ninguna fuente publica teselas propias a
 * z22; de ahí para arriba MapLibre estira la última tesela real. Ver la nota de
 * `maxzoom` más abajo.
 */
export const MAX_ZOOM = 22

/**
 * Identificadores de las dos capas base. Se toca la visibilidad de estas capas
 * por nombre, así que conviene tenerlos en un solo sitio.
 */
export const BASE_LAYERS = {
  osm: "base-osm",
  satellite: "base-satellite",
}

/**
 * OSM ya no necesita repartir las peticiones entre a/b/c.tile: eso era un truco
 * para HTTP/1.1, que limitaba las descargas simultáneas por dominio. MapLibre
 * habla HTTP/2, donde el truco no aporta nada y solo multiplica las conexiones.
 *
 * `maxzoom: 19` dice "no existen teselas más allá de z19". MapLibre entonces
 * estira la tesela de z19 al acercarse más. Esto elimina de raíz el bug que
 * había en Leaflet, donde volver de satélite a OSM desde un zoom alto dejaba el
 * mapa en gris porque la capa simplemente dejaba de pedir teselas.
 */
const OSM_SOURCE = {
  type: "raster",
  tiles: ["https://tile.openstreetmap.org/{z}/{x}/{y}.png"],
  tileSize: 256,
  maxzoom: 19,
  attribution: '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
}

/**
 * Satélite de Google, heredado tal cual del visor Leaflet para que la
 * comparación lado a lado sea justa. `lyrs=s,h` es satélite con nombres y vías
 * encima. Los cuatro subdominios mt0..mt3 sí se conservan porque el reparto lo
 * hace el propio servicio de Google, no el navegador.
 */
const SATELLITE_SOURCE = {
  type: "raster",
  tiles: [
    "https://mt0.google.com/vt/lyrs=s,h&x={x}&y={y}&z={z}",
    "https://mt1.google.com/vt/lyrs=s,h&x={x}&y={y}&z={z}",
    "https://mt2.google.com/vt/lyrs=s,h&x={x}&y={y}&z={z}",
    "https://mt3.google.com/vt/lyrs=s,h&x={x}&y={y}&z={z}",
  ],
  tileSize: 256,
  maxzoom: 21,
  attribution: "© Google",
}

/**
 * Construye el estilo con las dos capas base cargadas desde el principio y una
 * de ellas oculta.
 *
 * La alternativa obvia —cambiar el estilo entero al alternar mapa/satélite— es
 * una trampa: `setStyle()` reemplaza el estilo completo, y con él se van todas
 * las capas de la ANM, lo dibujado por el usuario y el resultado de la
 * búsqueda. Teniendo las dos capas base declaradas desde el arranque, alternar
 * es solo prender una y apagar la otra, y nada más del mapa se entera.
 *
 * El costo es que el navegador conoce las dos fuentes desde el inicio; como la
 * capa oculta no se pinta, tampoco pide teselas. Es decir: no cuesta nada.
 *
 * @param {"osm"|"satellite"} initialBaseLayer capa visible al arrancar
 */
export const createBaseStyle = (initialBaseLayer = "osm") => ({
  version: 8,
  sources: {
    osm: OSM_SOURCE,
    satellite: SATELLITE_SOURCE,
    ...anmSources(),
  },
  layers: [
    {
      id: BASE_LAYERS.osm,
      type: "raster",
      source: "osm",
      layout: { visibility: initialBaseLayer === "osm" ? "visible" : "none" },
    },
    {
      id: BASE_LAYERS.satellite,
      type: "raster",
      source: "satellite",
      layout: { visibility: initialBaseLayer === "satellite" ? "visible" : "none" },
    },
    ...anmLayers(),
    ...searchLayers(),
  ],
})

/**
 * Identificadores del resultado de la búsqueda por expediente.
 *
 * Va en capas propias, separadas de las cuatro de la ANM, por dos razones: se
 * dibuja siempre encima (es lo que el usuario acaba de pedir), y no obedece al
 * zoom mínimo ni a los interruptores del panel. En el visor Leaflet era también
 * una capa aparte, por lo mismo.
 */
export const SEARCH_SOURCES = {
  result: "search-result",
  vertices: "search-vertices",
}

export const SEARCH_LAYERS = {
  fill: "search-fill",
  line: "search-line",
  vertices: "search-vertices-circle",
}

const searchLayers = () => [
  {
    id: SEARCH_LAYERS.fill,
    type: "fill",
    source: SEARCH_SOURCES.result,
    // El color se ajusta al de la capa donde apareció el expediente, cuando se
    // sabe cuál fue. Este es solo el valor de partida.
    paint: { "fill-color": "#894444", "fill-opacity": 0.6 },
  },
  {
    id: SEARCH_LAYERS.line,
    type: "line",
    source: SEARCH_SOURCES.result,
    // Más grueso que las capas de la ANM: es el resultado que se está buscando y
    // tiene que distinguirse de los títulos vecinos.
    paint: { "line-color": "#894444", "line-width": 3 },
  },
  {
    id: SEARCH_LAYERS.vertices,
    type: "circle",
    source: SEARCH_SOURCES.vertices,
    paint: {
      "circle-radius": 7,
      "circle-color": "#ff0000",
      "circle-opacity": 0.5,
      "circle-stroke-color": "#ffffff",
      "circle-stroke-width": 1,
    },
  },
]

/**
 * Las cuatro capas de la ANM, declaradas vacías desde el arranque.
 *
 * Mismo razonamiento que con las capas base: crear y destruir capas al vuelo
 * obliga a reconstruirlas en el orden correcto cada vez, y en MapLibre el orden
 * de la lista es el orden de apilamiento. Declarándolas de una vez, encender una
 * capa es cambiar su visibilidad y darle datos, y ninguna se cuela por debajo de
 * otra según el orden en que el usuario pulse los interruptores.
 *
 * Cada capa necesita dos entradas: `fill` pinta el relleno y `line` el contorno.
 * MapLibre no tiene un "polígono con borde" como Leaflet; son dos cosas
 * distintas, y eso es justamente lo que permite que el slider de opacidad afecte
 * solo al relleno y deje el contorno nítido, que es como se comportaba el visor
 * anterior.
 */
const anmSources = () => ({
  ...Object.fromEntries(
    ANM_LAYERS.map(({ key }) => [
      anmSourceId(key),
      { type: "geojson", data: emptyFeatureCollection() },
    ]),
  ),
  [SEARCH_SOURCES.result]: { type: "geojson", data: emptyFeatureCollection() },
  [SEARCH_SOURCES.vertices]: { type: "geojson", data: emptyFeatureCollection() },
})

const anmLayers = () =>
  ANM_LAYERS.flatMap(({ key, fillColor, lineColor }) => [
    {
      id: anmFillLayerId(key),
      type: "fill",
      source: anmSourceId(key),
      minzoom: LAYERS_MIN_ZOOM,
      layout: { visibility: "none" },
      paint: { "fill-color": fillColor, "fill-opacity": 0.6 },
    },
    {
      id: anmLineLayerId(key),
      type: "line",
      source: anmSourceId(key),
      minzoom: LAYERS_MIN_ZOOM,
      layout: { visibility: "none" },
      paint: { "line-color": lineColor, "line-width": 2 },
    },
  ])
