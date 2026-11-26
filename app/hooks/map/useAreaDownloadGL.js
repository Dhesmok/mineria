import { useCallback, useState } from "react"
import JSZip from "jszip"
import { saveAs } from "file-saver"

import { ServiceUnavailableError } from "../../utils/arcgis"
import {
  bboxOfFeatureCollection,
  buildAreaZip,
  collectDem,
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

      // Sin capas encendidas ya no es un error: el modelo de elevación va
      // siempre, y un área con solo su relieve es una descarga legítima —la de
      // quien va a sacar curvas de nivel o un perfil de una zona sin títulos—.
      // Antes este caso cortaba con «enciende al menos una capa de la ANM».
      const activeLayers = await resolveActiveLayers(layerVisibility)

      // Las capas y el relieve a la vez: no dependen uno del otro, y el DEM
      // suele salir de la caché del navegador.
      const [layers, dem] = await Promise.all([
        collectLayerData(activeLayers, bbox),
        collectDem(bbox),
      ])
      const generatedAt = new Date()

      // Se guarda también el polígono dibujado, para que el ZIP explique a qué
      // área corresponde lo demás. Si hay varios, van como una colección.
      const areaGeoJSON =
        polygons.length === 1 ? polygons[0] : { type: "FeatureCollection", features: polygons }

      const blob = await buildAreaZip({ JSZipCtor: JSZip, layers, areaGeoJSON, bbox, generatedAt, dem })
      saveAs(blob, `area_minera_${generatedAt.toISOString().slice(0, 10)}.zip`)
    } catch (error) {
      console.error("Error al descargar el área:", error)
      setShowErrorBanner(true)
      setError(
        error instanceof ServiceUnavailableError
          ? "El servicio de la ANM no responde y no se pudo armar la descarga. Vuelve a intentarlo, o apaga las capas de minería para bajar solo el relieve."
          : error.message || "No se pudo generar la descarga del área.",
      )
    } finally {
      setIsDownloading(false)
    }
  }, [getDrawnFeatures, layerVisibility, setError, setShowErrorBanner])

  return { isDownloading, downloadArea }
}
