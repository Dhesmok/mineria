/** Error devuelto por el propio servicio ArcGIS, no por la red. */
export class ArcgisError extends Error {
  constructor(message, code) {
    super(message)
    this.name = "ArcgisError"
    this.code = code
  }
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
  const response = await fetch(url, options)

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
