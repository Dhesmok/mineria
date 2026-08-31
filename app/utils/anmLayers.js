import { arcgisToGeoJSON } from "@esri/arcgis-to-geojson-utils"
import { fetchArcgisJson } from "./arcgis"
import { REQUEST_LAYER_NAME, TITLE_LAYER_NAME } from "./tenureLayers"

/**
 * Definición de las cuatro capas de la ANM y cómo se piden al servicio.
 *
 * Es lógica pura a propósito: no importa MapLibre. Así se puede probar el armado
 * de las URLs y la conversión de geometrías sin abrir un navegador, que es la
 * misma razón por la que `utils/` sobrevivió intacto al cambio de motor de mapa.
 */

// Estas capas cubren todo el país. Pedirlas a zoom bajo trae decenas de miles de
// polígonos: ArcGIS corta la respuesta en maxRecordCount y el mapa mostraba un
// subconjunto incompleto sin avisar, además de congelar el navegador. Es el
// mismo umbral que usaba el visor Leaflet.
export const LAYERS_MIN_ZOOM = 10

/**
 * Cuántas features se piden como máximo por consulta. Si el servicio devuelve
 * justo este número, es señal de que recortó el resultado y hay más de las que
 * se están mostrando. Ver `didExceedLimit`.
 */
export const MAX_FEATURES_PER_QUERY = 2000

/**
 * Las cuatro capas, en el orden en que se apilan: la primera queda debajo.
 *
 * `tenureName` significa "hay que descubrir su número en runtime", porque la ANM
 * cambia los índices entre despliegues (ver `findTenureLayerNumbers`). `url`
 * significa que la capa vive en una dirección fija.
 *
 * Los colores son los mismos del visor Leaflet, para que la comparación lado a
 * lado no dependa de recordar cuál era cuál.
 */
/**
 * Quién publica cada capa.
 *
 * Va como dato y no escrito en el README de la descarga, donde estaba fijo como
 * «ANM» para toda capa. Hoy es cierto —las cuatro son de la ANM—, y deja de
 * serlo en cuanto se conecte la primera de otra entidad: el README seguiría
 * diciendo «Fuente: ANM» sobre una capa del SGC, y un dato geoespacial con la
 * procedencia equivocada es peor que uno sin procedencia.
 */
export const ANM_SOURCE = "ANM (Agencia Nacional de Minería)"

export const ANM_LAYERS = [
  {
    key: "title",
    label: "Títulos Vigentes",
    tenureName: TITLE_LAYER_NAME,
    source: ANM_SOURCE,
    lineColor: "#894444",
    fillColor: "#A46F48",
  },
  {
    key: "anmService",
    label: "Subcontratos",
    url: "https://geo.anm.gov.co/webgis/rest/services/ANM/ServiciosANM/MapServer/3",
    source: ANM_SOURCE,
    lineColor: "#6E4B3A",
    fillColor: "#B68863",
  },
  {
    key: "request",
    label: "Solicitudes Vigentes",
    tenureName: REQUEST_LAYER_NAME,
    source: ANM_SOURCE,
    lineColor: "#F0C567",
    fillColor: "#FFF0AF",
  },
  {
    key: "historicalTitle",
    label: "Título Histórico",
    url: "https://annamineria.anm.gov.co/annageo/rest/services/SIGM/VisorInterno/MapServer/87",
    source: ANM_SOURCE,
    lineColor: "#22577A",
    fillColor: "#38A3A5",
  },
]

/** Identificadores dentro del estilo de MapLibre. Un solo sitio donde se arman. */
export const anmSourceId = (key) => `anm-${key}`
export const anmFillLayerId = (key) => `anm-${key}-fill`
export const anmLineLayerId = (key) => `anm-${key}-line`

/** Una capa GeoJSON vacía. MapLibre exige datos válidos aunque no haya nada. */
export const emptyFeatureCollection = () => ({ type: "FeatureCollection", features: [] })

/**
 * Recorta el bbox del viewport al rango válido de coordenadas geográficas.
 *
 * Al alejarse mucho, MapLibre devuelve longitudes fuera de -180..180 (el mapa da
 * la vuelta al mundo) y latitudes más allá de los polos. ArcGIS responde a un
 * envelope así con un error, no con una lista vacía, así que el banner rojo
 * saltaba por un gesto normal del usuario.
 */
export const clampBounds = ({ west, south, east, north }) => ({
  west: Math.max(west, -180),
  south: Math.max(south, -90),
  east: Math.min(east, 180),
  north: Math.min(north, 90),
})

/**
 * URL de consulta de features: dentro de un bbox, o de la capa entera si no se
 * pasa ninguno.
 *
 * Se pide `f=json` (el formato propio de Esri) y no `f=geojson`, y es a
 * propósito. Es el formato que pedía esri-leaflet, o sea el que lleva años
 * funcionando de verdad contra estos servidores; la conversión la hace
 * `arcgisToGeoJSON`, la misma utilidad oficial de Esri que esri-leaflet usaba
 * por dentro. La migración no cambió nada de esto.
 *
 * Se comprobó (`scripts/probar-geojson.mjs`) que los tres servicios de la ANM
 * sí saben responder `f=geojson`, así que el cambio es posible. No se hizo:
 * ahorra una conversión que ya está probada, a cambio de estrenar un camino sin
 * probar justo en lo más delicado, que es el anidamiento de los anillos y los
 * huecos de los polígonos (trampa 4 de CLAUDE.md). No compensa.
 *
 * `outSR=4326` porque MapLibre espera GeoJSON en WGS84. La ANM publica en
 * MAGNA-SIRGAS (4686), que en Colombia difiere de WGS84 en menos de un metro:
 * irrelevante para dibujar. Ojo: NO es irrelevante para la tabla de coordenadas,
 * pero esa va por la ruta de búsqueda por expediente, que no se toca aquí.
 */
export const buildFeatureQueryUrl = (layerUrl, bounds, where = null) => {
  const params = new URLSearchParams({
    where: where || "1=1",
    inSR: "4326",
    outSR: "4326",
    outFields: "*",
    returnGeometry: "true",
    resultRecordCount: String(MAX_FEATURES_PER_QUERY),
    f: "json",
  })

  // Sin recuadro se consulta la capa entera. Es lo que permite filtrar por "toda
  // la capa" y no solo por lo que se está mirando: un título que cumpla el
  // filtro puede estar a mil kilómetros de donde está la vista. El precio es que
  // el servicio recorta la respuesta, y por eso el aviso de recorte importa aún
  // más en ese modo.
  if (bounds) {
    const { west, south, east, north } = clampBounds(bounds)
    params.set("geometry", `${west},${south},${east},${north}`)
    params.set("geometryType", "esriGeometryEnvelope")
    params.set("spatialRel", "esriSpatialRelIntersects")
  }

  return `${layerUrl}/query?${params.toString()}`
}

/**
 * Convierte la respuesta Esri en una FeatureCollection de GeoJSON.
 *
 * `arcgisToGeoJSON` traduce una geometría suelta, no la respuesta completa, y es
 * quien resuelve la parte espinosa: Esri mete todos los anillos de un
 * multipolígono en una sola lista `rings` y distingue contornos de huecos por el
 * sentido de giro. GeoJSON, en cambio, los anida. Hacer esa traducción a mano es
 * de donde salen los polígonos con huecos rellenos.
 *
 * El `id` se conserva porque MapLibre lo necesita para saber sobre qué polígono
 * se hizo clic.
 */
export const arcgisResponseToGeoJSON = (data) => {
  const features = Array.isArray(data?.features) ? data.features : []
  const idField = data?.objectIdFieldName

  return {
    type: "FeatureCollection",
    features: features
      .map((feature, index) => {
        const geometry = feature?.geometry ? arcgisToGeoJSON(feature.geometry) : null
        if (!geometry) return null

        const attributes = feature.attributes || {}
        return {
          type: "Feature",
          // Sin id propio, `id` va como índice: MapLibre exige un entero o una
          // cadena, y dos features con el mismo id se pisan al consultarlas.
          id: (idField && attributes[idField]) ?? index,
          geometry,
          properties: attributes,
        }
      })
      .filter(Boolean),
  }
}

/**
 * ¿El servicio recortó el resultado?
 *
 * ArcGIS no avisa: simplemente devuelve `resultRecordCount` features y se calla.
 * Trae `exceededTransferLimit` cuando la versión del servidor lo soporta, pero no
 * siempre, así que también se compara contra el tope pedido.
 */
export const didExceedLimit = (data, featureCount) =>
  Boolean(data?.exceededTransferLimit) || featureCount >= MAX_FEATURES_PER_QUERY

/**
 * Pide las features de una capa dentro del bbox y las devuelve ya en GeoJSON.
 *
 * Usa `fetchArcgisJson`, nunca `fetch` pelado: ArcGIS responde HTTP 200 con un
 * cuerpo `{"error": ...}` cuando algo va mal, y esos fallos se confundían con
 * "no hay nada por aquí".
 */
export const fetchLayerFeatures = async (layerUrl, bounds, options, where = null) => {
  const data = await fetchArcgisJson(buildFeatureQueryUrl(layerUrl, bounds, where), options)
  const featureCollection = arcgisResponseToGeoJSON(data)

  return {
    featureCollection,
    // Se cuenta lo que **respondió el servicio**, no lo que quedó después de
    // descartar las figuras sin geometría. Con el conteo de salida, una sola
    // figura sin geometría dentro de una respuesta recortada daba 1999 contra
    // 2000 y el aviso de recorte no salía: el usuario creía estar viendo todos
    // los títulos del área. Y ese respaldo es justo el que importa, porque solo
    // se usa cuando el servidor no manda `exceededTransferLimit`.
    truncated: didExceedLimit(data, Array.isArray(data?.features) ? data.features.length : 0),
  }
}
