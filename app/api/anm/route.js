/**
 * Intermediario (proxy) para los servicios ArcGIS REST de la ANM.
 *
 * ## Por qué existe
 *
 * El servidor `annamineria.anm.gov.co` (donde viven Títulos Vigentes,
 * Solicitudes Vigentes y Título Histórico) dejó de enviar la cabecera
 * `Access-Control-Allow-Origin` para orígenes externos y solo la devuelve
 * cuando `Origin: https://annamineria.anm.gov.co`. En consecuencia, el
 * navegador bloquea por CORS tanto el descubrimiento de índices de capa
 * (`TenureLayers/MapServer/0..5`) como la consulta de polígonos y de
 * expedientes, dejando las capas de la ANM completamente inoperantes.
 *
 * Al pasar las peticiones por esta ruta propia (`/api/anm`), la consulta a la
 * ANM se hace de servidor a servidor (donde CORS no aplica) y el navegador
 * recibe los datos desde su mismo origen.
 *
 * Solo se permiten las rutas exactas de los tres servicios de la ANM que usa
 * el visor para evitar que el endpoint funcione como un proxy abierto.
 */

const TIMEOUT_MS = 25_000

const PREFIJOS_PERMITIDOS = [
  "https://annamineria.anm.gov.co/annageo/rest/services/SIGM/TenureLayers/MapServer",
  "https://annamineria.anm.gov.co/annageo/rest/services/SIGM/VisorInterno/MapServer",
  "https://geo.anm.gov.co/webgis/rest/services/ANM/ServiciosANM/MapServer",
]

const error = (mensaje, estado) =>
  new Response(mensaje, {
    status: estado,
    headers: {
      "content-type": "text/plain; charset=utf-8",
      "cache-control": "no-store",
      "x-content-type-options": "nosniff",
    },
  })

const esUrlAnmPermitida = (rawUrl) => {
  if (!rawUrl || typeof rawUrl !== "string" || rawUrl.length > 4096) return null
  try {
    const parsed = new URL(rawUrl)
    if (parsed.protocol !== "https:") return null
    const limpia = parsed.toString()
    const permitida = PREFIJOS_PERMITIDOS.some(
      (prefijo) => limpia === prefijo || limpia.startsWith(`${prefijo}/`) || limpia.startsWith(`${prefijo}?`),
    )
    return permitida ? limpia : null
  } catch {
    return null
  }
}

export const GET = async (request) => {
  const params = new URL(request.url).searchParams
  const destino = esUrlAnmPermitida(params.get("url"))

  if (!destino) {
    return error("Dirección de servicio ANM no permitida.", 400)
  }

  const control = new AbortController()
  const reloj = setTimeout(() => control.abort(), TIMEOUT_MS)
  const alDesconectar = () => control.abort()

  if (request.signal) {
    if (request.signal.aborted) control.abort()
    else request.signal.addEventListener("abort", alDesconectar, { once: true })
  }

  try {
    const respuesta = await fetch(destino, {
      signal: control.signal,
      headers: {
        Accept: "application/json, */*",
      },
    })

    if (!respuesta.ok) {
      return error(`El servicio de la ANM respondió con estado ${respuesta.status}.`, 502)
    }

    const tipo = (respuesta.headers.get("content-type") ?? "")
      .split(";")[0]
      .trim()
      .toLowerCase()

    if (!tipo.includes("json") && !tipo.includes("text/plain")) {
      return error("El servicio de la ANM no devolvió JSON válido.", 502)
    }

    // Metadatos de capas se pueden cachear un rato; consultas de figuras (query) más breves
    const esConsulta = new URL(destino).pathname.endsWith("/query")
    const cacheHeader = esConsulta
      ? "public, max-age=60, s-maxage=120, stale-while-revalidate=300"
      : "public, max-age=600, s-maxage=3600, stale-while-revalidate=3600"

    return new Response(respuesta.body, {
      status: 200,
      headers: {
        "content-type": "application/json; charset=utf-8",
        "x-content-type-options": "nosniff",
        "cache-control": cacheHeader,
      },
    })
  } catch (fallo) {
    if (fallo?.name === "AbortError") {
      return error("El servicio de la ANM tardó demasiado en responder.", 504)
    }

    if (!request.signal?.aborted) {
      console.error("No se pudo consultar a la ANM:", fallo?.code ?? fallo?.name ?? fallo)
    }

    return error("No se pudo conectar con el servicio de la ANM.", 502)
  } finally {
    clearTimeout(reloj)
    if (request.signal) {
      request.signal.removeEventListener("abort", alDesconectar)
    }
  }
}
