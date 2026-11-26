import shpwrite from "@mapbox/shp-write"
import { rewind } from "@turf/turf"

import { ANM_LAYERS, fetchLayerFeatures } from "./anmLayers"
import { crsById, SOURCE_CRS } from "./crs"
import { DEM_NODATA, cropMosaic, demStats, encodeGeoTiff, planDemClip } from "./demClip"
import { loadMosaic } from "./demTileLoader"
import { tilesOf } from "./demTiles"
import { buildKml } from "./exportUtils"
import { TERRAIN_TILE_TEMPLATE } from "./mapStyles"
import { ServiceUnavailableError } from "./arcgis"
import { findTenureLayerNumbers, tenureLayerUrl, tenureServiceUnreachable } from "./tenureLayers"

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
 * **Y el relieve.** Desde noviembre de 2026 el ZIP lleva también el modelo de
 * elevación recortado al área (`dem.tif`), y cada capa en shapefile además de
 * GeoJSON y KML: es el «GeoJSON/SHP/KML + DEM recortado + README» que pedía la
 * visión del proyecto. El recorte y el GeoTIFF están en `demClip.js`, que explica
 * de dónde salen las alturas y por qué no son elipsoidales.
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

const metros = (valor) => `${Math.round(valor).toLocaleString("es-CO")} m`

/**
 * La sección del modelo de elevación en el README.
 *
 * **Las alturas van con su referencia dicha en mayúsculas**, porque es el error
 * caro: la versión anterior de esta sección aseguraba que las alturas de los DEM
 * globales eran elipsoidales y mandaba a aplicarles un geoide. SRTM —que es lo
 * que sirven estas teselas en Colombia— ya está referido al geoide EGM96, así que
 * seguir ese consejo descuadraba las cotas entre 0 y 30 m. Ver `demClip.js`.
 */
export const demReadmeLines = (dem) => {
  const lines = ["MODELO DE ELEVACIÓN (DEM)"]
  if (!dem || dem.error) {
    lines.push("  No incluido: no se pudo bajar el modelo de elevación del área.")
    if (dem?.error) lines.push(`  Motivo: ${dem.error}`)
    lines.push("  Vuelve a intentar la descarga; las capas vectoriales no dependen de él.")
    return lines
  }

  const { plan, stats, missing, total } = dem
  lines.push("  Archivo: dem.tif (GeoTIFF de una banda, Float32, metros).")
  lines.push("  Fuente: SRTM de 1 segundo de arco (NASA), servido como Terrain Tiles")
  lines.push("          de AWS Open Data. Uso libre, sin clave.")
  lines.push(`  Servicio: ${TERRAIN_TILE_TEMPLATE}`)
  lines.push("  Sistema: EPSG:3857 (Web Mercator), la rejilla nativa de las teselas.")
  lines.push("           Sin remuestrear: cada celda es un dato del modelo. Si lo")
  lines.push("           reproyectas a EPSG:9377, elige tú el método (bilineal suele")
  lines.push("           bastar para relieve).")
  lines.push(
    `  Celda: ${plan.cellMeters.toFixed(1)} m sobre el terreno (${plan.window.width} × ${plan.window.height} celdas).`,
  )
  lines.push("         El dato de origen es de ~30 m: no hay detalle más fino que ese.")
  if (plan.reducedResolution) {
    lines.push("  [!] El área es grande y se bajó la resolución para no pasar del tope")
    lines.push("      de teselas. Para el detalle completo, descarga el área por partes.")
  }
  if (stats.valid > 0) {
    lines.push(
      `  Alturas: mínima ${metros(stats.min)}, máxima ${metros(stats.max)}, media ${metros(stats.mean)}.`,
    )
  }
  lines.push(`  Sin dato: ${DEM_NODATA}.`)
  if (missing > 0) {
    lines.push(`  [!] ${missing} de ${total} teselas no llegaron: esas zonas van como sin`)
    lines.push("      dato, no como altura cero. Vuelve a descargar para completarlas.")
  }
  lines.push("")
  lines.push("  ALTURAS REFERIDAS AL GEOIDE EGM96, NO AL ELIPSOIDE. Son cotas")
  lines.push("  aproximadas sobre el nivel medio del mar: NO les apliques otro geoide.")
  lines.push("  Frente a la red de nivelación del IGAC (GEOCOL) pueden diferir unos")
  lines.push("  metros. La especificación de SRTM es de ±16 m en absoluto (90 %), y es")
  lines.push("  un modelo de superficie: en zonas de bosque mide la copa de los árboles.")
  lines.push("  Sirve para relieve, pendientes y perfiles; no reemplaza una topografía.")
  return lines
}

/**
 * README.txt de la descarga. Es el corazón de la trazabilidad: sin esto, dentro
 * de seis meses nadie sabe de qué servicio salió el archivo ni con qué fecha, y
 * un dato geoespacial sin procedencia no sirve para un informe.
 *
 * @param {Object} params
 * @param {Array} params.layers  [{ label, serviceUrl, count, truncated }]
 * @param {Object} params.bbox   { west, south, east, north }
 * @param {Date}   params.generatedAt
 * @param {Object} [params.dem]  lo que devuelve `collectDem`, o `{ error }` si no llegó
 */
export const buildReadme = ({ layers, bbox, generatedAt, dem = null }) => {
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
  if (layers.length === 0) {
    push("  Ninguna capa vectorial estaba encendida al descargar. El ZIP lleva")
    push("  solo el modelo de elevación y el polígono del área.")
  }

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
  demReadmeLines(dem).forEach((line) => push(line))
  push("")
  push("FORMATOS")
  push("  .geojson  Interoperable (QGIS, ArcGIS, etc.). EPSG:4686.")
  push("  .kml      Google Earth. EPSG:4686.")
  push("  shp/      Un shapefile por capa, con su .prj. EPSG:4686. El formato")
  push("            corta los nombres de campo a 10 caracteres; si dos chocan,")
  push("            el .geojson tiene los nombres completos.")
  push("  dem.tif   Modelo de elevación (GeoTIFF, Float32, metros). EPSG:3857.")
  push("  area.geojson  El polígono que dibujaste, para referencia.")

  return lines.join("\n")
}

/**
 * Resuelve, para las capas encendidas, su URL de servicio. Las de tenencia
 * descubren su índice en runtime (cambia entre despliegues de la ANM); las demás
 * tienen dirección fija.
 *
 * **Una capa encendida que no se puede resolver ya no se omite en silencio.**
 * Se omitía, y con la ANM caída eso daba un ZIP con solo el relieve y un README
 * que aseguraba «ninguna capa vectorial estaba encendida»: quien había pedido
 * los títulos de su área recibía un archivo sin títulos y una explicación falsa.
 * Ahora la descarga se detiene y dice por qué; para bajar solo el relieve basta
 * con apagar las capas de minería.
 *
 * @param {Object} layerVisibility  { title, request, anmService, historicalTitle }
 */
export const resolveActiveLayers = async (layerVisibility) => {
  const active = ANM_LAYERS.filter(({ key }) => layerVisibility[key])
  if (active.length === 0) return []

  const needsDiscovery = active.some(({ tenureName }) => tenureName)
  const layerNumbers = needsDiscovery ? await findTenureLayerNumbers() : {}

  return active.map(({ key, label, source, tenureName, url }) => {
    if (url) return { key, label, source, serviceUrl: url }
    const number = layerNumbers[tenureName]
    if (number === undefined) {
      if (tenureServiceUnreachable()) {
        throw new ServiceUnavailableError("La ANM no respondió al descubrir sus capas")
      }
      throw new Error(
        `La ANM ya no publica la capa «${tenureName}» con ese nombre, así que «${label}» no se puede descargar. Apágala para descargar el resto.`,
      )
    }
    return { key, label, source, serviceUrl: tenureLayerUrl(number) }
  })
}

/**
 * Consulta cada capa activa dentro del bbox y devuelve sus datos.
 *
 * Usa `fetchLayerFeatures` con `skipCache: true` para garantizar que la descarga
 * oficial en ZIP contenga siempre información fresca de la ANM y nunca datos
 * cacheados de la sesión.
 */
export const collectLayerData = async (activeLayers, bbox, options) => {
  return Promise.all(
    activeLayers.map(async (layer) => {
      const { featureCollection, truncated } = await fetchLayerFeatures(
        layer.serviceUrl,
        bbox,
        { ...options, skipCache: true },
      )
      return { ...layer, featureCollection, truncated }
    }),
  )
}

/**
 * Baja el modelo de elevación del área y lo deja escrito como GeoTIFF.
 *
 * Las teselas suelen estar ya en la caché del navegador —son las que dibujan el
 * relieve—, así que en un área que se acaba de mirar esto no sale a internet.
 * Si falla, no tumba la descarga: devuelve `{ error }` y el README dice que no
 * va, porque las capas vectoriales no dependen de él.
 *
 * @param {Object} bbox
 * @param {Object} [opciones]
 * @param {Function} [opciones.loadMosaicFn] para las pruebas; por omisión, el de `demTileLoader`
 */
export const collectDem = async (bbox, { signal, onProgress, loadMosaicFn = loadMosaic } = {}) => {
  try {
    const plan = planDemClip(bbox)
    const tiles = tilesOf(plan.range)
    const { heights, missing } = await loadMosaicFn(
      TERRAIN_TILE_TEMPLATE,
      tiles,
      { cols: plan.range.cols, rows: plan.range.rows },
      { signal, onProgress },
    )
    if (missing === tiles.length) {
      return { error: "el servidor de teselas de elevación no respondió" }
    }
    const values = cropMosaic(heights, plan.range.cols, plan.window)
    const tiff = encodeGeoTiff({
      values,
      width: plan.window.width,
      height: plan.window.height,
      originX: plan.originX,
      originY: plan.originY,
      pixelSize: plan.pixelSize,
    })
    return { tiff, plan, stats: demStats(values), missing, total: tiles.length }
  } catch (error) {
    if (signal?.aborted) throw error
    return { error: error?.message || "error desconocido" }
  }
}

/**
 * Los shapefiles de una capa, como archivos sueltos para meter en el ZIP.
 *
 * `shp-write` arma su propio ZIP; se abre y se copian sus piezas, para que el
 * usuario no encuentre un ZIP dentro del ZIP. Los anillos se invierten porque
 * ArcGIS quiere el exterior en sentido horario y GeoJSON lo da al revés: sin
 * eso ArcGIS lee los polígonos como huecos. Es lo mismo que hace la exportación
 * del expediente en `ExportComponent`.
 */
const shapefileParts = async (JSZipCtor, featureCollection, base) => {
  const features = featureCollection.features
    .filter((feature) => feature?.geometry)
    .map((feature) => ({
      type: "Feature",
      properties: feature.properties ?? {},
      geometry: rewind(feature.geometry, { reverse: true }),
    }))
  if (features.length === 0) return []

  const contenido = await shpwrite.zip(
    { type: "FeatureCollection", features },
    {
      outputType: "arraybuffer",
      folder: base,
      types: { point: `${base}_puntos`, line: `${base}_lineas`, polygon: base },
      prj: crsById(SOURCE_CRS).prj,
    },
  )
  const interno = await JSZipCtor.loadAsync(contenido)
  const partes = []
  for (const [nombre, archivo] of Object.entries(interno.files)) {
    if (archivo.dir) continue
    partes.push([nombre.split("/").pop(), await archivo.async("uint8array")])
  }
  return partes
}

/**
 * Arma el ZIP en memoria. Recibe una instancia de JSZip por parámetro en vez de
 * importarla, para poder probar el contenido en Node sin la maquinaria del
 * navegador.
 *
 * @returns {Promise<Blob|Buffer>} lo que genere el JSZip que se le pase
 */
export const buildAreaZip = async ({ JSZipCtor, layers, areaGeoJSON, bbox, generatedAt, dem = null }) => {
  const zip = new JSZipCtor()

  const readmeLayers = layers.map((layer) => ({
    label: layer.label,
    source: layer.source,
    serviceUrl: layer.serviceUrl,
    count: layer.featureCollection.features.length,
    truncated: layer.truncated,
  }))

  zip.file("README.txt", buildReadme({ layers: readmeLayers, bbox, generatedAt, dem }))
  zip.file("area.geojson", JSON.stringify(areaGeoJSON, null, 2))
  if (dem?.tiff) zip.file("dem.tif", dem.tiff)

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

  for (const layer of layers) {
    const base = nombreLibre(layer.label)
    zip.file(`${base}.geojson`, JSON.stringify(layer.featureCollection, null, 2))

    // El KML solo si hay geometría exportable; buildKml devuelve null si no.
    const kml = buildKml(layer.featureCollection, layer.label)
    if (kml) zip.file(`${base}.kml`, kml)

    // Cada capa en su carpeta: un shapefile son cuatro archivos y, con varias
    // capas sueltas en la raíz, no se ve cuáles van juntos.
    const partes = await shapefileParts(JSZipCtor, layer.featureCollection, base)
    partes.forEach(([nombre, bytes]) => zip.file(`shp/${base}/${nombre}`, bytes))
  }

  return zip.generateAsync({ type: typeof window === "undefined" ? "nodebuffer" : "blob" })
}
