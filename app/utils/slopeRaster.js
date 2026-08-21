/**
 * La pendiente como capa de color sobre el mapa.
 *
 * La consulta puntual responde por un punto; esto responde por toda la pantalla
 * de un vistazo, que es como se busca «dónde hay ladera suave para una vía» o
 * «qué parte de este título es escarpada».
 *
 * **Cómo se calcula, y por qué así.** No hay una capa de pendiente que pedir a
 * nadie: hay que derivarla del modelo de elevación. Se muestrea la pantalla en
 * una rejilla, se le aplica a esa rejilla el mismo método de Horn de la consulta
 * puntual, y el resultado se pinta como imagen encima del mapa. La rejilla es de
 * pantalla y no de terreno a propósito: así el coste no depende del zoom —
 * siempre son los mismos miles de muestras— y el detalle crece solo cuando uno
 * se acerca, que es cuando hace falta.
 *
 * **Los mismos avisos que la consulta puntual**, y por la misma razón: con un
 * modelo global de ~30 m esto sirve para leer el terreno y descartar zonas, no
 * para diseño ni para estabilidad. Y por debajo de cierto zoom la rejilla de
 * pantalla es más gruesa que el propio modelo, así que la capa se apaga sola en
 * vez de enseñar una mancha suavizada que parecería un dato fino.
 *
 * Módulo puro: recibe alturas y devuelve píxeles.
 */

import { DEM_RESOLUTION_M } from "./terrainAnalysis"

/** Separación de la rejilla de muestreo, en píxeles de pantalla. */
export const SAMPLE_STEP_PX = 8

/**
 * Zoom por debajo del cual la capa no se dibuja.
 *
 * A zoom 11 cada píxel son ~76 m y la rejilla de 8 px, ~600: seis veces más
 * grueso que el modelo. Lo que saldría no es la pendiente del terreno sino la de
 * una versión suavizada de él, y se vería igual de convincente.
 */
export const SLOPE_MIN_ZOOM = 12

/**
 * La rampa de color.
 *
 * Los cortes no son decorativos: 0-5° es terreno de trabajo, hasta 15° se
 * transita sin obra, 15-30° es donde empieza a haber que cortar, y por encima de
 * 45° hablamos de escarpe. Son los umbrales con los que se lee un terreno para
 * minería, no una escala continua bonita.
 */
export const SLOPE_LEGEND = [
  { max: 5, color: [69, 148, 87], label: "0 – 5°", hint: "Plano" },
  { max: 15, color: [154, 194, 88], label: "5 – 15°", hint: "Suave" },
  { max: 30, color: [244, 208, 96], label: "15 – 30°", hint: "Moderada" },
  { max: 45, color: [226, 136, 66], label: "30 – 45°", hint: "Fuerte" },
  { max: Infinity, color: [190, 66, 61], label: "> 45°", hint: "Escarpe" },
]

/** Cuánto se deja ver el mapa por debajo de la capa. */
export const SLOPE_ALPHA = 150

/** El color de una pendiente, en RGBA. */
export const slopeColorFor = (slopeDegrees) => {
  if (!Number.isFinite(slopeDegrees)) return [0, 0, 0, 0]
  const tramo = SLOPE_LEGEND.find((t) => slopeDegrees < t.max) ?? SLOPE_LEGEND[SLOPE_LEGEND.length - 1]
  return [...tramo.color, SLOPE_ALPHA]
}

/**
 * La altura de una celda, extrapolando fuera de los bordes.
 *
 * Extrapolando y no repitiendo la celda del borde. Repetirla parece lo natural,
 * pero deja el gradiente a la mitad justo en el anillo exterior: en una ladera
 * uniforme de 45°, el borde de la capa saldría de 26°, y con una rejilla de 8 px
 * eso es una franja falsa de terreno «más suave» rodeando toda la pantalla. Se
 * vio con una rampa de prueba, que salía plana por los lados.
 *
 * La recursión llega como mucho a dos niveles por eje, y las esquinas se
 * resuelven solas al aplicarse los dos.
 */
const at = (heights, cols, rows, col, row) => {
  if (cols < 2 || rows < 2) return NaN

  if (col < 0) return 2 * at(heights, cols, rows, 0, row) - at(heights, cols, rows, 1, row)
  if (col > cols - 1) {
    return 2 * at(heights, cols, rows, cols - 1, row) - at(heights, cols, rows, cols - 2, row)
  }
  if (row < 0) return 2 * at(heights, cols, rows, col, 0) - at(heights, cols, rows, col, 1)
  if (row > rows - 1) {
    return 2 * at(heights, cols, rows, col, rows - 1) - at(heights, cols, rows, col, rows - 2)
  }

  return heights[row * cols + col]
}

/**
 * La pendiente de cada celda de la rejilla, en grados.
 *
 * En los bordes se extrapola en vez de dejar hueco: un marco transparente
 * alrededor de la capa se ve como una raya y no significa nada.
 *
 * @param {Float32Array|Array<number>} heights alturas, fila a fila de norte a sur
 * @param {number} cols columnas de la rejilla
 * @param {number} rows filas
 * @param {number} spacingMeters distancia en el terreno entre celdas vecinas
 * @returns {Float32Array} grados, una por celda; NaN donde falta el dato
 */
export const slopeGridFrom = (heights, cols, rows, spacingMeters) => {
  const salida = new Float32Array(cols * rows)

  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < cols; col++) {
      const z1 = at(heights, cols, rows, col - 1, row - 1)
      const z2 = at(heights, cols, rows, col, row - 1)
      const z3 = at(heights, cols, rows, col + 1, row - 1)
      const z4 = at(heights, cols, rows, col - 1, row)
      const z6 = at(heights, cols, rows, col + 1, row)
      const z7 = at(heights, cols, rows, col - 1, row + 1)
      const z8 = at(heights, cols, rows, col, row + 1)
      const z9 = at(heights, cols, rows, col + 1, row + 1)

      if ([z1, z2, z3, z4, z6, z7, z8, z9].some((z) => !Number.isFinite(z))) {
        salida[row * cols + col] = NaN
        continue
      }

      const dzdx = (z3 + 2 * z6 + z9 - (z1 + 2 * z4 + z7)) / (8 * spacingMeters)
      const dzdy = (z7 + 2 * z8 + z9 - (z1 + 2 * z2 + z3)) / (8 * spacingMeters)
      salida[row * cols + col] = (Math.atan(Math.hypot(dzdx, dzdy)) * 180) / Math.PI
    }
  }

  return salida
}

/**
 * Los píxeles de la capa, listos para un `ImageData`.
 *
 * @param {Float32Array} slopes grados por celda
 * @returns {Uint8ClampedArray} cuatro bytes por celda
 */
export const slopePixels = (slopes) => {
  const pixeles = new Uint8ClampedArray(slopes.length * 4)

  for (let i = 0; i < slopes.length; i++) {
    const [r, g, b, a] = slopeColorFor(slopes[i])
    pixeles[i * 4] = r
    pixeles[i * 4 + 1] = g
    pixeles[i * 4 + 2] = b
    pixeles[i * 4 + 3] = a
  }

  return pixeles
}

/**
 * ¿Tiene sentido dibujar la capa con este zoom y esta separación?
 *
 * Devuelve el motivo por el que no, para poder decírselo al usuario en vez de
 * dejar la capa encendida sin pintar nada.
 */
export const slopeUnavailableReason = ({ zoom, pitch, metrosPorPixel }) => {
  if (pitch > 1) {
    // La capa se coloca como una imagen sobre el rectángulo de pantalla, y con
    // la cámara inclinada ese rectángulo no es un rectángulo en el terreno: la
    // imagen quedaría estirada y señalando pendientes donde no las hay.
    return "La pendiente solo se dibuja con el mapa plano. Vuelve a 2D para verla."
  }

  if (zoom < SLOPE_MIN_ZOOM) {
    return "Acerca el mapa para ver la pendiente: a esta escala la rejilla sería más gruesa que el propio modelo."
  }

  const separacion = metrosPorPixel * SAMPLE_STEP_PX
  if (separacion > DEM_RESOLUTION_M * 4) {
    return "Acerca el mapa para ver la pendiente."
  }

  return null
}
