/**
 * Pendiente y orientación como capas de color sobre el mapa.
 *
 * La consulta puntual responde por un punto; esto responde por toda la pantalla
 * de un vistazo, que es como se busca «dónde hay ladera suave para una vía»,
 * «qué parte de este título es escarpada» o «qué laderas miran al sur».
 *
 * **Cómo se calcula, y por qué así.** No hay una capa de pendiente que pedir a
 * nadie: hay que derivarla del modelo de elevación. Se bajan las teselas del
 * modelo que cubren lo que se está viendo, se pegan en un solo arreglo de
 * alturas, se le aplica a ese arreglo el mismo método de Horn de la consulta
 * puntual, y el resultado se pinta como imagen encima del mapa.
 *
 * **La rejilla es la del modelo, no la de la pantalla, y ese cambio importa.**
 * Antes se muestreaba cada 8 píxeles de pantalla: la misma ladera daba 22° a un
 * zoom y 19° a otro, porque lo que cambiaba no era el terreno sino el tamaño de
 * la ventana con que se lo miraba. Ahora la celda es la del modelo y la pendiente
 * de una ladera es un número, no una impresión. Es también lo que hace QGIS.
 *
 * **Los mismos avisos que la consulta puntual**, y por la misma razón: con un
 * modelo global de ~30 m esto sirve para leer el terreno y descartar zonas, no
 * para diseño ni para estabilidad.
 *
 * Módulo puro: recibe alturas y devuelve píxeles.
 */

import { DEM_MIN_ZOOM } from "./demTiles"
import { DEM_RESOLUTION_M } from "./terrainAnalysis"

/**
 * Zoom del mapa por debajo del cual la capa no se dibuja.
 *
 * Ya no es una limitación del método —el cálculo es correcto a cualquier escala—
 * sino de lo que significa el resultado: ahí abajo las celdas pasan de 150 m y lo
 * que se pinta es la pendiente de un terreno tan generalizado que ya no responde
 * a la pregunta con que se abrió la capa.
 *
 * El «menos uno» es el mismo desfase de convenio de `demZoomFor`: este número se
 * compara contra el zoom de MapLibre, que cuenta con teselas de 512 px, y
 * `DEM_MIN_ZOOM` está en niveles de teselas de 256.
 */
export const SLOPE_MIN_ZOOM = DEM_MIN_ZOOM - 1

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
 *
 * **`derivativePixels` hace lo contrario a propósito, y conviene saber por qué**
 * para no leerlo como una contradicción. Aquella franja falsa la medía una
 * rejilla de 8 píxeles de pantalla: el anillo exterior era una banda gruesa y
 * bien visible. La capa de color trabaja sobre la rejilla del modelo, donde ese
 * anillo es **una celda** de menos de un píxel en pantalla y además queda tapado
 * por el mosaico vecino, porque las teselas se piden con margen. A cambio,
 * recortar es lo que permite resolver el borde sin meter una condición en la
 * pasada rápida —dos millones de comprobaciones para que se cumplan en cuatro
 * mil—. Es lo mismo que hace GDAL con `-compute_edges`.
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
 * Los cortes de la leyenda, guardados como tangente al cuadrado.
 *
 * **Aquí está el truco que hace que esto vuele, y no es una aproximación.** La
 * pendiente no se pinta en grados: se pinta en cinco tramos. Y como la tangente
 * crece siempre, preguntar «¿esta ladera pasa de 15°?» es *exactamente* lo mismo
 * que preguntar «¿la magnitud del gradiente pasa de tan 15°?». Comparar contra
 * cinco constantes da el mismo color que calcular el ángulo, sin llamar a `atan`
 * ni una vez.
 *
 * Medido sobre una tesela de 256×256: la cuenta de Horn son 0,5 ms y las dos
 * llamadas trigonométricas por celda, 6,4. Trece de cada catorce milisegundos se
 * iban en convertir a grados un número que después se tiraba.
 *
 * Al cuadrado para no tener que sacar la raíz de la magnitud tampoco.
 */
const SLOPE_TAN2_CUTS = SLOPE_LEGEND.map((tramo) =>
  Number.isFinite(tramo.max) ? Math.tan((tramo.max * Math.PI) / 180) ** 2 : Infinity,
)

/** Igual, para el umbral por debajo del cual la orientación es ruido. */
const ASPECT_MIN_TAN2 = Math.tan((ASPECT_MIN_SLOPE * Math.PI) / 180) ** 2

/** Las paletas en plano, para no crear un arreglo de color por celda. */
const paletaDe = (leyenda) => {
  const bytes = new Uint8Array(leyenda.length * 4)
  leyenda.forEach((tramo, i) => {
    bytes[i * 4] = tramo.color[0]
    bytes[i * 4 + 1] = tramo.color[1]
    bytes[i * 4 + 2] = tramo.color[2]
    bytes[i * 4 + 3] = SLOPE_ALPHA
  })
  return bytes
}

const SLOPE_PALETTE = paletaDe(SLOPE_LEGEND)
// Los ocho rumbos; el noveno de la leyenda es el norte repetido para cerrar el
// círculo y aquí sobra.
const ASPECT_PALETTE = paletaDe(ASPECT_LEGEND.slice(0, 8))

/** En qué tramo de la leyenda cae una magnitud de gradiente al cuadrado. */
const tramoDePendiente = (magnitud2) => {
  for (let i = 0; i < SLOPE_TAN2_CUTS.length; i++) {
    if (magnitud2 < SLOPE_TAN2_CUTS[i]) return i
  }
  return SLOPE_TAN2_CUTS.length - 1
}

/**
 * En qué rumbo de los ocho mira una ladera.
 *
 * **Este sí conserva `atan2`, y es una decisión, no un olvido.** Se podría sacar
 * el octante con ocho comparaciones de signo y ahorrar unos 60 ms por pantalla.
 * Pero esas ocho comparaciones son ilegibles y fáciles de equivocar en un signo,
 * y un error de signo aquí no rompe nada: pinta las laderas del norte de color de
 * sur y nadie lo nota hasta que alguien planea algo con ese mapa. El truco de la
 * pendiente se puede leer y comprobar de un vistazo; este no.
 */
const tramoDeOrientacion = (dzdx, dzdy) => {
  const azimut = (((90 - (Math.atan2(dzdy, -dzdx) * 180) / Math.PI) % 360) + 360) % 360
  return Math.floor((azimut + 22.5) / 45) % 8
}

/**
 * De las alturas a los píxeles de la capa, en una sola pasada.
 *
 * Es la función que sustituyó al bucle que congelaba el navegador. Lo que cambió
 * no es la cuenta —sigue siendo Horn sobre 3×3— sino de dónde salen las alturas:
 * antes se le preguntaban al motor de mapa una por una, ahora ya están en el
 * arreglo que se recibe. Ver la cabecera de `demTiles.js`.
 *
 * El interior de la rejilla va sin ninguna llamada a función: son ocho lecturas
 * de arreglo y aritmética. El borde se resuelve aparte, pegándose a la celda de
 * al lado, porque son unos pocos miles de celdas y no vale la pena meterle a la
 * pasada rápida una condición que se comprueba dos millones de veces para que se
 * cumpla en cuatro mil.
 *
 * @param {Float32Array} heights alturas del mosaico, fila a fila de norte a sur
 * @param {number} cols columnas del mosaico
 * @param {number} rows filas
 * @param {number} spacingMeters lado de la celda sobre el terreno
 * @param {"slope"|"aspect"} mode qué se pinta
 * @returns {Uint8ClampedArray} cuatro bytes por celda, transparente donde falta el dato
 */
export const derivativePixels = (heights, cols, rows, spacingMeters, mode = "slope") => {
  const pixeles = new Uint8ClampedArray(cols * rows * 4)
  if (cols < 3 || rows < 3 || !(spacingMeters > 0)) return pixeles

  const esOrientacion = mode === "aspect"
  const paleta = esOrientacion ? ASPECT_PALETTE : SLOPE_PALETTE
  const k = 1 / (8 * spacingMeters)

  /** Pinta una celda a partir de sus dos derivadas. */
  const pintar = (i, dzdx, dzdy) => {
    const magnitud2 = dzdx * dzdx + dzdy * dzdy
    let tramo
    if (esOrientacion) {
      // En terreno casi llano el rumbo lo decide el ruido del modelo, no el
      // relieve: se deja transparente en vez de pintar un confeti que parece
      // información.
      if (magnitud2 < ASPECT_MIN_TAN2) return
      tramo = tramoDeOrientacion(dzdx, dzdy)
    } else {
      tramo = tramoDePendiente(magnitud2)
    }
    const p = i * 4
    const c = tramo * 4
    pixeles[p] = paleta[c]
    pixeles[p + 1] = paleta[c + 1]
    pixeles[p + 2] = paleta[c + 2]
    pixeles[p + 3] = paleta[c + 3]
  }

  // El interior: la pasada rápida.
  for (let fila = 1; fila < rows - 1; fila++) {
    const arriba = (fila - 1) * cols
    const medio = fila * cols
    const abajo = (fila + 1) * cols

    for (let col = 1; col < cols - 1; col++) {
      const z1 = heights[arriba + col - 1]
      const z2 = heights[arriba + col]
      const z3 = heights[arriba + col + 1]
      const z4 = heights[medio + col - 1]
      const z6 = heights[medio + col + 1]
      const z7 = heights[abajo + col - 1]
      const z8 = heights[abajo + col]
      const z9 = heights[abajo + col + 1]

      const dzdx = (z3 + 2 * z6 + z9 - (z1 + 2 * z4 + z7)) * k
      const dzdy = (z7 + 2 * z8 + z9 - (z1 + 2 * z2 + z3)) * k
      // Con una sola altura ausente, las dos derivadas salen NaN y la celda se
      // queda transparente. No hace falta comprobar las ocho.
      if (!Number.isFinite(dzdx) || !Number.isFinite(dzdy)) continue

      pintar(medio + col, dzdx, dzdy)
    }
  }

  // El borde: la misma cuenta, leyendo la celda de al lado cuando el vecino cae
  // fuera. Es lo que hace GDAL con `-compute_edges`, y a la resolución a la que
  // se ve esto son celdas de menos de un píxel de pantalla.
  const leer = (col, fila) => {
    const c = col < 0 ? 0 : col > cols - 1 ? cols - 1 : col
    const f = fila < 0 ? 0 : fila > rows - 1 ? rows - 1 : fila
    return heights[f * cols + c]
  }

  const enElBorde = (col, fila) => {
    const z1 = leer(col - 1, fila - 1)
    const z2 = leer(col, fila - 1)
    const z3 = leer(col + 1, fila - 1)
    const z4 = leer(col - 1, fila)
    const z6 = leer(col + 1, fila)
    const z7 = leer(col - 1, fila + 1)
    const z8 = leer(col, fila + 1)
    const z9 = leer(col + 1, fila + 1)
    const dzdx = (z3 + 2 * z6 + z9 - (z1 + 2 * z4 + z7)) * k
    const dzdy = (z7 + 2 * z8 + z9 - (z1 + 2 * z2 + z3)) * k
    if (!Number.isFinite(dzdx) || !Number.isFinite(dzdy)) return
    pintar(fila * cols + col, dzdx, dzdy)
  }

  for (let col = 0; col < cols; col++) {
    enElBorde(col, 0)
    enElBorde(col, rows - 1)
  }
  for (let fila = 1; fila < rows - 1; fila++) {
    enElBorde(0, fila)
    enElBorde(cols - 1, fila)
  }

  return pixeles
}

/**
 * Los píxeles de la capa, listos para un `ImageData`.
 *
 * Queda para las pruebas y para quien tenga ya los grados calculados; la capa del
 * mapa usa `derivativePixels`, que no llega a convertir a grados.
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
 * Los números con los que explicar de dónde sale lo que se está viendo.
 *
 * **Por qué hace falta explicarlo.** El modelo mide la altura cada ~30 m, pero la
 * capa se dibuja sobre celdas de otro tamaño —19 m si estás cerca, 76 si estás
 * lejos—. Enseñar «celdas 19 m» a secas se lee como «este mapa tiene 19 m de
 * detalle», y no los tiene: las celdas de en medio están interpoladas, no
 * medidas. Al revés pasa lo contrario: con celdas de 76 m cada una resume varias
 * medidas del modelo.
 *
 * Y hay un tercer número, que es el que de verdad importa al leer una pendiente:
 * el método mira las celdas vecinas, así que el valor de una celda es el promedio
 * de unos **dos** anchos de celda de terreno. Con celdas de 19 m eso son 38, que
 * casualmente es casi la resolución real del modelo — o sea que a ese zoom la
 * capa no está inventando finura, aunque la rejilla parezca más fina de lo que
 * el dato da.
 *
 * @param {number} cellSizeMeters lado de la celda que se está dibujando
 * @returns {{cell: number, window: number, source: number, interpolated: boolean}|null}
 */
export const resolutionNote = (cellSizeMeters) => {
  if (!Number.isFinite(cellSizeMeters) || cellSizeMeters <= 0) return null

  return {
    cell: Math.round(cellSizeMeters),
    window: Math.round(cellSizeMeters * 2),
    source: DEM_RESOLUTION_M,
    interpolated: cellSizeMeters < DEM_RESOLUTION_M,
  }
}

/**
 * ¿Tiene sentido dibujar la capa con este zoom?
 *
 * Devuelve el motivo por el que no, para poder decírselo al usuario en vez de
 * dejar la capa encendida sin pintar nada.
 *
 * En 3D (pitch > 0), el cálculo se acota a un radio geográfico alrededor del
 * centro enfocado para no pedir teselas hasta el horizonte.
 */
export const slopeUnavailableReason = ({ zoom }) => {
  if (zoom < SLOPE_MIN_ZOOM) {
    return "Acerca el mapa: a esta escala cada celda pasaría de 150 m."
  }

  return null
}
