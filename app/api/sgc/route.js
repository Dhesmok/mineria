import { SGC_TILE_SIZE, sgcExportUrl, sgcLayerByKey } from "../../utils/sgcLayers"

/**
 * El intermediario para las capas de geología del SGC.
 *
 * **Por qué existe.** MapLibre pide las teselas ráster con `fetch`, no con una
 * etiqueta `img`, y eso las somete a CORS: si el servidor del SGC no manda la
 * cabecera que autoriza a otro dominio, el navegador descarta la imagen y la capa
 * no aparece. No he podido comprobar si la manda —el proxy de la máquina donde se
 * escribió esto bloquea `sgc.gov.co`—, y ante esa duda esto funciona en los dos
 * casos. Ver la cabecera de `utils/sgcLayers.js`.
 *
 * **Cuatro modos, no uno.** Una imagen sola no es una capa: es un adorno. Para
 * que sirva hay que poder preguntarle al servicio qué contiene (`meta`), qué hay
 * en un punto (`identify`) y qué significa cada color (`leyenda`). Los cuatro
 * pasan por aquí por lo mismo que el primero.
 *
 * **Por qué se pide por clave y no por dirección.** Si aceptara una URL, sería un
 * proxy abierto: cualquiera podría usar este dominio para pedir lo que quisiera,
 * y el tráfico saldría con nuestro nombre. Aceptando solo las claves del catálogo
 * hay exactamente cinco direcciones posibles, y **cada parámetro que se concatena
 * se valida antes**: lo que llegue aquí acaba dentro de una petición que sale de
 * nuestro servidor.
 */

/** Cuánto se guarda una imagen antes de volver a pedirla. Una semana. */
const CACHE_IMAGEN = 60 * 60 * 24 * 7

/**
 * Y cuánto los metadatos y la leyenda.
 *
 * Más corto que las imágenes, y a propósito: si el SGC reorganiza el servicio,
 * los índices de sus capas cambian, y una lista de departamentos cacheada una
 * semana dibujaría el departamento equivocado sin que nada fallara. Un día es
 * bastante para no molestarle en cada visita y poco para que un cambio suyo no
 * tarde en notarse.
 */
const CACHE_METADATOS = 60 * 60 * 24

/**
 * Cuánto se espera al SGC antes de rendirse.
 *
 * Estos servicios dibujan un mapa entero por petición y a veces tardan. Pero sin
 * tope, una petición colgada retiene una función del servidor hasta que la
 * plataforma la corta, y con veinte teselas por pantalla eso se multiplica.
 */
const TIMEOUT_MS = 20000

/** Cuatro números separados por comas, y nada más. */
const RECUADRO = /^-?\d+(\.\d+)?(,-?\d+(\.\d+)?){3}$/
/** Dos, para un punto. */
const PUNTO = /^-?\d+(\.\d+)?,-?\d+(\.\d+)?$/
/** Dos enteros, para el tamaño en píxeles. */
const TAMANO = /^\d{1,5},\d{1,5}$/
/** Índices de subcapa: solo dígitos y comas. */
const SUBCAPAS = /^\d+(,\d+)*$/

const error = (mensaje, estado) =>
  new Response(mensaje, { status: estado, headers: { "content-type": "text/plain; charset=utf-8" } })

/** Pide algo al SGC con tope de tiempo y devuelve la respuesta cruda. */
const alSgc = async (url) => {
  const control = new AbortController()
  const reloj = setTimeout(() => control.abort(), TIMEOUT_MS)
  try {
    return await fetch(url, { signal: control.signal })
  } finally {
    clearTimeout(reloj)
  }
}

/**
 * Reenvía una respuesta JSON del SGC.
 *
 * Se comprueba el tipo de contenido igual que con las imágenes: **ArcGIS
 * responde 200 con un cuerpo de error**, que es la trampa nº 2 del proyecto.
 */
const reenviarJson = async (url, cache) => {
  const respuesta = await alSgc(url)
  if (!respuesta.ok) return error(`El servicio del SGC respondió ${respuesta.status}.`, 502)

  const tipo = respuesta.headers.get("content-type") ?? ""
  if (!tipo.includes("json")) return error("El servicio del SGC no devolvió datos.", 502)

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
  const capa = sgcLayerByKey(params.get("capa"))
  if (!capa) return error("Capa desconocida.", 400)

  const modo = params.get("modo") ?? "imagen"

  // Las subcapas valen para la imagen y para el identify: es la misma pregunta
  // —«de todo lo que tiene el servicio, qué parte»— y tiene que responderse igual
  // en las dos, o el clic contestaría por una capa que no se está viendo.
  const sub = params.get("sub")
  if (sub && !SUBCAPAS.test(sub)) return error("Subcapas inválidas.", 400)
  const seleccion = sub ? `show:${sub}` : ""

  try {
    if (modo === "meta") {
      return await reenviarJson(`${capa.service}?f=json`, CACHE_METADATOS)
    }

    if (modo === "leyenda") {
      return await reenviarJson(`${capa.service}/legend?f=json`, CACHE_METADATOS)
    }

    if (modo === "identify") {
      const punto = params.get("punto")
      const bbox = params.get("bbox")
      const tam = params.get("tam")
      const tol = Number(params.get("tol") ?? 4)

      if (!punto || !PUNTO.test(punto)) return error("Punto inválido.", 400)
      if (!bbox || !RECUADRO.test(bbox)) return error("Recuadro inválido.", 400)
      if (!tam || !TAMANO.test(tam)) return error("Tamaño inválido.", 400)
      if (!Number.isInteger(tol) || tol < 0 || tol > 50) return error("Tolerancia inválida.", 400)

      // `layers` va como `visible:` y no como `all:` a propósito: preguntar por
      // todo devolvería unidades de departamentos que no se están dibujando, y la
      // ficha diría cosas que no están en el mapa.
      const cuales = sub ? `visible:${sub}` : "visible"
      const url =
        `${capa.service}/identify?geometry=${punto}&geometryType=esriGeometryPoint` +
        `&sr=3857&mapExtent=${bbox}&imageDisplay=${tam},96&tolerance=${tol}` +
        `&layers=${cuales}&returnGeometry=false&f=json`
      // Sin caché: el punto cambia en cada clic, así que guardar no ahorra nada.
      return await reenviarJson(url, 0)
    }

    if (modo !== "imagen") return error("Modo desconocido.", 400)

    const bbox = params.get("bbox")
    if (!bbox || !RECUADRO.test(bbox)) return error("Recuadro inválido.", 400)

    const respuesta = await alSgc(sgcExportUrl(capa.service, bbox, SGC_TILE_SIZE, seleccion))
    if (!respuesta.ok) return error(`El servicio del SGC respondió ${respuesta.status}.`, 502)

    const tipo = respuesta.headers.get("content-type") ?? ""
    if (!tipo.startsWith("image/")) return error("El servicio del SGC no devolvió una imagen.", 502)

    return new Response(respuesta.body, {
      status: 200,
      headers: {
        "content-type": tipo,
        "cache-control": `public, max-age=3600, s-maxage=${CACHE_IMAGEN}, stale-while-revalidate=${CACHE_IMAGEN}`,
      },
    })
  } catch (fallo) {
    const agotado = fallo?.name === "AbortError"
    return error(agotado ? "El SGC tardó demasiado." : "No se pudo consultar al SGC.", 504)
  }
}
