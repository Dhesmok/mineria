/**
 * Las capas de hidrocarburos de la Agencia Nacional de Hidrocarburos (ANH).
 *
 * Módulo puro: describe servicios, arma direcciones y normaliza respuestas.
 */

export const ANH_SOURCE_PREFIX = "anh-src-"
export const ANH_LAYER_PREFIX = "anh-"

export const anhSourceId = (key) => `${ANH_SOURCE_PREFIX}${key}`
export const anhLayerId = (key) => `${ANH_LAYER_PREFIX}${key}`

/**
 * Catálogo de capas oficiales de la ANH.
 */
export const ANH_LAYERS = [
  {
    key: "tierras",
    label: "Mapa de Tierras ANH",
    service:
      "https://geovisor.anh.gov.co/server/rest/services/GEOVISOR_v32/ANH_TIERRAS_EGDB_ATTACH/MapServer",
    scale: "1:1.000.000",
    year: 2026,
    hint: "Bloques en exploración, evaluación técnica, explotación y áreas disponibles de hidrocarburos.",
  },
  {
    key: "pozos",
    label: "Pozos de hidrocarburos",
    service:
      "https://geovisor.anh.gov.co/server/rest/services/GEOVISOR_v32/ANH_InsGDB/MapServer",
    sub: [1],
    scale: "variable",
    year: null,
    hint: "Pozos perforados: productores de crudo, gas, inyectores, secos y abandonados.",
  },
  {
    key: "cuencasSedimentarias",
    label: "Cuencas sedimentarias",
    service:
      "https://geovisor.anh.gov.co/server/rest/services/GEOVISOR_v32/Cuencas_Sedimentarias_de_Colombia/MapServer",
    scale: "1:1.500.000",
    year: null,
    hint: "Delimitación de las 23 cuencas sedimentarias petrolíferas de Colombia y su madurez.",
  },
  {
    key: "yacimientos",
    label: "Campos y yacimientos",
    service:
      "https://geovisor.anh.gov.co/server/rest/services/Yacimientos/Yacimientos/MapServer",
    scale: "variable",
    year: null,
    hint: "Delimitación de campos comerciales y yacimientos de petróleo y gas en Colombia.",
  },
  {
    key: "sismica",
    label: "Sísmica 2D y 3D",
    service:
      "https://geovisor.anh.gov.co/server/rest/services/GEOVISOR_v32/ANH_InsGDB/MapServer",
    sub: [2, 3],
    scale: "variable",
    year: null,
    hint: "Líneas de adquisición sísmica 2D y polígonos de programas sísmicos 3D.",
  },
  {
    key: "rezumaderos",
    label: "Rezumaderos naturales",
    service:
      "https://geovisor.anh.gov.co/server/rest/services/GEOVISOR_v32/ANH_InsGDB/MapServer",
    sub: [0],
    scale: "variable",
    year: null,
    hint: "Manifestaciones naturales de hidrocarburos, asfalto y gas en superficie.",
  },
  {
    key: "historicoTierras",
    label: "Histórico de tierras",
    service:
      "https://geovisor.anh.gov.co/server/rest/services/GEOVISOR_v32/ANH_HISTORICOS1_EGDB/MapServer",
    scale: "variable",
    year: 2026,
    hint: "Evolución histórica de bloques y áreas liberadas de la ANH desde 2018.",
  },
]

const BY_KEY = new Map(ANH_LAYERS.map((layer) => [layer.key, layer]))

export const anhLayerByKey = (key) => BY_KEY.get(key)

export const ANH_KEYS = ANH_LAYERS.map((layer) => layer.key)

export const ANH_MAX_IMAGE_PX = 2048

/**
 * Arma la dirección de exportación al MapServer de la ANH.
 * Nota: ANH requiere bboxSR=4686&imageSR=4686 (grados WGS84/MAGNA-SIRGAS).
 */
export const anhExportUrl = (service, bbox, size, layers = "") =>
  `${service}/export?bbox=${bbox}&bboxSR=4686&imageSR=4686` +
  `&size=${size}&dpi=96&format=png32&transparent=true` +
  (layers ? `&layers=${layers}` : "") +
  "&f=image"

/**
 * Calcula tamaño proporcional en píxeles.
 */
export const anhImageSize = (bboxDeg, screenPx, max = ANH_MAX_IMAGE_PX) => {
  const [oeste, sur, este, norte] = bboxDeg
  const ancho = Math.abs(este - oeste)
  const alto = Math.abs(norte - sur)
  if (!(ancho > 0) || !(alto > 0)) return [1, 1]

  const proporcion = ancho / alto
  let w = Math.min(Math.max(Math.round(screenPx?.[0] ?? max), 1), max)
  let h = Math.max(Math.round(w / proporcion), 1)
  if (h > max) {
    h = max
    w = Math.max(Math.round(h * proporcion), 1)
  }
  return [w, h]
}

/**
 * Dirección para pedir una imagen de una capa de la ANH a través de nuestra ruta.
 */
export const anhImageUrl = ({ key, bbox, width, height, sub = [] }) => {
  const partes = [
    `capa=${encodeURIComponent(key)}`,
    `bbox=${bbox.map((n) => Number(n).toFixed(6)).join(",")}`,
    `tam=${Math.round(width)},${Math.round(height)}`,
  ]
  if (sub.length > 0) {
    partes.push(`sub=${sub.join(",")}`)
  }
  return `/api/anh?${partes.join("&")}`
}

export const anhMetaUrl = (key) => `/api/anh?capa=${encodeURIComponent(key)}&modo=meta`

export const anhLegendUrl = (key) => `/api/anh?capa=${encodeURIComponent(key)}&modo=leyenda`

export const anhFieldsUrl = (key, layerId) =>
  `/api/anh?capa=${encodeURIComponent(key)}&modo=campos&sub=${Number(layerId)}`

/**
 * Dirección para consultar qué hay en un punto.
 */
export const anhIdentifyUrl = ({ key, lngLat, bbox, size, sub = [] }) => {
  const partes = [
    `capa=${encodeURIComponent(key)}`,
    "modo=identify",
    `geom=${Number(lngLat.lng).toFixed(6)},${Number(lngLat.lat).toFixed(6)}`,
    `bbox=${bbox.map((n) => Number(n).toFixed(6)).join(",")}`,
    `tam=${size[0]},${size[1]}`,
  ]
  if (sub.length > 0) {
    partes.push(`sub=${sub.join(",")}`)
  }
  return `/api/anh?${partes.join("&")}`
}

/** Atribución oficial de la ANH */
export const ANH_ATTRIBUTION =
  '<a href="https://www.anh.gov.co" target="_blank" rel="noopener noreferrer">Agencia Nacional de Hidrocarburos</a>'
