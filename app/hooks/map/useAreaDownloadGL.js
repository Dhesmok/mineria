import { useCallback, useState } from "react"
import JSZip from "jszip"
import { saveAs } from "file-saver"

import {
  bboxOfFeatureCollection,
  buildAreaZip,
  collectLayerData,
  resolveActiveLayers,
} from "../../utils/bboxDownload"

/**
 * Orquesta la descarga por área: junta el polígono dibujado, las capas
 * encendidas y el empaquetado en ZIP. La lógica pura vive en `bboxDownload.js`;
 * aquí solo se encadenan los pasos, se maneja el estado de "descargando" y se
 * dispara el guardado del archivo.
 */
export const useAreaDownloadGL = (getDrawnFeatures, layerVisibility, setError, setShowErrorBanner) => {
  const [isDownloading, setIsDownloading] = useState(false)

  const downloadArea = useCallback(async () => {
    setIsDownloading(true)
    // Limpiar un aviso anterior al reintentar: si no, tras encender una capa y
    // descargar bien, el banner de "enciende una capa" seguía en pantalla.
    setShowErrorBanner(false)
    setError(null)
    try {
      // Solo cuentan los polígonos: una línea o un punto dibujados no definen un
      // área de la que descargar.
      const drawn = getDrawnFeatures()
      const polygons = (drawn.features || []).filter(
        (feature) =>
          feature?.geometry?.type === "Polygon" || feature?.geometry?.type === "MultiPolygon",
      )

      const bbox = bboxOfFeatureCollection({ features: polygons })
      if (!bbox) {
        throw new Error("Dibuja un polígono sobre el mapa antes de descargar el área.")
      }

      const activeLayers = await resolveActiveLayers(layerVisibility)
      if (activeLayers.length === 0) {
        throw new Error("Enciende al menos una capa de la ANM antes de descargar.")
      }

      const layers = await collectLayerData(activeLayers, bbox)
      const generatedAt = new Date()

      // Se guarda también el polígono dibujado, para que el ZIP explique a qué
      // área corresponde lo demás. Si hay varios, van como una colección.
      const areaGeoJSON =
        polygons.length === 1 ? polygons[0] : { type: "FeatureCollection", features: polygons }

      const blob = await buildAreaZip({ JSZipCtor: JSZip, layers, areaGeoJSON, bbox, generatedAt })
      saveAs(blob, `area_minera_${generatedAt.toISOString().slice(0, 10)}.zip`)
    } catch (error) {
      console.error("Error al descargar el área:", error)
      setShowErrorBanner(true)
      setError(error.message || "No se pudo generar la descarga del área.")
    } finally {
      setIsDownloading(false)
    }
  }, [getDrawnFeatures, layerVisibility, setError, setShowErrorBanner])

  return { isDownloading, downloadArea }
}
