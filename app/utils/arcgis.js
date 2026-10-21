/** Error devuelto por el propio servicio ArcGIS, no por la red. */
export class ArcgisError extends Error {
  constructor(message, code) {
    super(message)
    this.name = "ArcgisError"
    this.code = code
  }
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
export const toAnmFetchUrl = (url, forceProxy = false) => {
  if (typeof url !== "string") return url
  if (!forceProxy && typeof process !== "undefined" && process.env?.NODE_ENV === "test") return url
  if (ANM_HOSTS.some((prefix) => url.startsWith(prefix))) {
    return `/api/anm?url=${encodeURIComponent(url)}`
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
  const response = await fetch(toAnmFetchUrl(url), options)

  if (!response.ok) {
    throw new Error(`El servicio respondió con estado ${response.status}`)
  }

  const data = await response.json()

  if (data?.error) {
    const { message, code, details } = data.error
    throw new ArcgisError(message || details?.[0] || `El servicio devolvió el error ${code}`, code)
  }

  return data
}
