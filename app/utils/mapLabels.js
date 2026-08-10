import L from "leaflet"
import { escapeXml, getFeatureLabel, getLabelCoordinates } from "./mapUtils"

// Por debajo de este zoom las etiquetas se apiñan y son ilegibles. No hay límite
// superior: el satélite llega a z22 y antes desaparecían al pasar de z19.
export const LABELS_MIN_ZOOM = 15

export const shouldShowLabels = (zoom) => zoom >= LABELS_MIN_ZOOM

/**
 * Marcador con el código del expediente, anclado en un punto interior del polígono.
 * @returns {Object|null} marcador de Leaflet, o null si la geometría no lo permite
 */
export const createLabelMarker = (feature) => {
  const point = getLabelCoordinates(feature)
  if (!point) {
    return null
  }

  const [long, lat] = point

  return L.marker([lat, long], {
    icon: L.divIcon({
      className: "map-label",
      html: `<div>${escapeXml(getFeatureLabel(feature.properties))}</div>`,
      iconSize: [100, 40],
      iconAnchor: [50, 20],
    }),
  })
}

/**
 * Mantiene el grupo de etiquetas sincronizado con las features visibles de una capa
 * de esri-leaflet.
 *
 * esri-leaflet quita del mapa los polígonos que salen del viewport y los vuelve a
 * poner al regresar, pero las etiquetas viven en un grupo aparte que nadie tocaba:
 * se acumulaban indefinidamente al navegar y quedaban flotando sobre polígonos que
 * ya no se dibujaban.
 *
 * @param {Object} featureLayer - capa de esri-leaflet
 * @param {Object} labelsLayerRef - ref al L.layerGroup de etiquetas
 * @param {Map} markers - marcadores indexados por id de feature, poblado desde onEachFeature
 */
export const syncLabelsWithFeatures = (featureLayer, labelsLayerRef, markers) => {
  featureLayer.on("removefeature", (event) => {
    const marker = markers.get(event.feature?.id)
    if (!marker) {
      return
    }
    labelsLayerRef.current?.removeLayer(marker)
    // `permanent` significa que esri-leaflet descartó la feature de su caché.
    if (event.permanent) {
      markers.delete(event.feature.id)
    }
  })

  featureLayer.on("addfeature", (event) => {
    const marker = markers.get(event.feature?.id)
    if (marker) {
      labelsLayerRef.current?.addLayer(marker)
    }
  })
}
