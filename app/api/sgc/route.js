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
 * **Por qué se pide por clave y no por dirección.** Si aceptara una URL, sería un
 * proxy abierto: cualquiera podría usar este dominio para pedir lo que quisiera,
 * y el tráfico saldría con nuestro nombre. Aceptando solo las claves del catálogo
 * hay exactamente cinco direcciones posibles.
 *
 * **Y por qué se cachea tan largo.** Un mapa geológico no cambia de una semana a
 * otra; el de 2023 lleva ahí desde 2023. `s-maxage` deja que la red de Vercel
 * sirva las repeticiones sin volver a molestar al SGC, que es un servidor
 * público y lento. `stale-while-revalidate` hace que, pasado el plazo, el usuario
 * reciba la imagen vieja al instante mientras se busca la nueva por detrás.
 */

/** Cuánto se guarda una tesela antes de volver a pedirla. Una semana. */
const CACHE_SEGUNDOS = 60 * 60 * 24 * 7

/**
 * Cuánto se espera al SGC antes de rendirse.
 *
 * Estos servicios dibujan un mapa entero por petición y a veces tardan. Pero sin
 * tope, una petición colgada retiene una función del servidor hasta que la
 * plataforma la corta, y con veinte teselas por pantalla eso se multiplica.
 */
const TIMEOUT_MS = 20000

/** El recuadro tiene que ser cuatro números y nada más. */
const RECUADRO_VALIDO = /^-?\d+(\.\d+)?(,-?\d+(\.\d+)?){3}$/

const error = (mensaje, estado) =>
  new Response(mensaje, { status: estado, headers: { "content-type": "text/plain; charset=utf-8" } })

export const GET = async (request) => {
  const params = new URL(request.url).searchParams
  const capa = sgcLayerByKey(params.get("capa"))
  if (!capa) return error("Capa desconocida.", 400)

  const bbox = params.get("bbox")
  // Se valida con expresión regular y no solo con `Number`: lo que llegue aquí
  // se concatena en una dirección que sale de nuestro servidor, y ahí no puede
  // entrar nada que no sean cuatro números.
  if (!bbox || !RECUADRO_VALIDO.test(bbox)) return error("Recuadro inválido.", 400)

  const control = new AbortController()
  const reloj = setTimeout(() => control.abort(), TIMEOUT_MS)

  try {
    const respuesta = await fetch(sgcExportUrl(capa.service, bbox, SGC_TILE_SIZE), {
      signal: control.signal,
      headers: { accept: "image/png,image/*" },
    })

    if (!respuesta.ok) {
      return error(`El servicio del SGC respondió ${respuesta.status}.`, 502)
    }

    // ArcGIS contesta 200 con un JSON de error cuando algo va mal —es la misma
    // trampa que ya está documentada para la ANM—, así que no basta con mirar el
    // código: si no llega una imagen, no hay imagen.
    const tipo = respuesta.headers.get("content-type") ?? ""
    if (!tipo.startsWith("image/")) {
      return error("El servicio del SGC no devolvió una imagen.", 502)
    }

    return new Response(respuesta.body, {
      status: 200,
      headers: {
        "content-type": tipo,
        "cache-control": `public, max-age=3600, s-maxage=${CACHE_SEGUNDOS}, stale-while-revalidate=${CACHE_SEGUNDOS}`,
      },
    })
  } catch (fallo) {
    const agotado = fallo?.name === "AbortError"
    return error(agotado ? "El SGC tardó demasiado." : "No se pudo consultar al SGC.", 504)
  } finally {
    clearTimeout(reloj)
  }
}
