import { permite, sinCifrar } from "../../utils/planchaUrl"

/**
 * Cuánto puede durar esta función antes de que la plataforma la corte.
 * Contrato con la plataforma (Vercel maxDuration).
 */
export const maxDuration = 60

/**
 * Cuánto esperamos al SGC antes de cortar (10s por debajo del tope de la plataforma).
 */
const TIMEOUT_MS = 50_000

/**
 * Cuánto se acepta descargar: 120 MB máximo.
 */
const MAXIMO_BYTES = 120 * 1024 * 1024

/** Una semana de caché */
const CACHE = 60 * 60 * 24 * 7

const error = (mensaje, estado) =>
  new Response(mensaje, {
    status: estado,
    headers: {
      "content-type": "text/plain; charset=utf-8",
      "cache-control": "no-store",
      "x-content-type-options": "nosniff",
    },
  })

/**
 * Pide la plancha cifrada y, si no hay forma o falla, sin cifrar.
 * Propaga la señal de aborto para no reintentar en caso de timeout o cancelación.
 */
const traer = async (url, signal) => {
  try {
    const cifrada = await fetch(url, { signal })
    if (cifrada.ok) return cifrada
    return await fetch(sinCifrar(url), { signal })
  } catch (fallo) {
    if (fallo?.name === "AbortError") throw fallo
    return await fetch(sinCifrar(url), { signal })
  }
}

export const GET = async (request) => {
  const pedida = new URL(request.url).searchParams.get("url")
  if (!pedida) return error("Falta la dirección de la plancha.", 400)

  const url = permite(pedida)
  if (!url) return error("Esa dirección no es un PDF de un servicio del Estado.", 400)

  const control = new AbortController()
  const reloj = setTimeout(() => control.abort(), TIMEOUT_MS)

  const alDesconectar = () => control.abort()
  if (request.signal) {
    if (request.signal.aborted) control.abort()
    else request.signal.addEventListener("abort", alDesconectar, { once: true })
  }

  try {
    const respuesta = await traer(url, control.signal)
    if (!respuesta.ok) {
      return error(`El servicio del SGC respondió ${respuesta.status}.`, 502)
    }

    const tipo = (respuesta.headers.get("content-type") ?? "").toLowerCase()
    if (/html|json|xml/i.test(tipo)) {
      return error("El servicio no devolvió un PDF.", 502)
    }

    const largo = Number(respuesta.headers.get("content-length") ?? 0)
    if (largo > MAXIMO_BYTES) {
      return error("La plancha pesa demasiado.", 502)
    }

    return new Response(respuesta.body, {
      status: 200,
      headers: {
        "content-type": "application/pdf",
        "cache-control": `public, max-age=3600, s-maxage=${CACHE}, stale-while-revalidate=${CACHE}`,
        "x-content-type-options": "nosniff",
      },
    })
  } catch (fallo) {
    if (fallo?.name === "AbortError") {
      return error("El SGC tardó demasiado.", 504)
    }

    if (!request.signal?.aborted) {
      console.error("No se pudo traer la plancha:", fallo?.code ?? fallo?.name ?? fallo)
    }

    return error("No se pudo traer la plancha.", 502)
  } finally {
    clearTimeout(reloj)
    if (request.signal) {
      request.signal.removeEventListener("abort", alDesconectar)
    }
  }
}
