/**
 * Lo que hace falta para armar una imagen del mapa.
 *
 * Exportar una captura no es apretar «guardar pantalla»: una imagen de un título
 * minero sin fecha, sin sistema de coordenadas, sin escala y sin decir de dónde
 * salieron los datos **no sirve como soporte de nada**, y ponerle esos cuatro
 * datos a mano es justo lo que nadie hace. Por eso el pie va automático.
 *
 * Aquí vive la parte que se puede razonar sin un lienzo delante: cuánto mide la
 * barra de escala, qué dice el pie y a qué tamaño sale la imagen. El dibujo en
 * sí está en `components/ImageExport.jsx`.
 *
 * Módulo puro: recibe números y devuelve números y textos.
 */

/** Los tamaños que se ofrecen, como múltiplos de lo que se ve en pantalla. */
export const EXPORT_SCALES = [
  { id: 1, label: "Pantalla", hint: "Para ver o compartir" },
  { id: 2, label: "Doble", hint: "Para un informe" },
  { id: 3, label: "Triple", hint: "Para imprimir" },
]

/**
 * Metros por píxel en la pantalla, a una latitud y un zoom dados.
 *
 * Es la circunferencia de la Tierra dividida entre los píxeles que ocupa el
 * mundo a ese zoom, corregida por el coseno de la latitud. Sin esa corrección,
 * una barra de escala calculada en Bogotá saldría un 0,3 % larga; el error crece
 * hacia los polos.
 *
 * **El 78.271 no es un error de tecleo, y aquí estuvo el fallo.** La cifra que
 * uno encuentra en todas partes es 156.543, que vale para los mapas de teselas
 * de 256 píxeles —Leaflet, OSM—. MapLibre define su zoom con teselas de 512, así
 * que a un mismo número de zoom su escala es la mitad. Con la cifra de 256, la
 * barra de escala de la imagen exportada decía «1 km» sobre un tramo que medía
 * 500 m, y la capa de pendiente daba 30° donde el terreno tenía 50. Ninguna de
 * las dos cosas se ve mirando el código; se vio comparando la fórmula con lo que
 * devuelve `map.unproject` para dos puntos separados 100 píxeles.
 */
export const metersPerPixel = (latitude, zoom) =>
  (78271.51696 * Math.cos((latitude * Math.PI) / 180)) / 2 ** zoom

/** Los saltos "redondos" de una barra de escala, en metros. */
const NICE_STEPS = [
  1, 2, 5, 10, 20, 50, 100, 200, 500,
  1000, 2000, 5000, 10000, 20000, 50000, 100000, 200000, 500000, 1000000,
]

/**
 * La barra de escala: cuántos píxeles mide y qué dice.
 *
 * Se elige el salto redondo más grande que quepa en el ancho disponible. Una
 * barra que diga «237 m» es técnicamente correcta y no sirve para nada: el ojo
 * mide comparando, y compara con números redondos.
 *
 * @param {number} metrosPorPixel a la latitud del centro del mapa
 * @param {number} anchoMaximo en píxeles
 * @returns {{width: number, label: string, meters: number}}
 */
export const scaleBarFor = (metrosPorPixel, anchoMaximo) => {
  const metrosMaximos = metrosPorPixel * anchoMaximo

  // El mayor salto que quepa; si ni el más pequeño cabe, se usa ese de todos
  // modos y la barra sale un poco más larga que el hueco previsto.
  const metros =
    [...NICE_STEPS].reverse().find((paso) => paso <= metrosMaximos) ?? NICE_STEPS[0]

  return {
    meters: metros,
    width: Math.round(metros / metrosPorPixel),
    label: metros >= 1000 ? `${metros / 1000} km` : `${metros} m`,
  }
}

/** Fecha en el formato que se lee en Colombia. */
export const formatExportDate = (date = new Date()) =>
  `${String(date.getDate()).padStart(2, "0")}/${String(date.getMonth() + 1).padStart(2, "0")}/${date.getFullYear()}`

/**
 * Las líneas del pie de la imagen.
 *
 * Cuatro datos y en este orden: qué se está viendo, en qué sistema, a qué fecha
 * y de dónde salió. Es lo mínimo para que la imagen se pueda citar.
 *
 * @param {Object} opciones
 * @param {string} opciones.crsLabel nombre del sistema de coordenadas
 * @param {string} opciones.crsId código EPSG
 * @param {string[]} opciones.layers nombres de las capas encendidas
 * @param {string[]} opciones.sources de dónde vienen los datos
 * @param {Date} [opciones.date]
 * @returns {string[]} una línea por renglón del pie
 */
export const buildFooter = ({ crsLabel, crsId, layers = [], sources = [], date }) => {
  const lineas = []

  if (layers.length > 0) lineas.push(`Capas: ${layers.join(" · ")}`)
  lineas.push(`Sistema de coordenadas: ${crsLabel} (EPSG:${crsId})`)
  lineas.push(`Generado el ${formatExportDate(date)} · visor de minería`)
  if (sources.length > 0) lineas.push(`Fuentes: ${sources.join(" · ")}`)

  return lineas
}

/** Nombre del archivo, con la fecha dentro para no pisar el anterior. */
export const exportFileName = (date = new Date()) => {
  const sello = [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, "0"),
    String(date.getDate()).padStart(2, "0"),
    String(date.getHours()).padStart(2, "0"),
    String(date.getMinutes()).padStart(2, "0"),
  ].join("")
  return `mapa-${sello}.png`
}
