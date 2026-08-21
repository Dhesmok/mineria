/**
 * Los mapas de fondo.
 *
 * **Todos se declaran en el estilo desde el arranque y se encienden o apagan por
 * visibilidad**, igual que las capas de la ANM. La alternativa —reconstruir el
 * estilo al cambiar de fondo— borraría de un plumazo las capas de títulos, lo
 * dibujado por el usuario y el resultado de la búsqueda. Una capa oculta no pide
 * teselas, así que declararlas todas no cuesta nada.
 *
 * **Sobre las etiquetas.** Cada fondo resuelve los nombres a su manera y por eso
 * no hay un único mecanismo:
 *
 * - Google y CARTO publican **dos direcciones distintas**, una con nombres y
 *   otra sin ellos. Ahí se cambia de dirección.
 * - Esri publica la imagen por un lado y los nombres por otro, para superponer.
 *   Ahí se enciende una segunda capa encima.
 * - OSM y OpenTopoMap traen los nombres pintados dentro de la propia tesela. Ahí
 *   no hay nada que quitar, y el visor tiene que decirlo en vez de ofrecer un
 *   interruptor que no hace nada.
 *
 * Módulo puro: describe fondos, no toca MapLibre.
 */

const OSM_ATTRIBUTION =
  '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'

/** Identificadores de las capas de fondo dentro del estilo. */
export const BASEMAP_LAYERS = {
  osm: "bm-osm",
  googleHybrid: "bm-google-hybrid",
  googlePlain: "bm-google-plain",
  esriImagery: "bm-esri-imagery",
  esriReference: "bm-esri-reference",
  topo: "bm-topo",
  cartoLabels: "bm-carto-labels",
  cartoPlain: "bm-carto-plain",
}

/**
 * Las fuentes de teselas, listas para el estilo de MapLibre.
 *
 * `maxzoom` dice hasta qué nivel existen teselas de verdad; más allá, MapLibre
 * estira la última en vez de dejar el mapa en gris. Es la misma razón por la que
 * OSM lleva 19: sin ese dato, volver de un zoom alto dejaba el mapa vacío.
 */
export const BASEMAP_SOURCES = {
  "bm-osm-src": {
    type: "raster",
    tiles: ["https://tile.openstreetmap.org/{z}/{x}/{y}.png"],
    tileSize: 256,
    maxzoom: 19,
    attribution: OSM_ATTRIBUTION,
  },
  // Los cuatro subdominios de Google sí se conservan: el reparto lo hace su
  // propio servicio, no el navegador.
  "bm-google-hybrid-src": {
    type: "raster",
    tiles: [0, 1, 2, 3].map((n) => `https://mt${n}.google.com/vt/lyrs=s,h&x={x}&y={y}&z={z}`),
    tileSize: 256,
    maxzoom: 21,
    attribution: "© Google",
  },
  "bm-google-plain-src": {
    type: "raster",
    tiles: [0, 1, 2, 3].map((n) => `https://mt${n}.google.com/vt/lyrs=s&x={x}&y={y}&z={z}`),
    tileSize: 256,
    maxzoom: 21,
    attribution: "© Google",
  },
  // Ojo con el orden {y}/{x} de los servicios de ArcGIS: es al revés que en
  // todos los demás, y invertirlo no da error, da un mapa que no cuadra.
  "bm-esri-imagery-src": {
    type: "raster",
    tiles: [
      "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",
    ],
    tileSize: 256,
    maxzoom: 19,
    attribution: "Esri, Maxar, Earthstar Geographics",
  },
  "bm-esri-reference-src": {
    type: "raster",
    tiles: [
      "https://server.arcgisonline.com/ArcGIS/rest/services/Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}",
    ],
    tileSize: 256,
    maxzoom: 19,
    attribution: "Esri",
  },
  "bm-topo-src": {
    type: "raster",
    tiles: ["a", "b", "c"].map((s) => `https://${s}.tile.opentopomap.org/{z}/{x}/{y}.png`),
    tileSize: 256,
    maxzoom: 17,
    attribution: `${OSM_ATTRIBUTION}, SRTM · © <a href="https://opentopomap.org">OpenTopoMap</a> (CC-BY-SA)`,
  },
  "bm-carto-labels-src": {
    type: "raster",
    tiles: ["a", "b", "c", "d"].map(
      (s) => `https://${s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}.png`,
    ),
    tileSize: 256,
    maxzoom: 20,
    attribution: `${OSM_ATTRIBUTION} © <a href="https://carto.com/attributions">CARTO</a>`,
  },
  "bm-carto-plain-src": {
    type: "raster",
    tiles: ["a", "b", "c", "d"].map(
      (s) => `https://${s}.basemaps.cartocdn.com/light_nolabels/{z}/{x}/{y}.png`,
    ),
    tileSize: 256,
    maxzoom: 20,
    attribution: `${OSM_ATTRIBUTION} © <a href="https://carto.com/attributions">CARTO</a>`,
  },
}

/**
 * Los fondos que ofrece el visor.
 *
 * `labels` dice qué se puede hacer con los nombres:
 *   "swap"    — hay dos direcciones, una con y otra sin
 *   "overlay" — los nombres son una capa aparte que se superpone
 *   "fixed"   — vienen pintados en la tesela y no se pueden quitar
 */
export const BASEMAPS = [
  {
    id: "satellite",
    name: "Satélite",
    source: "Google",
    hint: "El de mayor detalle en ciudades y cabeceras.",
    labels: "swap",
    withLabels: [BASEMAP_LAYERS.googleHybrid],
    withoutLabels: [BASEMAP_LAYERS.googlePlain],
  },
  {
    id: "esri",
    name: "Satélite Esri",
    source: "Esri · Maxar",
    hint: "Otras fechas de toma que Google: comparar las dos delata actividad reciente.",
    labels: "overlay",
    withLabels: [BASEMAP_LAYERS.esriImagery, BASEMAP_LAYERS.esriReference],
    withoutLabels: [BASEMAP_LAYERS.esriImagery],
  },
  {
    id: "topo",
    name: "Topográfico",
    source: "OpenTopoMap",
    hint: "Curvas de nivel y sombreado. Hasta zoom 17.",
    labels: "fixed",
    withLabels: [BASEMAP_LAYERS.topo],
    withoutLabels: [BASEMAP_LAYERS.topo],
  },
  {
    id: "positron",
    name: "Claro",
    source: "CARTO",
    hint: "Gris muy claro: los títulos destacan sin pelearse con el fondo.",
    labels: "swap",
    withLabels: [BASEMAP_LAYERS.cartoLabels],
    withoutLabels: [BASEMAP_LAYERS.cartoPlain],
  },
  {
    id: "osm",
    name: "Mapa",
    source: "OpenStreetMap",
    hint: "El callejero de siempre.",
    labels: "fixed",
    withLabels: [BASEMAP_LAYERS.osm],
    withoutLabels: [BASEMAP_LAYERS.osm],
  },
]

export const DEFAULT_BASEMAP = "satellite"

const BY_ID = new Map(BASEMAPS.map((basemap) => [basemap.id, basemap]))

export const basemapById = (id) => BY_ID.get(id) ?? BY_ID.get(DEFAULT_BASEMAP)

/** ¿Se le pueden quitar los nombres a este fondo? */
export const supportsLabelToggle = (id) => basemapById(id).labels !== "fixed"

/**
 * Qué capas del estilo deben verse para un fondo y un estado de etiquetas.
 * Todo lo que no salga en esta lista se apaga.
 */
export const visibleBasemapLayers = (id, showLabels) => {
  const basemap = basemapById(id)
  return showLabels ? basemap.withLabels : basemap.withoutLabels
}

/** Todas las capas de fondo declaradas, para poder apagarlas de una pasada. */
export const ALL_BASEMAP_LAYERS = Object.values(BASEMAP_LAYERS)
