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

/**
 * Función auxiliar para obtener un punto interno usando polylabel
 * @param {Object} feature - GeoJSON Feature (Polygon o MultiPolygon)
 * @returns {Array} [long, lat] del punto más "interno" del polígono
 */
export const getLabelCoordinates = (feature) => {
  const { type, coordinates } = feature.geometry

  if (type === "Polygon") {
    let bestPoint = polylabel(coordinates, 0.1)
    if (
      !turf.booleanPointInPolygon(
        turf.point(bestPoint),
        turf.polygon(coordinates),
      )
    ) {
      bestPoint = turf.pointOnFeature(feature).geometry.coordinates
    }
    return bestPoint
  } else if (type === "MultiPolygon") {
    let largestArea = 0
    let bestOverallPoint = [0, 0]
    let polygonForBestPoint = null
    for (const polygonCoords of coordinates) {
      let labelPoint = polylabel(polygonCoords, 0.1)
      if (
        !turf.booleanPointInPolygon(
          turf.point(labelPoint),
          turf.polygon(polygonCoords),
        )
      ) {
        labelPoint = turf.pointOnFeature(turf.polygon(polygonCoords)).geometry.coordinates
      }
      const area = turf.area(turf.polygon(polygonCoords))
      if (area > largestArea) {
        largestArea = area
        bestOverallPoint = labelPoint
        polygonForBestPoint = polygonCoords
      }
    }
    if (
      polygonForBestPoint &&
      !turf.booleanPointInPolygon(
        turf.point(bestOverallPoint),
        turf.polygon(polygonForBestPoint),
      )
    ) {
      bestOverallPoint = turf.pointOnFeature(feature).geometry.coordinates
    }
    return bestOverallPoint
  }
  return [0, 0]
}

export const createPopupContent = (properties) => {
  return `
    <div class="popup-content">
      <h3>Información del Expediente</h3>
      <p><strong>Código Expediente:</strong> ${properties.CODIGO_EXPEDIENTE || properties.TENURE_ID || "N/A"}</p>
      <p><strong>Modalidad:</strong> ${properties.MODALIDAD || "N/A"}</p>
      <p><strong>Estado del Título:</strong> ${properties.TITULO_ESTADO || properties.STATUS || "N/A"}</p>
      <p><strong>Área (ha):</strong> ${
        typeof properties.AREA_HA === "number" ? properties.AREA_HA.toFixed(4) : properties.AREA_HA || "N/A"
      }</p>
      <p><strong>Clasificación Minería:</strong> ${properties.CLASIFICACION_MINERIA || "N/A"}</p>
      <p><strong>Etapa:</strong> ${properties.ETAPA || "N/A"}</p>
      <p><strong>Solicitantes o Titulares:</strong> ${properties.SOLICITANTES_O_TITULARES || "N/A"}</p>
      <p><strong>Minerales:</strong> ${properties.MINERALES || "N/A"}</p>
      <p><strong>Fecha de Solicitud:</strong> ${formatDate(properties.FECHA_DE_SOLICITUD)}</p>
      <p><strong>Fecha de Expedición:</strong> ${formatDate(properties.FECHA_DE_EXPEDICION)}</p>
      <p><strong>Fecha de Aniversario:</strong> ${formatDate(properties.FECHA_DE_ANIVERSARIO)}</p>
      <p><strong>Fecha de Expiración:</strong> ${formatDate(properties.FECHA_DE_EXPIRACION)}</p>
      <p><strong>PAR:</strong> ${properties.PAR || "N/A"}</p>
    </div>
  `
}
