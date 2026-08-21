import { useCallback, useEffect, useMemo, useRef, useState } from "react"

import { DERIVATIVE_LAYER_ID, DERIVATIVE_SOURCE_ID, TERRAIN_SOURCE_ID } from "../../utils/mapStyles"
import { metersPerPixel } from "../../utils/imageExport"
import {
  SAMPLE_STEP_PX,
  aspectColorFor,
  derivativeGridFrom,
  rasterPixels,
  slopeColorFor,
  slopeUnavailableReason,
} from "../../utils/terrainRaster"
import { debounce } from "@/lib/utils"

/**
 * Las capas derivadas del terreno —pendiente y orientación— sobre el mapa.
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
 *
 * Las dos capas comparten todo salvo el color, y por eso comparten hook: las dos
 * salen de las mismas dos derivadas, así que tenerlas separadas sería recorrer
 * la rejilla dos veces para repetir la misma cuenta. Solo una puede estar
 * encendida a la vez: superpuestas no se lee ninguna.
 */

/** Cuánto se espera a que el usuario se quede quieto antes de recalcular. */
const REDRAW_DELAY_MS = 350

export const useTerrainRasterGL = (mapRef, mapInstance, { setTerrainForQuery }) => {
  /** `null`, `"slope"` o `"aspect"`. */
  const [mode, setMode] = useState(null)
  // El motivo por el que la capa no se está pintando, si es que no se pinta.
  const [unavailable, setUnavailable] = useState(null)

  const modeRef = useRef(mode)
  modeRef.current = mode
  const canvasRef = useRef(null)

  /**
   * Recalcula y repinta la capa con lo que se está viendo ahora mismo.
   *
   * Todo el trabajo pesado —las consultas de altura— pasa aquí, y por eso está
   * detrás de un aplazamiento y no colgado de `move`.
   */
  const redraw = useCallback(() => {
    const map = mapRef.current
    if (!map || !map.getSource(DERIVATIVE_SOURCE_ID)) return

    if (!modeRef.current) {
      map.setLayoutProperty(DERIVATIVE_LAYER_ID, "visibility", "none")
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
      map.setLayoutProperty(DERIVATIVE_LAYER_ID, "visibility", "none")
      return
    }

    if (!map.getTerrain()) {
      setUnavailable("El modelo de elevación todavía no está listo.")
      map.setLayoutProperty(DERIVATIVE_LAYER_ID, "visibility", "none")
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

    const { slope, aspect } = derivativeGridFrom(alturas, cols, rows, mpp * SAMPLE_STEP_PX)
    const valores = modeRef.current === "aspect" ? aspect : slope
    const colorear = modeRef.current === "aspect" ? aspectColorFor : slopeColorFor

    const canvas = canvasRef.current ?? document.createElement("canvas")
    canvasRef.current = canvas
    canvas.width = cols
    canvas.height = rows
    const ctx = canvas.getContext("2d")
    ctx.putImageData(new ImageData(rasterPixels(valores, colorear), cols, rows), 0, 0)

    // Las cuatro esquinas del rectángulo muestreado, en coordenadas. Con el mapa
    // plano son las esquinas de la pantalla; el orden es el que espera MapLibre:
    // arriba-izquierda, arriba-derecha, abajo-derecha, abajo-izquierda.
    const esquina = (x, y) => {
      const p = map.unproject([x, y])
      return [p.lng, p.lat]
    }
    const anchoMuestreado = (cols - 1) * SAMPLE_STEP_PX
    const altoMuestreado = (rows - 1) * SAMPLE_STEP_PX

    map.getSource(DERIVATIVE_SOURCE_ID).updateImage({
      url: canvas.toDataURL("image/png"),
      coordinates: [
        esquina(0, 0),
        esquina(anchoMuestreado, 0),
        esquina(anchoMuestreado, altoMuestreado),
        esquina(0, altoMuestreado),
      ],
    })

    map.setLayoutProperty(DERIVATIVE_LAYER_ID, "visibility", "visible")
  }, [mapRef])

  const redrawSoon = useMemo(() => debounce(() => redraw(), REDRAW_DELAY_MS), [redraw])

  /** Enciende un modo, o lo apaga si ya estaba puesto. */
  const chooseMode = useCallback(
    (siguiente) => {
      setMode((actual) => {
        const elegido = actual === siguiente ? null : siguiente
        // Estas capas necesitan el terreno puesto para poder preguntar alturas,
        // pero no necesitan que el mapa esté inclinado.
        setTerrainForQuery(Boolean(elegido))
        modeRef.current = elegido
        if (!elegido) setUnavailable(null)
        return elegido
      })
    },
    [setTerrainForQuery],
  )

  // Al encender, y cada vez que el mapa se queda quieto.
  useEffect(() => {
    if (!mapInstance) return
    if (!mode) {
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
  }, [mapInstance, mode, redraw, redrawSoon])

  return { terrainMode: mode, chooseTerrainMode: chooseMode, terrainRasterUnavailable: unavailable }
}
