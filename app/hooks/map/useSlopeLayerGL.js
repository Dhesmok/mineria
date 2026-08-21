import { useCallback, useEffect, useMemo, useRef, useState } from "react"

import { SLOPE_LAYER_ID, SLOPE_SOURCE_ID, TERRAIN_SOURCE_ID } from "../../utils/mapStyles"
import { metersPerPixel } from "../../utils/imageExport"
import {
  SAMPLE_STEP_PX,
  slopeGridFrom,
  slopePixels,
  slopeUnavailableReason,
} from "../../utils/slopeRaster"
import { debounce } from "@/lib/utils"

/**
 * La capa de pendiente sobre el mapa.
 *
 * No hay una capa de pendiente que pedir a nadie: se deriva del modelo de
 * elevación, aquí, en el navegador. El procedimiento es el mismo que usaría
 * cualquier SIG, solo que sobre lo que se está viendo en vez de sobre un
 * archivo: se muestrea la pantalla en una rejilla, se le pregunta la altura al
 * terreno en cada nodo, se aplica Horn y el resultado se pinta como una imagen.
 *
 * **Tres decisiones que valen la pena explicar.**
 *
 * La rejilla es de pantalla y no de terreno: así el coste no depende del zoom
 * —siempre son los mismos miles de muestras— y el detalle crece solo cuando uno
 * se acerca, que es cuando hace falta.
 *
 * Solo funciona con el mapa plano. La imagen se coloca sobre el rectángulo que
 * se ve, y con la cámara inclinada ese rectángulo no es un rectángulo en el
 * terreno: la capa saldría estirada, señalando pendientes donde no las hay. En
 * vez de dibujar algo que miente, se dice por qué no se dibuja.
 *
 * Y se recalcula al terminar de mover, no mientras se mueve: son diez mil
 * consultas de altura, y hacerlas por fotograma dejaría el mapa inservible.
 */

/** Cuánto se espera a que el usuario se quede quieto antes de recalcular. */
const REDRAW_DELAY_MS = 350

export const useSlopeLayerGL = (mapRef, mapInstance, { setTerrainForQuery }) => {
  const [showSlope, setShowSlope] = useState(false)
  // El motivo por el que la capa no se está pintando, si es que no se pinta.
  const [unavailable, setUnavailable] = useState(null)

  const showSlopeRef = useRef(showSlope)
  showSlopeRef.current = showSlope
  const canvasRef = useRef(null)

  /**
   * Recalcula y repinta la capa con lo que se está viendo ahora mismo.
   *
   * Todo el trabajo pesado —las consultas de altura— pasa aquí, y por eso está
   * detrás de un aplazamiento y no colgado de `move`.
   */
  const redraw = useCallback(() => {
    const map = mapRef.current
    if (!map || !map.getSource(SLOPE_SOURCE_ID)) return

    if (!showSlopeRef.current) {
      map.setLayoutProperty(SLOPE_LAYER_ID, "visibility", "none")
      return
    }

    const centro = map.getCenter()
    const mpp = metersPerPixel(centro.lat, map.getZoom())
    const motivo = slopeUnavailableReason({
      zoom: map.getZoom(),
      pitch: map.getPitch(),
      metrosPorPixel: mpp,
    })

    setUnavailable(motivo)
    if (motivo) {
      map.setLayoutProperty(SLOPE_LAYER_ID, "visibility", "none")
      return
    }

    if (!map.getTerrain()) {
      setUnavailable("El modelo de elevación todavía no está listo.")
      map.setLayoutProperty(SLOPE_LAYER_ID, "visibility", "none")
      return
    }

    const lienzo = map.getCanvas()
    const ancho = lienzo.clientWidth
    const alto = lienzo.clientHeight
    const cols = Math.floor(ancho / SAMPLE_STEP_PX) + 1
    const rows = Math.floor(alto / SAMPLE_STEP_PX) + 1
    if (cols < 3 || rows < 3) return

    const exageracion = map.getTerrain()?.exaggeration ?? 1
    const alturas = new Float32Array(cols * rows)

    for (let row = 0; row < rows; row++) {
      for (let col = 0; col < cols; col++) {
        const punto = map.unproject([col * SAMPLE_STEP_PX, row * SAMPLE_STEP_PX])
        const cruda = map.queryTerrainElevation(punto)
        // La misma trampa de siempre: `queryTerrainElevation` devuelve la altura
        // multiplicada por la exageración. Con 1,5×, una ladera de 30° saldría
        // de 42° y nadie avisaría.
        alturas[row * cols + col] =
          cruda === null || cruda === undefined ? NaN : cruda / (exageracion || 1)
      }
    }

    const pendientes = slopeGridFrom(alturas, cols, rows, mpp * SAMPLE_STEP_PX)

    const canvas = canvasRef.current ?? document.createElement("canvas")
    canvasRef.current = canvas
    canvas.width = cols
    canvas.height = rows
    const ctx = canvas.getContext("2d")
    ctx.putImageData(new ImageData(slopePixels(pendientes), cols, rows), 0, 0)

    // Las cuatro esquinas del rectángulo muestreado, en coordenadas. Con el mapa
    // plano son las esquinas de la pantalla; el orden es el que espera MapLibre:
    // arriba-izquierda, arriba-derecha, abajo-derecha, abajo-izquierda.
    const esquina = (x, y) => {
      const p = map.unproject([x, y])
      return [p.lng, p.lat]
    }
    const anchoMuestreado = (cols - 1) * SAMPLE_STEP_PX
    const altoMuestreado = (rows - 1) * SAMPLE_STEP_PX

    map.getSource(SLOPE_SOURCE_ID).updateImage({
      url: canvas.toDataURL("image/png"),
      coordinates: [
        esquina(0, 0),
        esquina(anchoMuestreado, 0),
        esquina(anchoMuestreado, altoMuestreado),
        esquina(0, altoMuestreado),
      ],
    })

    map.setLayoutProperty(SLOPE_LAYER_ID, "visibility", "visible")
  }, [mapRef])

  const redrawSoon = useMemo(() => debounce(() => redraw(), REDRAW_DELAY_MS), [redraw])

  const toggleSlope = useCallback(() => {
    setShowSlope((actual) => {
      const siguiente = !actual
      // La pendiente necesita el terreno puesto para poder preguntar alturas,
      // pero no necesita que el mapa esté inclinado.
      setTerrainForQuery(siguiente)
      showSlopeRef.current = siguiente
      if (!siguiente) setUnavailable(null)
      return siguiente
    })
  }, [setTerrainForQuery])

  // Al encender, y cada vez que el mapa se queda quieto.
  useEffect(() => {
    if (!mapInstance) return
    if (!showSlope) {
      redraw()
      return
    }

    // Un primer intento en cuanto se enciende, y otro cuando el terreno termine
    // de cargar: al principio las consultas de altura vuelven vacías.
    redraw()
    mapInstance.on("moveend", redrawSoon)
    mapInstance.on("sourcedata", onSourceData)

    function onSourceData(evento) {
      if (evento.sourceId === TERRAIN_SOURCE_ID && evento.isSourceLoaded) redrawSoon()
    }

    return () => {
      mapInstance.off("moveend", redrawSoon)
      mapInstance.off("sourcedata", onSourceData)
      redrawSoon.cancel()
    }
  }, [mapInstance, showSlope, redraw, redrawSoon])

  return { showSlope, toggleSlope, slopeUnavailable: unavailable }
}
