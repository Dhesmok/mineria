import * as turf from "@turf/turf"
import polylabel from "polylabel"

export const formatDistance = (meters) => {
  if (meters >= 1000) {
    return `${(meters / 1000).toFixed(2)} km`
  }
  return `${meters.toFixed(2)} m`
}

export const formatArea = (squareMeters) => {
  if (squareMeters >= 1000000) {
    return `${(squareMeters / 1000000).toFixed(2)} km²`
  }
  if (squareMeters >= 10000) {
    return `${(squareMeters / 10000).toFixed(2)} ha`
  }
  return `${squareMeters.toFixed(2)} m²`
}

export const formatDate = (value) => {
  if (!value) {
    return "N/A"
  }
  let date
  if (typeof value === "number" || /^[0-9]+$/.test(value)) {
    const timestamp = Number.parseInt(value, 10)
    date = new Date(timestamp)
  } else {
    date = new Date(value)
  }
  if (!isNaN(date.getTime())) {
    const day = ("0" + date.getUTCDate()).slice(-2)
    const month = ("0" + (date.getUTCMonth() + 1)).slice(-2)
    const year = date.getUTCFullYear()
    return `${day}/${month}/${year}`
  }
  return value || "N/A"
}

/** Grados con coma decimal, la convención local. */
export const formatDegrees = (value) => value.toFixed(5).replace(".", ",")

// Por debajo de este zoom las etiquetas se apiñan y son ilegibles. No hay límite
// superior: el satélite llega a z22 y antes desaparecían al pasar de z19.
//
// Vivía en mapLabels.js, el módulo de etiquetas de Leaflet, y se mudó aquí
// porque aquel importaba Leaflet: leer este número obligaba al visor MapLibre a
// arrastrar Leaflet entero en su descarga. mapLabels.js ya no existe.
export const LABELS_MIN_ZOOM = 15

export const shouldShowLabels = (zoom) => zoom >= LABELS_MIN_ZOOM

const ringsOfGeometry = (geometry) => {
  if (geometry?.type === "Polygon") {
    // coordinates es [exterior, hueco...]: un solo polígono.
    return [geometry.coordinates]
  }
  if (geometry?.type === "MultiPolygon") {
    // coordinates es [[exterior, hueco...], ...]: varios polígonos.
    return geometry.coordinates
  }
  return []
}

const isClosedRing = (ring) => {
  const [firstX, firstY] = ring[0]
  const [lastX, lastY] = ring[ring.length - 1]
  return firstX === lastX && firstY === lastY
}

/**
 * Aplana una FeatureCollection en los anillos que la componen, conservando a qué
 * polígono pertenece cada uno para poder numerarlos y separarlos en la tabla.
 *
 * Recorre todas las features, no solo la primera, y quita el vértice de cierre que
 * GeoJSON repite al final de cada anillo. La comprobación anterior era
 * `ring[0] === ring[ring.length - 1]`, que compara dos arreglos por referencia y por
 * tanto siempre daba falso: el vértice duplicado nunca se eliminaba.
 *
 * @param {Object} featureCollection - GeoJSON FeatureCollection
 * @returns {Array<{polygonNumber: number, isHole: boolean, label: string, coordinates: Array}>}
 */
export const extractRings = (featureCollection) => {
  const rings = []
  let polygonNumber = 0

  const features = Array.isArray(featureCollection?.features) ? featureCollection.features : []

  features.forEach((feature) => {
    ringsOfGeometry(feature?.geometry).forEach((polygonRings) => {
      const presentRings = (Array.isArray(polygonRings) ? polygonRings : []).filter(
        (ring) => Array.isArray(ring) && ring.length > 0,
      )
      if (presentRings.length === 0) {
        return
      }

      polygonNumber += 1

      presentRings.forEach((ring, ringIndex) => {
        const coordinates = ring.length > 1 && isClosedRing(ring) ? ring.slice(0, -1) : ring
        if (coordinates.length === 0) {
          return
        }

        const isHole = ringIndex > 0
        rings.push({
          polygonNumber,
          isHole,
          label: isHole ? `Polígono ${polygonNumber} · hueco ${ringIndex}` : `Polígono ${polygonNumber}`,
          coordinates,
        })
      })
    })
  })

  return rings
}

// Un anillo GeoJSON válido necesita al menos 4 posiciones (la última repite la primera).
const MIN_RING_POSITIONS = 4
// polylabel se detiene cuando ya no puede mejorar más que la precisión pedida.
// Una milésima del tamaño del polígono da una posición sub-métrica sin encarecer el cálculo.
const LABEL_PRECISION_RATIO = 1 / 1000
const MIN_LABEL_PRECISION = 1e-7

const isUsableRing = (ring) => Array.isArray(ring) && ring.length >= MIN_RING_POSITIONS

const usableRingsOf = (rings) => (Array.isArray(rings) ? rings.filter(isUsableRing) : [])

/**
 * polylabel interpreta la precisión en las mismas unidades que las coordenadas.
 * Trabajando en grados, un valor fijo como 0.1 equivale a ~11 km: el algoritmo se
 * detiene en la primera iteración y devuelve un vértice del borde en lugar de un
 * punto interior. Escalarla al tamaño del polígono la hace correcta a cualquier escala.
 */
const precisionForRing = (ring) => {
  let minX = Infinity
  let minY = Infinity
  let maxX = -Infinity
  let maxY = -Infinity

  for (const [x, y] of ring) {
    if (x < minX) minX = x
    if (x > maxX) maxX = x
    if (y < minY) minY = y
    if (y > maxY) maxY = y
  }

  const size = Math.max(maxX - minX, maxY - minY)
  if (!Number.isFinite(size) || size <= 0) {
    return MIN_LABEL_PRECISION
  }
  return Math.max(size * LABEL_PRECISION_RATIO, MIN_LABEL_PRECISION)
}

const interiorPointOf = (rings) => {
  const validRings = usableRingsOf(rings)
  if (validRings.length === 0) {
    return null
  }

  const candidate = polylabel(validRings, precisionForRing(validRings[0]))
  const point = [candidate[0], candidate[1]]

  // `ignoreBoundary` es imprescindible: sin él un punto que cae justo sobre el borde
  // cuenta como interior y el respaldo nunca se activa.
  const isInside = turf.booleanPointInPolygon(turf.point(point), turf.polygon(validRings), {
    ignoreBoundary: true,
  })

  return isInside ? point : turf.pointOnFeature(turf.polygon(validRings)).geometry.coordinates
}

/**
 * Punto interior donde anclar la etiqueta de una feature.
 * Nunca lanza: esri-leaflet aborta el lote completo de features si `onEachFeature` falla.
 * @param {Object} feature - GeoJSON Feature
 * @returns {Array|null} [long, lat], o null si la geometría no permite ubicar la etiqueta
 */
export const getLabelCoordinates = (feature) => {
  try {
    const geometry = feature?.geometry
    if (!geometry) {
      return null
    }

    const { type, coordinates } = geometry

    if (type === "Polygon") {
      return interiorPointOf(coordinates)
    }

    if (type === "MultiPolygon") {
      let bestPoint = null
      let largestArea = 0

      for (const polygonCoords of coordinates) {
        const rings = usableRingsOf(polygonCoords)
        if (rings.length === 0) {
          continue
        }

        const area = turf.area(turf.polygon(rings))
        if (bestPoint && area <= largestArea) {
          continue
        }

        const point = interiorPointOf(rings)
        if (!point) {
          continue
        }

        bestPoint = point
        largestArea = area
      }

      return bestPoint
    }

    // Puntos, líneas y demás: un punto sobre la geometría es mejor que [0, 0],
    // que dejaba la etiqueta en la Isla Nula (0°N 0°E).
    return turf.pointOnFeature(feature).geometry.coordinates
  } catch (error) {
    console.error("No se pudo calcular la posición de la etiqueta:", error)
    return null
  }
}

/**
 * Texto de la etiqueta. Las capas de Subcontratos e Histórico no exponen TENURE_ID,
 * por eso el respaldo a CODIGO_EXPEDIENTE.
 */
export const getFeatureLabel = (properties) =>
  properties?.TENURE_ID || properties?.CODIGO_EXPEDIENTE || "N/A"

const MARKUP_ENTITIES = {
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  '"': "&quot;",
  "'": "&apos;",
}

/**
 * Escapa los cinco caracteres reservados de XML/HTML. Los atributos de la ANM se
 * interpolan en HTML (popups, etiquetas) y en XML (KML) sin ningún saneamiento.
 */
export const escapeXml = (value) => String(value ?? "").replace(/[&<>"']/g, (char) => MARKUP_ENTITIES[char])

const field = (value) => escapeXml(value || "N/A")

const row = (label, value) => `<p><strong>${label}:</strong> ${value}</p>`

/** Fila que solo aparece si hay dato: sirve para campos propios de una sola capa. */
const optionalRow = (label, value) => (value ? row(label, field(value)) : "")

export const createPopupContent = (properties = {}) => {
  const area =
    typeof properties.AREA_HA === "number" ? properties.AREA_HA.toFixed(4) : properties.AREA_HA || "N/A"

  // Los respaldos no son adorno: cada capa de la ANM bautiza sus campos a su
  // manera. La de Subcontratos, por ejemplo, no trae TITULO_ESTADO ni
  // SOLICITANTES_O_TITULARES sino ESTADO y NOMBRE_DE_TITULAR, así que la ficha
  // mostraba "N/A" en ocho de trece filas teniendo el dato al lado —incluido el
  // nombre del titular, que suele ser lo primero que uno quiere ver—. Los
  // nombres se comprobaron contra respuestas reales de los cuatro servicios.
  const estado = properties.TITULO_ESTADO || properties.STATUS || properties.ESTADO
  const titulares = properties.SOLICITANTES_O_TITULARES || properties.NOMBRE_DE_TITULAR
  // GRUPO_DE_TRABAJO de Subcontratos trae valores como "PAR CARTAGENA": es el
  // mismo dato con otro nombre.
  const par = properties.PAR || properties.GRUPO_DE_TRABAJO

  return `
    <div class="popup-content">
      <h3>Información del Expediente</h3>
      ${row("Código Expediente", field(properties.CODIGO_EXPEDIENTE || properties.TENURE_ID))}
      ${row("Modalidad", field(properties.MODALIDAD))}
      ${row("Estado del Título", field(estado))}
      ${row("Área (ha)", escapeXml(area))}
      ${row("Clasificación Minería", field(properties.CLASIFICACION_MINERIA))}
      ${row("Etapa", field(properties.ETAPA))}
      ${row("Solicitantes o Titulares", field(titulares))}
      ${row("Minerales", field(properties.MINERALES))}
      ${row("Fecha de Solicitud", escapeXml(formatDate(properties.FECHA_DE_SOLICITUD)))}
      ${row("Fecha de Expedición", escapeXml(formatDate(properties.FECHA_DE_EXPEDICION)))}
      ${row("Fecha de Aniversario", escapeXml(formatDate(properties.FECHA_DE_ANIVERSARIO)))}
      ${row("Fecha de Expiración", escapeXml(formatDate(properties.FECHA_DE_EXPIRACION)))}
      ${row("PAR", field(par))}
      ${
        // La fecha de inscripción NO se usa como respaldo de la fecha de
        // solicitud aunque solo la traiga Subcontratos: inscribir y solicitar
        // son actos distintos, y ponerle la etiqueta equivocada a una fecha en
        // un expediente minero es peor que no mostrarla. Va en su propia fila, y
        // solo cuando existe, para no añadir un "N/A" más a las otras capas.
        properties.FECHA_DE_INSCRIPCION
          ? row("Fecha de Inscripción", escapeXml(formatDate(properties.FECHA_DE_INSCRIPCION)))
          : ""
      }
      ${optionalRow("Terminación", properties.TIPO_TERMINACION)}
    </div>
  `
}
