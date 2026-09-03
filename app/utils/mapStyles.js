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
  ALL_BASEMAP_LAYERS,
  BASEMAP_LAYERS,
  BASEMAP_SOURCES,
  DEFAULT_BASEMAP,
  visibleBasemapLayers,
} from "./basemaps"
import {
  ANM_LAYERS,
  anmFillLayerId,
  anmLineLayerId,
  anmSourceId,
  emptyFeatureCollection,
  LAYERS_MIN_ZOOM,
} from "./anmLayers"
import {
  SGC_ATTRIBUTION,
  SGC_LAYERS,
  sgcLayerId,
  sgcSourceId,
} from "./sgcLayers"
import {
  ANH_ATTRIBUTION,
  ANH_LAYERS,
  anhLayerId,
  anhSourceId,
} from "./anhLayers"

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
/**
 * Se conserva el nombre `BASE_LAYERS` para no tocar a quien ya lo usaba —el
 * componente lo espera para saber si el estilo está listo—, pero ahora apunta al
 * registro de fondos.
 */
export const BASE_LAYERS = BASEMAP_LAYERS

/**
 * Las capas de fondo se describen en `utils/basemaps.js`, no aquí.
 *
 * Antes había dos escritas a mano —OSM y satélite— y alternarlas era un `if`.
 * Con cinco fondos, y con la posibilidad de quitarles los nombres, esa lista
 * pasó a ser un dato con sus propias pruebas, y este archivo se limita a
 * volcarla en el estilo.
 */

/**
 * Modelo de elevación para el terreno 3D y el sombreado del relieve.
 *
 * Son las Terrain Tiles del programa de datos abiertos de AWS: públicas, sin
 * clave ni registro. Es la razón por la que se eligieron frente a las de Mapbox
 * o Maptiler, que exigen cuenta y tienen cuota.
 *
 * `encoding: "terrarium"` no es opcional: la altura viene empaquetada en los
 * canales de color del PNG, y cada proveedor usa su propia fórmula. Con la
 * fórmula equivocada el mapa no falla —sigue habiendo píxeles que decodificar—,
 * simplemente sale un relieve inventado, con montañas donde no las hay.
 *
 * `maxzoom: 15` es hasta donde existen teselas de elevación. Más allá, MapLibre
 * reutiliza la de z15 estirándola: el terreno se ve más suave, no desaparece.
 */
export const TERRAIN_SOURCE_ID = "terrain"

/**
 * La dirección de las teselas, aparte de la fuente.
 *
 * Se exporta porque la capa de pendiente ya no le pregunta las alturas a
 * MapLibre: baja estas mismas teselas por su cuenta y las decodifica. Que las dos
 * vías salgan de la misma constante no es cosmética — con dos listas distintas,
 * el día que cambie el proveedor una de las dos se queda atrás y el visor
 * enseñaría un relieve y una pendiente de modelos diferentes.
 */
export const TERRAIN_TILE_TEMPLATE =
  "https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{z}/{x}/{y}.png"

const TERRAIN_SOURCE = {
  type: "raster-dem",
  tiles: [TERRAIN_TILE_TEMPLATE],
  encoding: "terrarium",
  tileSize: 256,
  maxzoom: 15,
  attribution:
    '<a href="https://registry.opendata.aws/terrain-tiles/">Terrain Tiles</a> (AWS Open Data)',
}

/**
 * La capa de las derivadas del terreno: pendiente u orientación.
 *
 * Se declara desde el arranque, como todo lo demás, aunque nazca vacía: no se
 * piden a ningún servicio, se calculan en el navegador a partir del modelo de
 * elevación y se entregan como una imagen sobre el rectángulo que se está
 * viendo. Ver `utils/terrainRaster.js`. Es una sola capa porque las dos no
 * pueden estar encendidas a la vez: superpuestas no se lee ninguna.
 *
 * Un píxel transparente de 1×1 como imagen de partida: una fuente de tipo
 * `image` exige una imagen y unas coordenadas al declararla, y esta es la forma
 * de decir «todavía nada» sin pedir un archivo a nadie.
 */
export const DERIVATIVE_SOURCE_ID = "terrain-derivative"
export const DERIVATIVE_LAYER_ID = "terrain-derivative-layer"

/**
 * Un píxel de 1×1 **de verdad transparente**, para decir «aquí todavía no va
 * nada» sin pedirle un archivo a nadie.
 *
 * **El que había aquí no era transparente: era azul.** Se copió de algún sitio
 * como «1x1 transparent png» y sus cuatro bytes son `0, 0, 255, 127` — azul al
 * 50 %. Una fuente de tipo `image` no se puede vaciar, solo se le puede dar otra
 * imagen, y estas nacen cubriendo el mundo entero: al desmarcar todos los
 * departamentos de una capa del SGC, el visor pintaba **el país entero de azul**.
 * Parecía un fallo del servicio y estaba en esta constante.
 *
 * Se exporta, y no se copia, porque estaba escrito dos veces —aquí y en
 * `useSgcLayersGL`— con el mismo error en las dos. Es el motivo por el que
 * arreglarlo en un solo sitio no habría bastado.
 *
 * Lleva una prueba que le decodifica el PNG y le lee el canal alfa: «parece
 * transparente» es exactamente lo que ya falló una vez.
 */
export const TRANSPARENT_PIXEL =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAAC0lEQVR4nGNgAAIAAAUAAXpeqz8AAAAASUVORK5CYII="

/** Las cuatro esquinas del mundo, en el orden que pide MapLibre: NO, NE, SE, SO. */
const MUNDO_ENTERO = [
  [-180, 85],
  [180, 85],
  [180, -85],
  [-180, -85],
]

const DERIVATIVE_SOURCE = {
  type: "image",
  url: TRANSPARENT_PIXEL,
  coordinates: MUNDO_ENTERO,
}

const derivativeLayer = () => ({
  id: DERIVATIVE_LAYER_ID,
  type: "raster",
  source: DERIVATIVE_SOURCE_ID,
  layout: { visibility: "none" },
  paint: {
    // Sin difuminado: cada celda de la rejilla es una medida, y suavizar entre
    // celdas inventaría valores intermedios que no se calcularon.
    "raster-resampling": "nearest",
    "raster-fade-duration": 0,
  },
})

/** Identificador de la capa de sombreado. */
export const HILLSHADE_LAYER_ID = "hillshade"

/**
 * Sombreado del relieve, apagado de entrada.
 *
 * Va justo encima del mapa base y por debajo de todo lo demás: es contexto del
 * terreno, no un dato que deba taparle los títulos a nadie.
 *
 * Mientras esté oculta no se descarga ni una tesela de elevación, que es lo que
 * permite declararla desde el arranque sin costo. Las teselas empiezan a caer
 * cuando el usuario enciende el relieve o el 3D.
 */
const hillshadeLayer = () => ({
  id: HILLSHADE_LAYER_ID,
  type: "hillshade",
  source: TERRAIN_SOURCE_ID,
  layout: { visibility: "none" },
  paint: {
    "hillshade-shadow-color": "#3a3a48",
    "hillshade-highlight-color": "#ffffff",
    // Suave a propósito: por encima el mapa lleva polígonos de títulos y
    // etiquetas, y un sombreado fuerte los vuelve ilegibles.
    "hillshade-exaggeration": 0.45,
  },
})

/**
 * Las capas de geología del SGC: una imagen y una capa por servicio.
 *
 * Van **por debajo de la capa de pendiente y de los títulos mineros**, y por
 * encima del mapa de fondo. Es el sitio que les corresponde por lo que son: el
 * contexto geológico sobre el que se miran los títulos, no algo que deba
 * taparlos. Quien quiera lo contrario lo consigue arrastrando en el panel.
 *
 * **Una imagen del trozo visible y no teselas**, que es lo que había. Con
 * teselas, ArcGIS rotulaba una vez por cada una: el número de cada cuadrícula de
 * la grilla de planchas salía escrito cuatro veces, porque cuatro teselas la
 * tocaban y el servicio dibuja cada imagen sin saber nada de las de al lado. Ver
 * `sgcImageUrl` en `utils/sgcLayers.js`.
 *
 * Nacen con un píxel transparente, como la capa de pendiente: una fuente de tipo
 * `image` exige imagen y coordenadas al declararla, y así se dice «todavía nada»
 * sin pedirle un archivo a nadie. Quien las llena es `useSgcLayersGL`.
 *
 * **La atribución no cabe aquí, y eso costó un rato.** MapLibre solo acepta
 * `attribution` en las fuentes de tipo tesela; ponérselo a una de imagen invalida
 * el estilo **entero** —no solo esa fuente— y el mapa se queda sin capas. No se
 * vio en ninguna prueba de datos: hizo falta abrir el navegador y leer la
 * consola. Por eso la atribución del SGC va por su cuenta, más abajo.
 */
const sgcSources = () =>
  Object.fromEntries(
    SGC_LAYERS.map((capa) => [
      sgcSourceId(capa.key),
      { type: "image", url: TRANSPARENT_PIXEL, coordinates: MUNDO_ENTERO },
    ]),
  )

/**
 * Dónde vive entonces la atribución del SGC.
 *
 * En una fuente vacía de tipo `geojson`, que sí la admite, con una capa encima
 * que no dibuja nada. Suena a rodeo y lo es, pero el resultado es el correcto:
 * MapLibre solo enseña la atribución de las fuentes que alguna capa visible está
 * usando, así que aparece exactamente cuando hay geología del SGC en pantalla y
 * desaparece al apagarla. Y las condiciones de uso de sus datos la exigen.
 */
export const SGC_ATTRIBUTION_SOURCE_ID = "sgc-atribucion"
export const SGC_ATTRIBUTION_LAYER_ID = "sgc-atribucion-capa"

const sgcAttributionSource = () => ({
  [SGC_ATTRIBUTION_SOURCE_ID]: {
    type: "geojson",
    data: { type: "FeatureCollection", features: [] },
    attribution: SGC_ATTRIBUTION,
  },
})

const sgcAttributionLayer = () => ({
  id: SGC_ATTRIBUTION_LAYER_ID,
  type: "circle",
  source: SGC_ATTRIBUTION_SOURCE_ID,
  layout: { visibility: "none" },
})

const sgcLayers = () =>
  SGC_LAYERS.map((capa) => ({
    id: sgcLayerId(capa.key),
    type: "raster",
    source: sgcSourceId(capa.key),
    layout: { visibility: "none" },
    // La opacidad de partida es la misma que la de las capas de la ANM, y la
    // maneja el deslizador del panel. `raster-fade-duration` en cero porque
    // estas imágenes tardan segundos en llegar y el desvanecido encima las hacía
    // parecer más lentas todavía.
    paint: { "raster-opacity": 0.6, "raster-fade-duration": 0 },
  }))

/**
 * La plancha geológica en PDF, colocada sobre el mapa.
 *
 * Va **encima de las capas del SGC** y no debajo, al revés que todo lo demás: no
 * es contexto de ellas, es la misma geología a más detalle y más al día. Quien
 * la pone quiere verla, y lo que tiene debajo es la versión gruesa de lo mismo.
 *
 * Sigue por debajo de los títulos mineros, que es lo que el visor viene a
 * enseñar.
 *
 * Nace con el píxel transparente y cubriendo el mundo, como las del SGC: una
 * fuente de imagen exige imagen y esquinas al declararla. Quien la llena es
 * `usePlanchaGL`, con las cuatro esquinas que salen de georreferenciar el PDF.
 */
export const PLANCHA_SOURCE_ID = "plancha-src"
export const PLANCHA_LAYER_ID = "plancha-capa"

const planchaSource = () => ({
  [PLANCHA_SOURCE_ID]: { type: "image", url: TRANSPARENT_PIXEL, coordinates: MUNDO_ENTERO },
})

const planchaLayer = () => ({
  id: PLANCHA_LAYER_ID,
  type: "raster",
  source: PLANCHA_SOURCE_ID,
  layout: { visibility: "none" },
  paint: {
    "raster-opacity": 1,
    "raster-fade-duration": 0,
    // La plancha es un dibujo, no una medida: interpolar entre sus píxeles al
    // acercarse es lo correcto, y es lo que hace MapLibre por omisión. Se deja
    // dicho para que nadie lo copie de la capa derivada, que sí necesita
    // `nearest` porque allí cada celda es un valor calculado.
    "raster-resampling": "linear",
  },
})

export const ANH_ATTRIBUTION_SOURCE_ID = "anh-atribucion"
export const ANH_ATTRIBUTION_LAYER_ID = "anh-atribucion-capa"

const anhSources = () =>
  Object.fromEntries(
    ANH_LAYERS.map((capa) => [
      anhSourceId(capa.key),
      { type: "image", url: TRANSPARENT_PIXEL, coordinates: MUNDO_ENTERO },
    ]),
  )

const anhAttributionSource = () => ({
  [ANH_ATTRIBUTION_SOURCE_ID]: {
    type: "geojson",
    data: { type: "FeatureCollection", features: [] },
    attribution: ANH_ATTRIBUTION,
  },
})

const anhAttributionLayer = () => ({
  id: ANH_ATTRIBUTION_LAYER_ID,
  type: "circle",
  source: ANH_ATTRIBUTION_SOURCE_ID,
  layout: { visibility: "none" },
})

const anhLayers = () =>
  ANH_LAYERS.map((capa) => ({
    id: anhLayerId(capa.key),
    type: "raster",
    source: anhSourceId(capa.key),
    layout: { visibility: "none" },
    paint: { "raster-opacity": 0.6, "raster-fade-duration": 0 },
  }))

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
 * @param {string} initialBaseLayer identificador del fondo visible al arrancar
 */
export const createBaseStyle = (initialBaseLayer = DEFAULT_BASEMAP) => ({
  version: 8,
  sources: {
    ...BASEMAP_SOURCES,
    [TERRAIN_SOURCE_ID]: TERRAIN_SOURCE,
    [DERIVATIVE_SOURCE_ID]: DERIVATIVE_SOURCE,
    ...sgcSources(),
    ...anhSources(),
    ...planchaSource(),
    ...sgcAttributionSource(),
    ...anhAttributionSource(),
    ...anmSources(),
  },
  layers: [
    // Debajo de todo, un fondo neutro. Solo se ve con el mapa base en
    // «Ninguno»; el resto del tiempo queda tapado por las teselas. Sin él, esa
    // opción dejaría el mapa en blanco y las capas claras se perderían.
    { id: "fondo-neutro", type: "background", paint: { "background-color": "#eef2f6" } },
    ...basemapLayers(initialBaseLayer),
    hillshadeLayer(),
    ...sgcLayers(),
    ...anhLayers(),
    planchaLayer(),
    sgcAttributionLayer(),
    anhAttributionLayer(),
    derivativeLayer(),
    ...anmLayers(),
    ...searchLayers(),
  ],
})

/**
 * Estilo para el lienzo superpuesto de fusión temática (Geología SGC, Hidrocarburos ANH, Plancha).
 *
 * Se usa en el mapa superior con `mix-blend-mode: multiply` (o normal).
 * CRÍTICO:
 * 1. NO lleva capa de fondo (`background`) para que el canvas de WebGL sea 100% transparente.
 * 2. Incluye la fuente de terreno 3D (`terrain-rgb`) para sincronizarse con la malla de elevación en 3D.
 * 3. Declara las fuentes y capas ráster de SGC, ANH y Planchas.
 */
export const createOverlayStyle = () => ({
  version: 8,
  sources: {
    [TERRAIN_SOURCE_ID]: TERRAIN_SOURCE,
    ...sgcSources(),
    ...anhSources(),
    ...planchaSource(),
    ...sgcAttributionSource(),
    ...anhAttributionSource(),
  },
  layers: [
    ...sgcLayers(),
    ...anhLayers(),
    planchaLayer(),
    sgcAttributionLayer(),
    anhAttributionLayer(),
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
/**
 * Todas las capas de fondo, declaradas de una vez y ocultas salvo la del fondo
 * inicial. Van primero en la lista porque en MapLibre el orden es el orden de
 * pintado: todo lo demás tiene que quedar por encima.
 */
const basemapLayers = (initialBaseLayer) => {
  const visibles = new Set(visibleBasemapLayers(initialBaseLayer, true))

  return ALL_BASEMAP_LAYERS.map((id) => ({
    id,
    type: "raster",
    source: `${id}-src`,
    layout: { visibility: visibles.has(id) ? "visible" : "none" },
  }))
}

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
