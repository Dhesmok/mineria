/**
 * Pendiente y orientación a partir del modelo de elevación.
 *
 * Es lo mismo que hace cualquier SIG con la ventana de 3×3 de toda la vida: se
 * miran las ocho alturas alrededor de un punto, se estima cuánto cambia el
 * terreno de oeste a este y de norte a sur, y de esos dos números salen la
 * inclinación y hacia dónde mira la ladera.
 *
 * **Lo que hay que decir en voz alta, y por eso está escrito aquí arriba:** el
 * resultado depende por completo de la resolución del modelo. Con un modelo
 * global de 30 m, la pendiente sirve para leer el terreno y para descartar
 * zonas; **no sirve para un diseño de banco ni para un cálculo de estabilidad**.
 * El visor lo dice donde se ve, no en una nota al pie, y esta constante es la
 * que lo escribe.
 *
 * La curvatura se dejó fuera a propósito: con celdas de 30 m es sobre todo
 * ruido, y un número que parece dato y no lo es hace más daño que no darlo.
 *
 * Módulo puro: recibe nueve alturas y devuelve grados.
 */

/** Resolución aproximada del modelo global que usa el visor, en metros. */
export const DEM_RESOLUTION_M = 30

/**
 * Para qué sirve y para qué no. Es la parte accionable del aviso.
 *
 * Va aparte porque la leyenda de las capas de color explica la resolución en su
 * propia ventana de información, y repetir ahí «modelo global de ~30 m» sería
 * decir dos veces lo mismo en el mismo recuadro. Lo que no se puede repartir es
 * esto: es lo único que impide que alguien planee un banco con este mapa.
 */
export const ACCURACY_USE =
  "Sirve para leer el terreno y descartar zonas; no para diseño de bancos ni " +
  "cálculos de estabilidad."

/** El aviso completo, para donde no hay sitio para explicar la resolución. */
export const ACCURACY_WARNING = `Calculado sobre un modelo global de ~${DEM_RESOLUTION_M} m. ${ACCURACY_USE}`

/** Los ocho rumbos, para decir la orientación con palabras. */
const COMPASS = [
  { name: "Norte", short: "N" },
  { name: "Noreste", short: "NE" },
  { name: "Este", short: "E" },
  { name: "Sureste", short: "SE" },
  { name: "Sur", short: "S" },
  { name: "Suroeste", short: "SO" },
  { name: "Oeste", short: "O" },
  { name: "Noroeste", short: "NO" },
]

/**
 * El nombre del rumbo al que corresponde un azimut.
 *
 * Cada sector abarca 45°, centrado en su rumbo: el norte va de 337,5° a 22,5°.
 */
export const compassName = (azimuth) => {
  if (!Number.isFinite(azimuth)) return null
  const normalizado = ((azimuth % 360) + 360) % 360
  return COMPASS[Math.round(normalizado / 45) % 8]
}

/**
 * Cuánto hay que moverse en grados para recorrer una distancia en metros.
 *
 * La longitud se corrige por el coseno de la latitud: un grado de longitud mide
 * 111 km en el ecuador y cero en el polo. Sin esa corrección, la ventana de
 * muestreo saldría rectangular en vez de cuadrada y la pendiente saldría sesgada
 * hacia una dirección.
 */
export const metersToDegrees = (meters, latitude) => {
  const dLat = meters / 111320
  const coseno = Math.cos((latitude * Math.PI) / 180)
  // Cerca de los polos el coseno tiende a cero y el paso en longitud se
  // dispararía. Colombia no llega ahí, pero un tope evita un infinito.
  const dLon = meters / (111320 * Math.max(coseno, 0.01))
  return { dLat, dLon }
}

/**
 * Las nueve posiciones donde hay que preguntar la altura, alrededor de un punto.
 *
 * En el orden de lectura de una ventana 3×3: primero la fila norte de oeste a
 * este, luego la del centro, luego la sur. Es el orden que espera
 * `slopeAspectFrom`, y tenerlos juntos evita que uno de los dos cambie sin el
 * otro.
 *
 * @returns {Array<[number, number]>} nueve pares [lon, lat]
 */
export const sampleGrid = ([lon, lat], spacingMeters = DEM_RESOLUTION_M) => {
  const { dLat, dLon } = metersToDegrees(spacingMeters, lat)
  const puntos = []

  for (const filaNorte of [1, 0, -1]) {
    for (const columnaEste of [-1, 0, 1]) {
      puntos.push([lon + columnaEste * dLon, lat + filaNorte * dLat])
    }
  }

  return puntos
}

/**
 * Pendiente y orientación a partir de las nueve alturas.
 *
 * Usa el método de Horn, que es el que usan ArcGIS y GRASS: pondera doble las
 * cuatro celdas que tocan el centro por un lado y sencillo las cuatro esquinas.
 * Frente a una diferencia simple entre extremos, aguanta mucho mejor el ruido
 * del modelo, que con 30 m de celda es exactamente el problema que hay.
 *
 * @param {Array<number|null>} heights nueve alturas en metros, en el orden de
 *   `sampleGrid`: fila norte, fila central, fila sur; oeste → este
 * @param {number} spacingMeters separación entre celdas
 * @returns {{slopeDegrees, slopePercent, aspectDegrees, aspect}|null} null si
 *   falta alguna altura o el terreno es perfectamente plano
 */
export const slopeAspectFrom = (heights, spacingMeters = DEM_RESOLUTION_M) => {
  if (!Array.isArray(heights) || heights.length !== 9) return null
  if (heights.some((z) => !Number.isFinite(z))) return null

  const [z1, z2, z3, z4, , z6, z7, z8, z9] = heights

  // Cuánto sube hacia el este y cuánto hacia el sur, en metros por metro.
  //
  // Hacia el sur, no hacia el norte: es la convención con la que está escrita la
  // fórmula del azimut de más abajo, la misma de ArcGIS. Con el signo al revés
  // los casos de un solo eje salen bien por casualidad y el diagonal sale
  // reflejado —una ladera que mira al suroeste se anuncia como noroeste—. Se vio
  // con una prueba de un plano inclinado hacia el noreste.
  const dzdx = (z3 + 2 * z6 + z9 - (z1 + 2 * z4 + z7)) / (8 * spacingMeters)
  const dzdy = (z7 + 2 * z8 + z9 - (z1 + 2 * z2 + z3)) / (8 * spacingMeters)

  const magnitud = Math.hypot(dzdx, dzdy)
  const slopeDegrees = (Math.atan(magnitud) * 180) / Math.PI

  // En terreno perfectamente plano la orientación no existe: no hay ladera que
  // mire a ninguna parte. Devolver 0° ahí sería decir «mira al norte», que es
  // falso, así que se dice que no hay.
  if (magnitud === 0) {
    return {
      slopeDegrees: 0,
      slopePercent: 0,
      aspectDegrees: null,
      aspect: null,
    }
  }

  // El azimut de la ladera: hacia dónde baja. atan2 devuelve el ángulo desde el
  // este en sentido antihorario; se convierte a rumbo desde el norte, horario.
  let aspectDegrees = 90 - (Math.atan2(dzdy, -dzdx) * 180) / Math.PI
  aspectDegrees = ((aspectDegrees % 360) + 360) % 360

  return {
    slopeDegrees,
    // En minería se habla de las dos: grados para el ojo, porcentaje para las
    // normas de diseño de vías y taludes.
    slopePercent: magnitud * 100,
    aspectDegrees,
    aspect: compassName(aspectDegrees),
  }
}
