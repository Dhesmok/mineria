/**
 * Pendiente y orientación como capas de color sobre el mapa.
 *
 * La consulta puntual responde por un punto; esto responde por toda la pantalla
 * de un vistazo, que es como se busca «dónde hay ladera suave para una vía»,
 * «qué parte de este título es escarpada» o «qué laderas miran al sur».
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

/**
 * Los colores de la orientación.
 *
 * **La rampa tiene que ser circular**, y esa es toda la dificultad: el norte y
 * el noroeste son vecinos, igual que el norte y el noreste, así que una escala
 * que vaya de un color a otro de 0° a 360° deja un salto brusco justo en el
 * norte que se lee como un límite de terreno donde no lo hay. Estos ocho colores
 * cierran el círculo: el último vuelve al primero.
 *
 * Es también la razón por la que la orientación va en ocho tramos y no en una
 * escala continua: nadie lee «213°», lee «mira al suroeste».
 */
export const ASPECT_LEGEND = [
  { max: 22.5, color: [93, 122, 176], label: "N", hint: "Norte" },
  { max: 67.5, color: [110, 170, 176], label: "NE", hint: "Noreste" },
  { max: 112.5, color: [124, 178, 118], label: "E", hint: "Este" },
  { max: 157.5, color: [186, 195, 96], label: "SE", hint: "Sureste" },
  { max: 202.5, color: [222, 176, 84], label: "S", hint: "Sur" },
  { max: 247.5, color: [214, 133, 92], label: "SO", hint: "Suroeste" },
  { max: 292.5, color: [186, 106, 132], label: "O", hint: "Oeste" },
  { max: 337.5, color: [140, 108, 168], label: "NO", hint: "Noroeste" },
  { max: 360.1, color: [93, 122, 176], label: "N", hint: "Norte" },
]

/**
 * Pendiente por debajo de la cual la orientación no significa nada.
 *
 * En terreno casi llano el azimut lo decide el ruido del modelo, no el relieve:
 * dos celdas vecinas pueden salir «norte» y «sur» por una diferencia de medio
 * metro. Pintar eso sería un confeti de colores que parece información.
 */
export const ASPECT_MIN_SLOPE = 2

/** El color de una orientación, en RGBA. */
export const aspectColorFor = (aspectDegrees) => {
  if (!Number.isFinite(aspectDegrees)) return [0, 0, 0, 0]
  const normalizado = ((aspectDegrees % 360) + 360) % 360
  const tramo = ASPECT_LEGEND.find((t) => normalizado < t.max) ?? ASPECT_LEGEND[0]
  return [...tramo.color, SLOPE_ALPHA]
}

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
export const slopeGridFrom = (heights, cols, rows, spacingMeters) =>
  derivativeGridFrom(heights, cols, rows, spacingMeters).slope

/**
 * Pendiente y orientación de cada celda, en una sola pasada.
 *
 * Las dos salen de las mismas dos derivadas, así que calcularlas por separado
 * sería recorrer la rejilla dos veces para repetir la misma cuenta.
 *
 * @returns {{slope: Float32Array, aspect: Float32Array}} grados; NaN donde falta
 *   el dato, y en el azimut también donde el terreno es plano
 */
export const derivativeGridFrom = (heights, cols, rows, spacingMeters) => {
  const salida = new Float32Array(cols * rows)
  const azimut = new Float32Array(cols * rows)

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

      const i = row * cols + col

      if ([z1, z2, z3, z4, z6, z7, z8, z9].some((z) => !Number.isFinite(z))) {
        salida[i] = NaN
        azimut[i] = NaN
        continue
      }

      const dzdx = (z3 + 2 * z6 + z9 - (z1 + 2 * z4 + z7)) / (8 * spacingMeters)
      const dzdy = (z7 + 2 * z8 + z9 - (z1 + 2 * z2 + z3)) / (8 * spacingMeters)
      const magnitud = Math.hypot(dzdx, dzdy)

      salida[i] = (Math.atan(magnitud) * 180) / Math.PI
      azimut[i] =
        salida[i] < ASPECT_MIN_SLOPE
          ? NaN
          : (((90 - (Math.atan2(dzdy, -dzdx) * 180) / Math.PI) % 360) + 360) % 360
    }
  }

  return { slope: salida, aspect: azimut }
}

/**
 * Los píxeles de la capa, listos para un `ImageData`.
 *
 * @param {Float32Array} values grados por celda
 * @param {(v: number) => number[]} colorFor cómo se colorea cada valor
 * @returns {Uint8ClampedArray} cuatro bytes por celda
 */
export const rasterPixels = (values, colorFor = slopeColorFor) => {
  const pixeles = new Uint8ClampedArray(values.length * 4)

  for (let i = 0; i < values.length; i++) {
    const [r, g, b, a] = colorFor(values[i])
    pixeles[i * 4] = r
    pixeles[i * 4 + 1] = g
    pixeles[i * 4 + 2] = b
    pixeles[i * 4 + 3] = a
  }

  return pixeles
}

/** Atajo para la pendiente, que es el uso más común. */
export const slopePixels = (slopes) => rasterPixels(slopes, slopeColorFor)

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
    return "Esta capa solo se dibuja con el mapa plano. Vuelve a 2D para verla."
  }

  if (zoom < SLOPE_MIN_ZOOM) {
    return "Acerca el mapa: a esta escala la rejilla sería más gruesa que el propio modelo."
  }

  const separacion = metrosPorPixel * SAMPLE_STEP_PX
  if (separacion > DEM_RESOLUTION_M * 4) {
    return "Acerca el mapa para ver esta capa."
  }

  return null
}
