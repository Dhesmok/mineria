import { escapeXml, getFeatureLabel } from "./mapUtils"

export { escapeXml }

/** KML usa lon,lat,alt separados por espacios, y espera el anillo cerrado. */
const ringToKml = (ring) => {
  const closed =
    ring.length > 1 && (ring[0][0] !== ring[ring.length - 1][0] || ring[0][1] !== ring[ring.length - 1][1])
      ? [...ring, ring[0]]
      : ring

  return closed.map(([lon, lat]) => `${lon},${lat},0`).join(" ")
}

const isUsableRing = (ring) => Array.isArray(ring) && ring.length >= 3

const polygonToKml = (rings) => {
  const [exterior, ...holes] = rings.filter(isUsableRing)
  if (!exterior) {
    return null
  }

  const inner = holes
    .map((hole) => `        <innerBoundaryIs><LinearRing><coordinates>${ringToKml(hole)}</coordinates></LinearRing></innerBoundaryIs>`)
    .join("\n")

  return [
    "      <Polygon>",
    `        <outerBoundaryIs><LinearRing><coordinates>${ringToKml(exterior)}</coordinates></LinearRing></outerBoundaryIs>`,
    inner,
    "      </Polygon>",
  ]
    .filter(Boolean)
    .join("\n")
}

const geometryToKml = (geometry) => {
  if (geometry?.type === "Polygon") {
    return polygonToKml(geometry.coordinates)
  }

  if (geometry?.type === "MultiPolygon") {
    const polygons = geometry.coordinates.map(polygonToKml).filter(Boolean)
    if (polygons.length === 0) {
      return null
    }
    // Un Placemark solo admite una geometría; las partes van dentro de MultiGeometry.
    return ["    <MultiGeometry>", ...polygons, "    </MultiGeometry>"].join("\n")
  }

  return null
}

/**
 * Construye un KML con todas las features de la colección.
 *
 * La versión anterior emitía `features[0].geometry.coordinates[0]` asumiendo siempre
 * un Polygon: con un MultiPolygon eso es un arreglo de anillos, así que producía
 * coordenadas corruptas, y además descartaba los huecos y el resto de las features.
 *
 * @param {Object} featureCollection - GeoJSON FeatureCollection en WGS84
 * @param {string} documentName - Nombre del documento KML
 * @returns {string|null} KML, o null si no hay ninguna geometría exportable
 */
export const buildKml = (featureCollection, documentName) => {
  const features = Array.isArray(featureCollection?.features) ? featureCollection.features : []

  const placemarks = features
    .map((feature) => {
      const geometry = geometryToKml(feature?.geometry)
      if (!geometry) {
        return null
      }

      return [
        "    <Placemark>",
        `      <name>${escapeXml(getFeatureLabel(feature.properties))}</name>`,
        "      <styleUrl>#polygonStyle</styleUrl>",
        geometry,
        "    </Placemark>",
      ].join("\n")
    })
    .filter(Boolean)

  if (placemarks.length === 0) {
    return null
  }

  return `<?xml version="1.0" encoding="UTF-8"?>
<kml xmlns="http://www.opengis.net/kml/2.2">
  <Document>
    <name>${escapeXml(documentName)}</name>
    <Style id="polygonStyle">
      <LineStyle>
        <color>ff00ffff</color>
        <width>2</width>
      </LineStyle>
      <PolyStyle>
        <color>00ffffff</color>
      </PolyStyle>
    </Style>
${placemarks.join("\n")}
  </Document>
</kml>`
}
