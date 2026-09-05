import {
  SGC_MAX_IMAGE_PX as MAX_PX,
  sgcExportUrl,
  sgcLayerByKey,
} from "../../utils/sgcLayers"

/**
 * Cuánto se guarda una imagen antes de volver a pedirla. Una semana.
 */
const CACHE_IMAGEN = 60 * 60 * 24 * 7

/**
 * Cuánto los metadatos y la leyenda. Un día.
 */
const CACHE_METADATOS = 60 * 60 * 24

/**
 * Cuánto se espera al SGC antes de rendirse.
 */
const TIMEOUT_MS = 20_000

const MAX_PIXELES = Math.min(MAX_PX * MAX_PX, 4096 * 4096)
const MAX_SUBCAPAS = 256

const RECUADRO = /^-?\d+(\.\d+)?(,-?\d+(\.\d+)?){3}$/
const PUNTO = /^-?\d+(\.\d+)?,-?\d+(\.\d+)?$/
const TAMANO = /^\d{1,5},\d{1,5}$/
const SUBCAPAS = /^\d+(,\d+)*$/

const error = (mensaje, estado) =>
  new Response(mensaje, {
    status: estado,
    headers: {
      "content-type": "text/plain; charset=utf-8",
      "cache-control": "no-store",
      "x-content-type-options": "nosniff",
    },
  })

const bboxValido = (texto) => {
  if (!texto || texto.length > 512 || !RECUADRO.test(texto)) return false

  const valores = texto.split(",").map(Number)
  if (!valores.every(Number.isFinite)) return false

  const [minX, minY, maxX, maxY] = valores
  return minX < maxX && minY < maxY
}

const puntoValido = (texto) =>
  Boolean(
    texto &&
      texto.length <= 256 &&
      PUNTO.test(texto) &&
      texto.split(",").map(Number).every(Number.isFinite),
  )

const tamanoValido = (texto) => {
  if (!texto || !TAMANO.test(texto)) return false

  const [ancho, alto] = texto.split(",").map(Number)

  return (
    Number.isSafeInteger(ancho) &&
    Number.isSafeInteger(alto) &&
    ancho >= 1 &&
    alto >= 1 &&
    ancho <= MAX_PX &&
    alto <= MAX_PX &&
    ancho * alto <= MAX_PIXELES
  )
}

const subcapasValidas = (texto) => {
  if (!texto || texto.length > 4096 || !SUBCAPAS.test(texto)) return false

  const indices = texto.split(",")
  return (
    indices.length <= MAX_SUBCAPAS &&
    indices.every((indice) => Number.isSafeInteger(Number(indice)))
  )
}

/**
 * Pide algo al SGC con tope de tiempo y propagación de cancelación del cliente.
 */
const alSgc = async (url, signalCliente) => {
  const control = new AbortController()
  const reloj = setTimeout(() => control.abort(), TIMEOUT_MS)
  const alDesconectar = () => control.abort()

  if (signalCliente) {
    if (signalCliente.aborted) control.abort()
    else signalCliente.addEventListener("abort", alDesconectar, { once: true })
  }

  try {
    return await fetch(url, { signal: control.signal })
  } finally {
    clearTimeout(reloj)
    if (signalCliente) signalCliente.removeEventListener("abort", alDesconectar)
  }
}

const cabeceraCache = (segundos, navegador = 600) =>
  segundos > 0
    ? `public, max-age=${navegador}, s-maxage=${segundos}, stale-while-revalidate=${segundos}`
    : "no-store"

/**
 * Reenvía una respuesta JSON del SGC.
 */
const reenviarJson = async (url, cache, signal) => {
  const respuesta = await alSgc(url, signal)

  if (!respuesta.ok) {
    return error(`El servicio del SGC respondió ${respuesta.status}.`, 502)
  }

  const tipo = (respuesta.headers.get("content-type") ?? "")
    .split(";")[0]
    .trim()
    .toLowerCase()

  if (!tipo.includes("json")) {
    return error("El servicio del SGC no devolvió datos.", 502)
  }

  return new Response(respuesta.body, {
    status: 200,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "x-content-type-options": "nosniff",
      "cache-control": cabeceraCache(cache, 600),
    },
  })
}

export const GET = async (request) => {
  const params = new URL(request.url).searchParams
  const capa = sgcLayerByKey(params.get("capa"))
  if (!capa) return error("Capa desconocida.", 400)

  const modo = params.get("modo") ?? "imagen"
  const sub = params.get("sub")

  if (sub && !subcapasValidas(sub)) {
    return error("Subcapas inválidas.", 400)
  }

  const seleccion = sub ? `show:${sub}` : ""

  try {
    if (modo === "campos") {
      if (!sub || !/^\d+$/.test(sub)) {
        return error("Subcapa inválida.", 400)
      }

      return await reenviarJson(
        `${capa.service}/${sub}?f=json`,
        CACHE_METADATOS,
        request.signal,
      )
    }

    if (modo === "meta") {
      return await reenviarJson(
        `${capa.service}?f=json`,
        CACHE_METADATOS,
        request.signal,
      )
    }

    if (modo === "leyenda") {
      return await reenviarJson(
        `${capa.service}/legend?f=json`,
        CACHE_METADATOS,
        request.signal,
      )
    }

    if (modo === "identify") {
      const punto = params.get("punto")
      const bbox = params.get("bbox")
      const tam = params.get("tam")
      const tol = Number(params.get("tol") ?? 4)

      if (!puntoValido(punto)) return error("Punto inválido.", 400)
      if (!bboxValido(bbox)) return error("Recuadro inválido.", 400)
      if (!tamanoValido(tam)) {
        return error("Tamaño inválido o fuera de rango.", 400)
      }
      if (!Number.isInteger(tol) || tol < 0 || tol > 50) {
        return error("Tolerancia inválida.", 400)
      }

      const cuales = sub ? `visible:${sub}` : "visible"
      const url =
        `${capa.service}/identify?geometry=${punto}&geometryType=esriGeometryPoint` +
        `&sr=3857&mapExtent=${bbox}&imageDisplay=${tam},96&tolerance=${tol}` +
        `&layers=${cuales}&returnGeometry=false&f=json`

      return await reenviarJson(url, 0, request.signal)
    }

    if (modo !== "imagen") return error("Modo desconocido.", 400)

    const bbox = params.get("bbox")
    const tam = params.get("tam")

    if (!bboxValido(bbox)) return error("Recuadro inválido.", 400)
    if (!tamanoValido(tam)) {
      return error("Tamaño inválido o fuera de rango.", 400)
    }

    const respuesta = await alSgc(
      sgcExportUrl(capa.service, bbox, tam, seleccion),
      request.signal,
    )

    if (!respuesta.ok) {
      return error(`El servicio del SGC respondió ${respuesta.status}.`, 502)
    }

    const tipo = (respuesta.headers.get("content-type") ?? "")
      .split(";")[0]
      .trim()
      .toLowerCase()

    // Solo formatos ráster; no servir SVG activo ni HTML/JSON de error como imagen
    if (!["image/png", "image/jpeg", "image/webp", "image/gif"].includes(tipo)) {
      return error("El servicio del SGC no devolvió una imagen.", 502)
    }

    return new Response(respuesta.body, {
      status: 200,
      headers: {
        "content-type": tipo,
        "x-content-type-options": "nosniff",
        "cache-control": cabeceraCache(CACHE_IMAGEN, 3600),
      },
    })
  } catch (fallo) {
    if (fallo?.name === "AbortError") {
      return error("El SGC tardó demasiado.", 504)
    }

    if (!request.signal?.aborted) {
      console.error("No se pudo consultar al SGC:", fallo?.code ?? fallo?.name ?? fallo)
    }

    return error("No se pudo consultar al SGC.", 502)
  }
}
