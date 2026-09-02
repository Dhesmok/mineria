import { ANH_MAX_IMAGE_PX as MAX_PX, anhExportUrl, anhLayerByKey } from "../../utils/anhLayers"

/**
 * El intermediario para las capas de hidrocarburos de la ANH.
 *
 * Sometido a CORS en MapLibre, por lo que este proxy reenvía imágenes,
 * leyendas, metadatos y consultas puntuales (identify).
 */

const CACHE_IMAGEN = 60 * 60 * 24 * 7
const CACHE_METADATOS = 60 * 60 * 24
const TIMEOUT_MS = 25000

const RECUADRO = /^-?\d+(\.\d+)?(,-?\d+(\.\d+)?){3}$/
const PUNTO = /^-?\d+(\.\d+)?,-?\d+(\.\d+)?$/
const TAMANO = /^\d{1,5},\d{1,5}$/
const SUBCAPAS = /^\d+(,\d+)*$/

const error = (mensaje, estado) =>
  new Response(mensaje, { status: estado, headers: { "content-type": "text/plain; charset=utf-8" } })

const alAnh = async (url) => {
  const control = new AbortController()
  const reloj = setTimeout(() => control.abort(), TIMEOUT_MS)
  try {
    return await fetch(url, { signal: control.signal })
  } finally {
    clearTimeout(reloj)
  }
}

const reenviarJson = async (url, cache) => {
  const respuesta = await alAnh(url)
  if (!respuesta.ok) return error(`El servicio de la ANH respondió ${respuesta.status}.`, 502)

  const tipo = respuesta.headers.get("content-type") ?? ""
  if (!tipo.includes("json")) return error("El servicio de la ANH no devolvió datos.", 502)

  return new Response(respuesta.body, {
    status: 200,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": `public, max-age=600, s-maxage=${cache}, stale-while-revalidate=${cache}`,
    },
  })
}

export const GET = async (request) => {
  const params = new URL(request.url).searchParams
  const capa = anhLayerByKey(params.get("capa"))
  if (!capa) return error("Capa de hidrocarburos desconocida.", 400)

  const modo = params.get("modo") ?? "imagen"

  const sub = params.get("sub")
  if (sub && !SUBCAPAS.test(sub)) return error("Subcapas inválidas.", 400)
  const subElegida = sub ?? (capa.sub ? capa.sub.join(",") : "")
  const seleccion = subElegida ? `show:${subElegida}` : ""

  try {
    if (modo === "campos") {
      if (!sub || !/^\d+$/.test(sub)) return error("Subcapa inválida.", 400)
      return await reenviarJson(`${capa.service}/${sub}?f=json`, CACHE_METADATOS)
    }

    if (modo === "meta") {
      return await reenviarJson(`${capa.service}?f=json`, CACHE_METADATOS)
    }

    if (modo === "leyenda") {
      return await reenviarJson(`${capa.service}/legend?f=json`, CACHE_METADATOS)
    }

    if (modo === "identify") {
      const punto = params.get("geom") ?? params.get("punto")
      const bbox = params.get("bbox")
      const tam = params.get("tam")
      const tol = Number(params.get("tol") ?? 8)

      if (!punto || !PUNTO.test(punto)) return error("Punto inválido.", 400)
      if (!bbox || !RECUADRO.test(bbox)) return error("Recuadro inválido.", 400)
      if (!tam || !TAMANO.test(tam)) return error("Tamaño inválido.", 400)
      if (!Number.isInteger(tol) || tol < 0 || tol > 50) return error("Tolerancia inválida.", 400)

      const cuales = subElegida ? `all:${subElegida}` : "all"
      const url =
        `${capa.service}/identify?geometry=${punto}&geometryType=esriGeometryPoint` +
        `&sr=4686&mapExtent=${bbox}&imageDisplay=${tam},96&tolerance=${tol}` +
        `&layers=${cuales}&returnGeometry=false&f=json`

      return await reenviarJson(url, 0)
    }

    if (modo !== "imagen") return error("Modo desconocido.", 400)

    const bbox = params.get("bbox")
    const tam = params.get("tam")
    if (!bbox || !RECUADRO.test(bbox)) return error("Recuadro inválido.", 400)
    if (!tam || !TAMANO.test(tam)) return error("Tamaño inválido.", 400)

    if (tam.split(",").some((n) => Number(n) < 1 || Number(n) > MAX_PX))
      return error("Tamaño fuera de rango.", 400)

    const exportUrl = anhExportUrl(capa.service, bbox, tam, seleccion)
    const respuesta = await alAnh(exportUrl)
    if (!respuesta.ok) return error(`El servicio de la ANH respondió ${respuesta.status}.`, 502)

    const tipo = respuesta.headers.get("content-type") ?? ""
    if (!tipo.startsWith("image/")) return error("El servicio de la ANH no devolvió una imagen.", 502)

    return new Response(respuesta.body, {
      status: 200,
      headers: {
        "content-type": tipo,
        "cache-control": `public, max-age=3600, s-maxage=${CACHE_IMAGEN}, stale-while-revalidate=${CACHE_IMAGEN}`,
      },
    })
  } catch (fallo) {
    if (fallo?.name === "AbortError") return error("La ANH tardó demasiado.", 504)
    console.error("No se pudo consultar a la ANH:", fallo)
    return error("No se pudo consultar a la ANH.", 502)
  }
}
