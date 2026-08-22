/**
 * El perfil longitudinal de una línea dibujada sobre el terreno.
 *
 * Es el corte de toda la vida: se traza una línea en el mapa y se ve cómo sube y
 * baja el terreno a lo largo de ella. Sirve para lo que sirve en campo —ver si
 * una vía cabe por una ladera, cuánto hay que subir de un punto a otro, dónde
 * está el escarpe— y es lo que un visor de títulos normalmente no tiene.
 *
 * **Las distancias se miden en CTM-12**, con la misma proyección que usa
 * `measure.js` para la herramienta de medir. No es un detalle: si el perfil
 * dijera que la línea mide 3,25 km y la barra de dibujo dijera 3,20 km para la
 * misma línea, eso se lee como un error del visor. Y lo sería.
 *
 * **El aviso de siempre, que aquí pesa más que en ningún otro sitio.** Con un
 * modelo global de ~30 m, este perfil sirve para leer el terreno y para
 * planificar; **no sirve para replantear una vía ni para un cálculo de
 * volúmenes**. Un perfil dibuja una línea continua y fina que da una impresión de
 * precisión que el dato no tiene. Por eso el componente que lo pinta lleva el
 * aviso a la vista, no en una nota al pie.
 *
 * Módulo puro: recibe coordenadas y alturas, devuelve números. No sabe qué es un
 * mapa, y por eso se puede probar contra rampas de pendiente conocida.
 */

import { DEM_RESOLUTION_M } from "./terrainAnalysis"
import { toCtm12 } from "./measure"

/**
 * Cuántas muestras tomar a lo largo de la línea.
 *
 * No es un número fijo, y la razón es el modelo: con celdas de 30 m, muestrear
 * cada 20 cm no añade ni un dato nuevo —serían todas interpolaciones de las
 * mismas cuatro celdas— y multiplica el trabajo por nada. Una muestra cada 10 m
 * ya es tres veces más fina que el modelo, que es de sobra.
 *
 * El mínimo de 32 es para que una línea corta siga dando una curva y no cuatro
 * puntos sueltos; el máximo de 300, para que una línea de cien kilómetros no
 * cueste más que las demás. Es la lección de la capa de pendiente, que muestrea
 * veinte mil puntos y bloquea el navegador diez segundos: aquí, trescientos.
 */
export const MIN_SAMPLES = 32
export const MAX_SAMPLES = 300
export const SAMPLE_SPACING_M = 10

export const sampleCountFor = (lengthMeters) => {
  if (!Number.isFinite(lengthMeters) || lengthMeters <= 0) return MIN_SAMPLES
  const deseadas = Math.round(lengthMeters / SAMPLE_SPACING_M) + 1
  return Math.min(MAX_SAMPLES, Math.max(MIN_SAMPLES, deseadas))
}

/**
 * Puntos equiespaciados a lo largo de una polilínea.
 *
 * Equiespaciados por distancia recorrida, no por vértice: un tramo largo y otro
 * corto tienen que quedar igual de detallados, o el perfil se vería fino donde
 * se hizo clic muchas veces y grueso donde no.
 *
 * @param {Array<[number, number]>} coordinates vértices [lon, lat]
 * @param {number} [samples] cuántos puntos; por defecto, los que pida la longitud
 * @returns {Array<{lng: number, lat: number, distance: number}>} distance en
 *   metros desde el inicio
 */
export const samplePointsAlong = (coordinates, samples) => {
  const vertices = (coordinates ?? []).filter(
    (c) => Array.isArray(c) && Number.isFinite(c[0]) && Number.isFinite(c[1]),
  )
  if (vertices.length < 2) return []

  // Cada vértice, proyectado, y cuánto se lleva recorrido al llegar a él.
  const planos = vertices.map(toCtm12)
  const acumulado = [0]
  for (let i = 1; i < planos.length; i += 1) {
    const [x1, y1] = planos[i - 1]
    const [x2, y2] = planos[i]
    acumulado.push(acumulado[i - 1] + Math.hypot(x2 - x1, y2 - y1))
  }

  const total = acumulado[acumulado.length - 1]
  if (!(total > 0)) return []

  const n = samples ?? sampleCountFor(total)
  const puntos = []
  let tramo = 1

  for (let i = 0; i < n; i += 1) {
    const objetivo = (total * i) / (n - 1)
    // Avanzar hasta el tramo que contiene esa distancia.
    while (tramo < acumulado.length - 1 && acumulado[tramo] < objetivo) tramo += 1

    const inicio = acumulado[tramo - 1]
    const largo = acumulado[tramo] - inicio
    const t = largo > 0 ? (objetivo - inicio) / largo : 0
    const [lon1, lat1] = vertices[tramo - 1]
    const [lon2, lat2] = vertices[tramo]

    // Se interpola en geográficas y no en la proyección: lo que se devuelve son
    // coordenadas para preguntarle la altura al mapa, y el mapa habla en
    // geográficas. A las distancias de un perfil la diferencia entre interpolar
    // en un sistema o en el otro es de centímetros.
    puntos.push({
      lng: lon1 + (lon2 - lon1) * t,
      lat: lat1 + (lat2 - lat1) * t,
      distance: objetivo,
    })
  }

  return puntos
}

/**
 * La pendiente del terreno en una muestra, en grados.
 *
 * **No se calcula contra la muestra de al lado.** Con muestras cada 10 m sobre un
 * modelo de 30 m, dos vecinas caen dentro de la misma celda o en celdas
 * contiguas: su diferencia de altura es casi toda ruido de interpolación, y la
 * pendiente saldría saltando entre 0° y 40° sin que el terreno haga nada. Se
 * mide sobre una ventana de al menos una celda del modelo, que es la distancia
 * más corta a la que ese modelo tiene algo real que decir.
 */
export const slopeAtSample = (points, index, minSpanMeters = DEM_RESOLUTION_M) => {
  if (!Array.isArray(points) || points.length < 2) return null
  const centro = points[index]
  if (!centro || !Number.isFinite(centro.elevation)) return null

  let antes = index
  let despues = index
  while (antes > 0 && centro.distance - points[antes].distance < minSpanMeters / 2) antes -= 1
  while (
    despues < points.length - 1 &&
    points[despues].distance - centro.distance < minSpanMeters / 2
  ) {
    despues += 1
  }

  const a = points[antes]
  const b = points[despues]
  if (!Number.isFinite(a?.elevation) || !Number.isFinite(b?.elevation)) return null

  const recorrido = b.distance - a.distance
  if (!(recorrido > 0)) return null

  const desnivel = b.elevation - a.elevation
  return (Math.atan(Math.abs(desnivel) / recorrido) * 180) / Math.PI
}

/**
 * El perfil completo: cada muestra con su altura y su pendiente, más el resumen.
 *
 * Las alturas llegan de fuera —quien las pide es el mapa— y pueden venir con
 * huecos: el modelo de elevación se descarga por teselas y puede que una parte
 * del recorrido todavía no haya llegado. Esos huecos **no se rellenan
 * inventando**: se marcan, y el resumen dice qué porcentaje del recorrido tiene
 * dato. Un perfil dibujado sobre alturas inventadas es exactamente la clase de
 * cosa que alguien usaría para tomar una decisión.
 *
 * @param {Array<{lng, lat, distance}>} points de `samplePointsAlong`
 * @param {Array<number|null>} elevations una por punto, en metros
 * @returns {{points: Array, stats: Object}|null}
 */
export const profileFrom = (points, elevations) => {
  if (!Array.isArray(points) || points.length < 2) return null

  const conAltura = points.map((punto, i) => {
    const z = elevations?.[i]
    return { ...punto, elevation: Number.isFinite(z) ? z : null }
  })

  const conPendiente = conAltura.map((punto, i) => ({
    ...punto,
    slope: slopeAtSample(conAltura, i),
  }))

  const alturas = conPendiente.map((p) => p.elevation).filter(Number.isFinite)
  const cobertura = alturas.length / conPendiente.length

  // Ascenso y descenso acumulados, solo entre muestras que las dos tengan dato:
  // sumar a través de un hueco contaría como desnivel el salto entre dos puntos
  // que pueden estar a kilómetros.
  let ascenso = 0
  let descenso = 0
  for (let i = 1; i < conPendiente.length; i += 1) {
    const anterior = conPendiente[i - 1].elevation
    const actual = conPendiente[i].elevation
    if (!Number.isFinite(anterior) || !Number.isFinite(actual)) continue
    const delta = actual - anterior
    if (delta > 0) ascenso += delta
    else descenso -= delta
  }

  const pendientes = conPendiente.map((p) => p.slope).filter(Number.isFinite)

  return {
    points: conPendiente,
    stats: {
      length: conPendiente[conPendiente.length - 1].distance,
      min: alturas.length ? Math.min(...alturas) : null,
      max: alturas.length ? Math.max(...alturas) : null,
      // El desnivel entre los dos extremos, que no es lo mismo que max menos
      // min: una línea que sube un cerro y baja al otro lado tiene desnivel
      // pequeño y ascenso acumulado grande.
      drop:
        Number.isFinite(conPendiente[0].elevation) &&
        Number.isFinite(conPendiente[conPendiente.length - 1].elevation)
          ? conPendiente[conPendiente.length - 1].elevation - conPendiente[0].elevation
          : null,
      gain: ascenso,
      loss: descenso,
      maxSlope: pendientes.length ? Math.max(...pendientes) : null,
      coverage: cobertura,
    },
  }
}

/**
 * La muestra más cercana a una distancia dada.
 *
 * Es lo que traduce «el dedo está aquí en la gráfica» a «este punto del mapa».
 * Por búsqueda binaria porque se llama en cada movimiento del puntero.
 */
export const sampleAtDistance = (points, distance) => {
  if (!Array.isArray(points) || points.length === 0) return null
  if (!Number.isFinite(distance)) return null

  let bajo = 0
  let alto = points.length - 1
  while (alto - bajo > 1) {
    const medio = (bajo + alto) >> 1
    if (points[medio].distance <= distance) bajo = medio
    else alto = medio
  }

  const a = points[bajo]
  const b = points[alto]
  return Math.abs(a.distance - distance) <= Math.abs(b.distance - distance) ? a : b
}
