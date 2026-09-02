import { useCallback, useEffect, useMemo, useRef, useState } from "react"

import {
  DERIVATIVE_LAYER_ID,
  DERIVATIVE_SOURCE_ID,
  TERRAIN_TILE_TEMPLATE,
} from "../../utils/mapStyles"
import {
  boundsAroundCenter,
  cellSizeMeters,
  demZoomFor,
  mosaicCornersOf,
  radius3DForZoom,
  tileRangeFor,
  tilesOf,
} from "../../utils/demTiles"
import { loadMosaic } from "../../utils/demTileLoader"
import { derivativePixels, slopeUnavailableReason } from "../../utils/terrainRaster"
import { debounce } from "@/lib/utils"

/**
 * Las capas derivadas del terreno —pendiente y orientación— sobre el mapa.
 *
 * No hay una capa de pendiente que pedir a nadie: se deriva del modelo de
 * elevación, aquí, en el navegador. El procedimiento es el mismo que usaría
 * cualquier SIG: se abre el trozo de modelo que hace falta, se le aplica Horn y
 * el resultado se pinta.
 *
 * En 3D (con cámara inclinada), el cálculo se acota a un radio alrededor del
 * centro enfocado para no saturar memoria descargando teselas hasta el horizonte.
 * MapLibre proyecta la imagen resultante directamente sobre la malla 3D del terreno.
 */

/** Cuánto se espera a que el usuario se quede quieto antes de recalcular. */
const REDRAW_DELAY_MS = 350

export const useTerrainRasterGL = (mapRef, mapInstance) => {
  /** `null`, `"slope"` o `"aspect"`. */
  const [mode, setMode] = useState(null)
  // El motivo por el que la capa no se está pintando, si es que no se pinta.
  const [unavailable, setUnavailable] = useState(null)
  /** `{hechas, total}` mientras se bajan teselas; `null` cuando no hay nada en curso. */
  const [progress, setProgress] = useState(null)
  /** Lado de la celda del modelo, en metros. Se enseña en la leyenda. */
  const [cellSize, setCellSize] = useState(null)

  const modeRef = useRef(mode)
  modeRef.current = mode
  /**
   * Para abandonar la pasada anterior.
   *
   * Mover el mapa mientras se están bajando teselas tiene que cancelar lo que
   * había: sin esto, la pasada vieja terminaría después de la nueva y pintaría el
   * área anterior encima de la actual.
   */
  const pasadaRef = useRef(null)

  const ocultar = useCallback(
    (motivo) => {
      const map = mapRef.current
      setUnavailable(motivo ?? null)
      setProgress(null)
      if (map?.getLayer(DERIVATIVE_LAYER_ID)) {
        map.setLayoutProperty(DERIVATIVE_LAYER_ID, "visibility", "none")
      }
    },
    [mapRef],
  )

  /**
   * Recalcula y repinta la capa con lo que se está viendo ahora mismo.
   *
   * Es asíncrona a propósito: mientras se bajan las teselas el mapa sigue vivo y
   * se puede seguir moviendo. Lo único que ocupa el hilo de la página es el
   * cálculo del final, que son unas décimas de segundo.
   */
  const redraw = useCallback(async () => {
    const map = mapRef.current
    if (!map || !map.getSource(DERIVATIVE_SOURCE_ID)) return

    // La pasada anterior, si la había, sobra.
    pasadaRef.current?.abort()

    if (!modeRef.current) {
      pasadaRef.current = null
      ocultar(null)
      setCellSize(null)
      return
    }

    const motivo = slopeUnavailableReason({ zoom: map.getZoom(), pitch: map.getPitch() })
    if (motivo) {
      pasadaRef.current = null
      ocultar(motivo)
      return
    }

    const control = new AbortController()
    pasadaRef.current = control
    const modo = modeRef.current

    const centro = map.getCenter()
    const pitch = map.getPitch()
    let limites

    if (pitch > 1) {
      // En 3D (cámara inclinada), la vista alcanza el horizonte. Para no pedir
      // cientos de teselas ni saturar la red/GPU, acotamos la escena a un radio
      // alrededor del centro que se está observando.
      const radio = radius3DForZoom(map.getZoom())
      limites = boundsAroundCenter(centro, radio)
    } else {
      const b = map.getBounds()
      limites = {
        west: b.getWest(),
        south: b.getSouth(),
        east: b.getEast(),
        north: b.getNorth(),
      }
    }

    const rango = tileRangeFor(limites, demZoomFor(map.getZoom()))
    const teselas = tilesOf(rango)

    setUnavailable(null)
    setProgress({ hechas: 0, total: teselas.length })

    let mosaico
    try {
      mosaico = await loadMosaic(TERRAIN_TILE_TEMPLATE, teselas, rango, {
        signal: control.signal,
        onProgress: (hechas, total) => {
          if (control.signal.aborted) return
          setProgress({ hechas, total })
        },
      })
    } catch {
      if (!control.signal.aborted) ocultar("No se pudo cargar el modelo de elevación.")
      return
    }

    // Entre que se pidieron las teselas y llegaron, el mapa pudo moverse o la
    // capa apagarse. Lo que se calculó ya no vale.
    if (control.signal.aborted || pasadaRef.current !== control) return
    if (modeRef.current !== modo) return

    if (mosaico.missing === teselas.length) {
      ocultar("No se pudo cargar el modelo de elevación.")
      return
    }

    const lado = cellSizeMeters(centro.lat, rango.zoom)
    const pixeles = derivativePixels(mosaico.heights, rango.cols, rango.rows, lado, modo)

    map.getSource(DERIVATIVE_SOURCE_ID).updateImage({
      // La imagen ya decodificada, sin pasar por PNG. La versión anterior hacía
      // `canvas.toDataURL()`, que vuelve a comprimir a PNG y a convertir a texto
      // en base64 dos millones de píxeles — y de paso obligaba a abrirle un
      // hueco a `data:` en la política de seguridad del sitio.
      image: new ImageData(pixeles, rango.cols, rango.rows),
      coordinates: mosaicCornersOf(rango),
    })

    map.setLayoutProperty(DERIVATIVE_LAYER_ID, "visibility", "visible")
    setCellSize(lado)
    setProgress(null)
    pasadaRef.current = null
  }, [mapRef, ocultar])

  const redrawSoon = useMemo(() => debounce(() => redraw(), REDRAW_DELAY_MS), [redraw])

  /** Enciende un modo, o lo apaga si ya estaba puesto. */
  const chooseMode = useCallback((siguiente) => {
    // Los efectos van fuera del actualizador: React puede ejecutarlo más de una
    // vez para el mismo cambio, y la lección ya costó una vez —el perfil
    // longitudinal no llegaba a activarse por esto—.
    const elegido = modeRef.current === siguiente ? null : siguiente
    modeRef.current = elegido
    setMode(elegido)
    if (!elegido) {
      setUnavailable(null)
      setCellSize(null)
    }
  }, [])

  // Al encender, y cada vez que el mapa se queda quieto.
  useEffect(() => {
    if (!mapInstance) return

    redraw()
    if (!mode) return

    mapInstance.on("moveend", redrawSoon)
    return () => {
      mapInstance.off("moveend", redrawSoon)
      redrawSoon.cancel()
    }
  }, [mapInstance, mode, redraw, redrawSoon])

  // Al desmontar, abandonar lo que estuviera bajándose.
  useEffect(() => () => pasadaRef.current?.abort(), [])

  return {
    terrainMode: mode,
    chooseTerrainMode: chooseMode,
    terrainRasterUnavailable: unavailable,
    terrainRasterProgress: progress,
    terrainRasterCellSize: cellSize,
  }
}
