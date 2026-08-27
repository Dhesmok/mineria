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
 * - Google publica **dos direcciones distintas**, una con nombres y otra sin
 *   ellos. Ahí se cambia de dirección.
 * - Esri publica la imagen por un lado y los nombres por otro, para superponer.
 *   Ahí se enciende una segunda capa encima. Vale igual para la imagen de
 *   satélite y para el lienzo gris.
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
  grayBase: "bm-gray-base",
  grayReference: "bm-gray-reference",
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
  /**
   * El lienzo gris claro, que **sustituyó al de CARTO**.
   *
   * CARTO servía este mismo tipo de fondo sin pedir nada, y de un día para otro
   * empezó a devolver las teselas atravesadas por un «API KEY REQUIRED». No es un
   * fallo pasajero: es un cambio de producto, y como era el fondo de partida, el
   * visor abría con el mapa marcado de lado a lado.
   *
   * Este viene del mismo servicio de Esri que ya sirve la imagen de satélite, así
   * que no suma un proveedor nuevo ni un permiso nuevo en la política de
   * seguridad. Y es un fondo pensado justo para esto: gris de bajo contraste para
   * poner datos encima.
   *
   * **Queda anotado en `docs/RIESGOS.md`,** porque la lección no es «CARTO se
   * portó mal» sino que todos los fondos de este visor son cortesías de terceros
   * que pueden retirarse sin avisar. Este puede ser el siguiente.
   */
  "bm-gray-base-src": {
    type: "raster",
    tiles: [
      "https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Light_Gray_Base/MapServer/tile/{z}/{y}/{x}",
    ],
    tileSize: 256,
    maxzoom: 16,
    attribution: `Esri, ${OSM_ATTRIBUTION}`,
  },
  "bm-gray-reference-src": {
    type: "raster",
    tiles: [
      "https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Light_Gray_Reference/MapServer/tile/{z}/{y}/{x}",
    ],
    tileSize: 256,
    maxzoom: 16,
    attribution: "Esri",
  },
}

/**
 * Los fondos que ofrece el visor.
 *
 * `short` es el nombre para el distintivo del botón del mapa: ahí solo caben
 * unos pocos caracteres, y «Imagen satelital Esri» estiraba el botón hasta
 * descuadrar la columna entera de controles.
 *
 * `labels` dice qué se puede hacer con los nombres:
 *   "swap"    — hay dos direcciones, una con y otra sin
 *   "overlay" — los nombres son una capa aparte que se superpone
 *   "fixed"   — vienen pintados en la tesela y no se pueden quitar
 *   "none"    — no hay nombres de los que hablar
 */
export const BASEMAPS = [
  {
    /**
     * Sin fondo.
     *
     * No es un hueco en la lista: es lo que hace falta para mirar el modelo de
     * elevación solo. Sobre una imagen de satélite, la capa de pendiente compite
     * con el color del propio terreno y cuesta leer dónde empieza un escarpe;
     * sin nada debajo, los colores son solo los de la pendiente.
     *
     * No apaga el mapa entero: debajo de todo queda un fondo neutro declarado en
     * el estilo, para que las capas se lean sobre algo y no sobre el blanco de
     * la página.
     */
    id: "none",
    name: "Sin mapa de fondo",
    short: "Ninguno",
    source: "",
    hint: "Fondo neutro. Para leer el relieve, la pendiente o los títulos sin nada que compita.",
    // "none", no "fixed": sin teselas no hay nombres ni fijos ni quitables, y
    // la lista de fondos anunciaba «nombres fijos» en esta fila, que es
    // sencillamente falso. Se vio en una captura, no en las pruebas.
    labels: "none",
    withLabels: [],
    withoutLabels: [],
  },
  {
    /**
     * **El identificador sigue siendo `positron` aunque ya no sea el de CARTO.**
     *
     * No es descuido: el visor guarda en el navegador qué fondo eligió cada
     * usuario, y cambiar la palabra haría que a todo el que tuviera este puesto le
     * apareciera otro distinto al volver. Es el mismo motivo por el que
     * «Cartografía» conserva por dentro el nombre `catastro`.
     */
    id: "positron",
    name: "Cartográfico claro",
    short: "Claro",
    source: "Esri",
    hint: "Base gris de bajo contraste. Los títulos y sus contornos se leen sin competir con el fondo.",
    // "overlay" y no "swap": aquí los nombres son una capa aparte que se pone
    // encima, como en la imagen de Esri. CARTO publicaba dos direcciones
    // distintas y por eso era "swap".
    labels: "overlay",
    withLabels: [BASEMAP_LAYERS.grayBase, BASEMAP_LAYERS.grayReference],
    withoutLabels: [BASEMAP_LAYERS.grayBase],
  },
  {
    id: "satellite",
    name: "Imagen satelital",
    short: "Satélite",
    source: "Google",
    hint: "Máxima resolución disponible en cascos urbanos y cabeceras municipales.",
    labels: "swap",
    withLabels: [BASEMAP_LAYERS.googleHybrid],
    withoutLabels: [BASEMAP_LAYERS.googlePlain],
  },
  {
    id: "esri",
    name: "Imagen satelital Esri",
    short: "Esri",
    source: "Esri · Maxar",
    hint: "Fechas de toma distintas a las de Google. Útil cuando una zona sale con nubes o desactualizada.",
    labels: "overlay",
    withLabels: [BASEMAP_LAYERS.esriImagery, BASEMAP_LAYERS.esriReference],
    withoutLabels: [BASEMAP_LAYERS.esriImagery],
  },
  {
    id: "topo",
    name: "Topográfico",
    short: "Topo",
    source: "OpenTopoMap",
    hint: "Curvas de nivel, sombreado del relieve y drenajes sobre base cartográfica.",
    labels: "fixed",
    withLabels: [BASEMAP_LAYERS.topo],
    withoutLabels: [BASEMAP_LAYERS.topo],
  },
  {
    id: "osm",
    name: "Callejero",
    short: "Calles",
    source: "OpenStreetMap",
    hint: "Vías, veredas y topónimos. El más completo para ubicarse por nombres de lugar.",
    labels: "fixed",
    withLabels: [BASEMAP_LAYERS.osm],
    withoutLabels: [BASEMAP_LAYERS.osm],
  },
]

/**
 * El fondo de partida.
 *
 * Es el gris claro y no la imagen de satélite, porque lo primero que este visor
 * tiene que dejar ver son los títulos: sobre la imagen, un polígono marrón
 * semitransparente compite con el terreno que hay debajo, y los contornos se
 * pierden. La imagen se enciende cuando ya se sabe dónde mirar.
 */
export const DEFAULT_BASEMAP = "positron"

const BY_ID = new Map(BASEMAPS.map((basemap) => [basemap.id, basemap]))

export const basemapById = (id) => BY_ID.get(id) ?? BY_ID.get(DEFAULT_BASEMAP)

/**
 * ¿Se le pueden quitar los nombres a este fondo?
 *
 * Se listan los dos casos que sí, en vez de excluir el que no: cuando se añadió
 * el fondo vacío —que no tiene nombres de ninguna clase— la versión anterior,
 * escrita como «distinto de fijos», lo dio por alternable y la lista le ofrecía
 * un interruptor de nombres que no existían.
 */
export const supportsLabelToggle = (id) => {
  const { labels } = basemapById(id)
  return labels === "swap" || labels === "overlay"
}

/** ¿Trae nombres pintados en la tesela, que no hay forma de quitar? */
export const hasFixedLabels = (id) => basemapById(id).labels === "fixed"

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
