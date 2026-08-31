import { ANM_LAYERS, fetchLayerFeatures } from "./anmLayers"
import { buildKml } from "./exportUtils"
import { findTenureLayerNumbers, tenureLayerUrl } from "./tenureLayers"

/**
 * Descarga por área: la función que separa este visor de otro cualquiera.
 *
 * "Dibuja un cuadro y sal con los archivos." El usuario dibuja un polígono, y de
 * cada capa de la ANM que tenga encendida se le entrega, en un solo ZIP, lo que
 * cae dentro de esa área —en GeoJSON y en KML— más un README que dice de dónde
 * salió cada cosa. Esa trazabilidad es lo que lo vuelve una herramienta de
 * trabajo y no un juguete.
 *
 * Módulo de lógica: el armado del bbox, del README y del ZIP no dependen de
 * MapLibre y se prueban sin navegador. Lo único con red es `collectLayerData`.
 *
 * **Pendiente y a propósito:** el DEM recortado. La Fase 5 del plan deja la
 * fuente del DEM como decisión por evaluar (OpenTopography, con cuota, frente a
 * los COG de Copernicus GLO-30, sin cuota), y desde el entorno de desarrollo no
 * se alcanza ninguna para probarla. El README ya reserva su sección y advierte
 * de las alturas elipsoidales; añadir el archivo del DEM es enchufar una función
 * más a este pipeline, sin tocar el resto.
 */

/**
 * Envolvente (bbox) de una geometría dibujada.
 *
 * Recorre todas las coordenadas sea cual sea el anidamiento (Polygon,
 * MultiPolygon), así que da igual si el usuario dibujó un cuadro o una figura
 * con varias partes. Devuelve null si no hay ninguna coordenada usable.
 */
export const bboxOfGeometry = (geometry) => {
  let west = Infinity
  let south = Infinity
  let east = -Infinity
  let north = -Infinity
  let any = false

  const walk = (coords) => {
    if (typeof coords?.[0] === "number") {
      const [lon, lat] = coords
      if (lon < west) west = lon
      if (lon > east) east = lon
      if (lat < south) south = lat
      if (lat > north) north = lat
      any = true
      return
    }
    if (Array.isArray(coords)) coords.forEach(walk)
  }

  walk(geometry?.coordinates)
  return any ? { west, south, east, north } : null
}

/** Envolvente que abarca todas las figuras de una FeatureCollection. */
export const bboxOfFeatureCollection = (featureCollection) => {
  const boxes = (featureCollection?.features || [])
    .map((feature) => bboxOfGeometry(feature?.geometry))
    .filter(Boolean)

  if (boxes.length === 0) return null

  return boxes.reduce((acc, box) => ({
    west: Math.min(acc.west, box.west),
    south: Math.min(acc.south, box.south),
    east: Math.max(acc.east, box.east),
    north: Math.max(acc.north, box.north),
  }))
}

/** Nombre de archivo seguro: sin acentos, espacios ni barras que rompan el ZIP. */
export const sanitizeName = (value) =>
  String(value ?? "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-zA-Z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .toLowerCase() || "capa"

/** Fecha en formato legible y sin ambigüedad de huso: siempre UTC. */
const formatTimestamp = (date) =>
  `${date.toISOString().slice(0, 16).replace("T", " ")} UTC`

const formatCoord = (value) => value.toFixed(6)

/**
 * README.txt de la descarga. Es el corazón de la trazabilidad: sin esto, dentro
 * de seis meses nadie sabe de qué servicio salió el archivo ni con qué fecha, y
 * un dato geoespacial sin procedencia no sirve para un informe.
 *
 * @param {Object} params
 * @param {Array} params.layers  [{ label, serviceUrl, count, truncated }]
 * @param {Object} params.bbox   { west, south, east, north }
 * @param {Date}   params.generatedAt
 */
export const buildReadme = ({ layers, bbox, generatedAt }) => {
  const lines = []
  const push = (text = "") => lines.push(text)

  push("DESCARGA DE ÁREA — Visor de información minera y territorial")
  push(`Generado: ${formatTimestamp(generatedAt)}`)
  push("")
  push("ÁREA CONSULTADA")
  push("  Envolvente del polígono dibujado, en EPSG:4686 (MAGNA-SIRGAS")
  push("  geográficas; en Colombia coincide con WGS84 dentro de ~1 m).")
  push(`  Oeste:  ${formatCoord(bbox.west)}`)
  push(`  Sur:    ${formatCoord(bbox.south)}`)
  push(`  Este:   ${formatCoord(bbox.east)}`)
  push(`  Norte:  ${formatCoord(bbox.north)}`)
  push("")
  push("CAPAS INCLUIDAS")

  layers.forEach((layer) => {
    push(`  - ${layer.label}`)
    // La fuente sale del catálogo de la capa, no escrita aquí. Estuvo fija como
    // «ANM» para toda capa: cierto con las cuatro de hoy y falso el día que
    // entre la primera del SGC o del IGAC, con el README asegurando una
    // procedencia equivocada sin que nada fallara.
    push(`      Fuente: ${layer.source ?? "sin identificar"}`)
    push(`      Servicio: ${layer.serviceUrl}`)
    push(`      Consultado: ${formatTimestamp(generatedAt)}`)
    push(`      Registros incluidos: ${layer.count}`)
    if (layer.truncated) {
      push("      [!] El servicio RECORTÓ la respuesta: hay más polígonos en el")
      push("          área de los que se entregaron. Reduce el área o consúltala")
      push("          por partes para obtenerlos todos.")
    }
  })

  push("")
  push("SISTEMAS DE COORDENADAS")
  push("  Geometrías entregadas en EPSG:4686 (MAGNA-SIRGAS geográficas).")
  push("  Para calcular áreas y distancias, reproyectar a EPSG:9377")
  push("  (CTM-12 / Origen Nacional). Mezclar los dos da números erróneos.")
  push("")
  push("MODELO DE ELEVACIÓN (DEM)")
  push("  No incluido todavía: la fuente del DEM está por definir.")
  push("  Cuando se incluya, tener presente que las alturas de los DEM globales")
  push("  son ELIPSOIDALES. Para cotas ortométricas (sobre el nivel del mar) hay")
  push("  que aplicar un modelo de geoide (EGM2008 o GEOCOL). No usar las alturas")
  push("  crudas como cotas topográficas.")
  push("")
  push("FORMATOS")
  push("  .geojson  Interoperable (QGIS, ArcGIS, etc.). EPSG:4686.")
  push("  .kml      Google Earth. EPSG:4686.")
  push("  area.geojson  El polígono que dibujaste, para referencia.")

  return lines.join("\n")
}

/**
 * Resuelve, para las capas encendidas, su URL de servicio. Las de tenencia
 * descubren su índice en runtime (cambia entre despliegues de la ANM); las demás
 * tienen dirección fija. Una capa cuyo índice no se pudo descubrir se omite.
 *
 * @param {Object} layerVisibility  { title, request, anmService, historicalTitle }
 */
export const resolveActiveLayers = async (layerVisibility) => {
  const active = ANM_LAYERS.filter(({ key }) => layerVisibility[key])
  if (active.length === 0) return []

  const needsDiscovery = active.some(({ tenureName }) => tenureName)
  const layerNumbers = needsDiscovery ? await findTenureLayerNumbers() : {}

  return active
    .map(({ key, label, source, tenureName, url }) => {
      if (url) return { key, label, source, serviceUrl: url }
      const number = layerNumbers[tenureName]
      return number === undefined ? null : { key, label, source, serviceUrl: tenureLayerUrl(number) }
    })
    .filter(Boolean)
}

/**
 * Consulta cada capa activa dentro del bbox y devuelve sus datos.
 *
 * Usa `fetchLayerFeatures` (que ya normaliza los errores HTTP-200 de ArcGIS y
 * detecta el recorte de respuesta), la misma vía que el mapa: un solo camino
 * para hablar con la ANM.
 */
export const collectLayerData = async (activeLayers, bbox, options) => {
  return Promise.all(
    activeLayers.map(async (layer) => {
      const { featureCollection, truncated } = await fetchLayerFeatures(
        layer.serviceUrl,
        bbox,
        options,
      )
      return { ...layer, featureCollection, truncated }
    }),
  )
}

/**
 * Arma el ZIP en memoria. Recibe una instancia de JSZip por parámetro en vez de
 * importarla, para poder probar el contenido en Node sin la maquinaria del
 * navegador.
 *
 * @returns {Promise<Blob|Buffer>} lo que genere el JSZip que se le pase
 */
export const buildAreaZip = async ({ JSZipCtor, layers, areaGeoJSON, bbox, generatedAt }) => {
  const zip = new JSZipCtor()

  const readmeLayers = layers.map((layer) => ({
    label: layer.label,
    source: layer.source,
    serviceUrl: layer.serviceUrl,
    count: layer.featureCollection.features.length,
    truncated: layer.truncated,
  }))

  zip.file("README.txt", buildReadme({ layers: readmeLayers, bbox, generatedAt }))
  zip.file("area.geojson", JSON.stringify(areaGeoJSON, null, 2))

  // Un nombre de archivo por capa, y sin repetidos. `sanitizeName` quita los
  // acentos, así que «Títulos Vigentes» y «Titulos Vigentes» dan lo mismo y el
  // segundo pisaba al primero dentro del ZIP sin avisar: el usuario abría cuatro
  // capas y encontraba tres archivos. Con las de hoy no pasa; con capas de
  // varias entidades es cuestión de tiempo.
  const usados = new Set()
  const nombreLibre = (etiqueta) => {
    const base = sanitizeName(etiqueta)
    if (!usados.has(base)) {
      usados.add(base)
      return base
    }
    let n = 2
    while (usados.has(`${base}_${n}`)) n += 1
    usados.add(`${base}_${n}`)
    return `${base}_${n}`
  }

  layers.forEach((layer) => {
    const base = nombreLibre(layer.label)
    zip.file(`${base}.geojson`, JSON.stringify(layer.featureCollection, null, 2))

    // El KML solo si hay geometría exportable; buildKml devuelve null si no.
    const kml = buildKml(layer.featureCollection, layer.label)
    if (kml) zip.file(`${base}.kml`, kml)
  })

  return zip.generateAsync({ type: typeof window === "undefined" ? "nodebuffer" : "blob" })
}
