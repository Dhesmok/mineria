/** Error devuelto por el propio servicio ArcGIS, no por la red. */
export class ArcgisError extends Error {
  constructor(message, code) {
    super(message)
    this.name = "ArcgisError"
    this.code = code
  }
}

/**
 * El servicio no respondió: caído, sin red o el intermediario agotó su tiempo.
 *
 * Se distingue de cualquier otro fallo porque **lo que el usuario concluye es
 * distinto**. Un error de ArcGIS es un fallo que hay que leer; un servicio caído
 * deja el mapa vacío, y un mapa vacío de títulos se lee como «aquí no hay
 * títulos». En un visor donde la pregunta es «¿está libre esta área?», esa
 * confusión es la más cara posible (`docs/RIESGOS.md`, riesgo 3).
 */
export class ServiceUnavailableError extends Error {
  constructor(message) {
    super(message)
    this.name = "ServiceUnavailableError"
  }
}

/** Estados con los que el intermediario o el servidor dicen «no llegué». */
const ESTADOS_DE_CAIDA = new Set([502, 503, 504])

/**
 * La frase que ve el usuario cuando fallan las capas de una entidad.
 *
 * @param {Error} error
 * @param {string} entidad «la ANM», «el SGC»…
 */
export const describeLayerFailure = (error, entidad = "la ANM") => {
  if (error instanceof ServiceUnavailableError) {
    return (
      `El servicio de ${entidad} no responde ahora mismo. Un mapa sin polígonos NO ` +
      "significa que la zona esté libre: el visor lo vuelve a intentar al mover el mapa."
    )
  }
  return `Error al actualizar las capas del mapa: ${error?.message ?? "error desconocido"}`
}

const ANM_HOSTS = ["https://annamineria.anm.gov.co/", "https://geo.anm.gov.co/"]

/**
 * Envuelve las direcciones de los servidores de la ANM para que pasen por
 * `/api/anm`.
 *
 * `annamineria.anm.gov.co` dejó de enviar la cabecera `Access-Control-Allow-Origin`
 * para orígenes distintos al suyo propio, por lo que una petición directa desde
 * el navegador es bloqueada por CORS antes de poder leer los metadatos o los
 * polígonos. En entorno de pruebas (`NODE_ENV === "test"`) o para URLs que no
 * son de la ANM se conserva la dirección tal cual para no alterar los mocks de
 * `global.fetch`.
 */
export const toAnmFetchUrl = (url, forceProxy = false, fresh = false) => {
  if (typeof url !== "string") return url
  if (!forceProxy && typeof process !== "undefined" && process.env?.NODE_ENV === "test") return url
  if (ANM_HOSTS.some((prefix) => url.startsWith(prefix))) {
    // `fresco=1` le pide al intermediario que no deje guardar la respuesta en
    // la red de Vercel: es lo que usa la descarga oficial por área, que promete
    // datos de la ANM en ese instante (trampa nº 28). Sin esto, saltarse la
    // caché del navegador servía de poco: la CDN devolvía la copia de hasta
    // siete minutos atrás.
    return `/api/anm?url=${encodeURIComponent(url)}${fresh ? "&fresco=1" : ""}`
  }
  return url
}

/**
 * Consulta un endpoint ArcGIS y normaliza sus formas de fallar.
 *
 * ArcGIS responde HTTP 200 con un cuerpo `{"error": {...}}` cuando el `where`
 * referencia un campo inexistente o el servicio está degradado. Como `response.ok`
 * es true y `data.features` queda undefined, esos fallos pasaban por "no se encontró
 * el expediente" en toda la aplicación.
 */
export const fetchArcgisJson = async (url, options) => {
  let response
  try {
    const { fresh, ...fetchOptions } = options ?? {}
    response = await fetch(toAnmFetchUrl(url, false, Boolean(fresh)), fetchOptions)
  } catch (error) {
    // Abortar no es una caída: es el usuario moviendo el mapa.
    if (error?.name === "AbortError") throw error
    // `fetch` solo lanza cuando no hubo respuesta: sin red, DNS, CORS.
    throw new ServiceUnavailableError(error?.message || "No se pudo conectar con el servicio.")
  }

  if (!response.ok) {
    if (ESTADOS_DE_CAIDA.has(response.status)) {
      // El intermediario explica en texto plano qué pasó («tardó demasiado»,
      // «no se pudo conectar»); se conserva para la consola.
      let detalle = ""
      try {
        detalle = (await response.text()).slice(0, 200)
      } catch {}
      throw new ServiceUnavailableError(detalle || `El servicio respondió con estado ${response.status}`)
    }
    throw new Error(`El servicio respondió con estado ${response.status}`)
  }

  const data = await response.json()

  if (data?.error) {
    const { message, code, details } = data.error
    throw new ArcgisError(message || details?.[0] || `El servicio devolvió el error ${code}`, code)
  }

  return data
}
