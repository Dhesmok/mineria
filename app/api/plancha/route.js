import { permite, sinCifrar } from "../../utils/planchaUrl"

/**
 * El intermediario para el PDF de una plancha geológica.
 *
 * **Por qué existe.** El enlace sale de la propia ficha del SGC (`ECG_URL_PL`) y
 * apunta a su gestor documental. Para dibujar ese PDF sobre el mapa hay que
 * leerlo con `fetch` desde el navegador, y eso lo somete a CORS: si el servidor
 * no manda la cabecera que autoriza a otro dominio, el navegador lo descarta. Es
 * el mismo motivo por el que las capas del SGC pasan por `/api/sgc`, y aquí con
 * más razón todavía, porque el gestor documental es otro servidor distinto del de
 * los mapas.
 *
 * ## Por qué esta ruta sí acepta una dirección, y qué la sujeta
 *
 * `/api/sgc` acepta **claves** de un catálogo, no direcciones, y esa es su
 * defensa contra ser un proxy abierto. Aquí no se puede hacer lo mismo: las
 * direcciones de las planchas son casi mil, cambian cuando el SGC republica una
 * hoja, y **no se conocen de antemano** — se leen de la respuesta del servicio en
 * el momento del clic. Un catálogo escrito a mano sería la trampa nº 1 del
 * proyecto en su forma más pura.
 *
 * Lo que la sujeta es una lista de servidores permitidos: solo dominios del
 * Estado, solo si el camino acaba en `.pdf`, y solo si lo que vuelve no es una
 * página web. Con eso, lo peor que puede hacer alguien con esta ruta es
 * descargarse del SGC lo mismo que ya puede descargarse del SGC.
 */

/** Cuánto se espera al SGC. Estas hojas pesan decenas de megas y van lentas. */
const TIMEOUT_MS = 60000

/**
 * Cuánto se acepta descargar.
 *
 * La plancha 132 pesa 24 MB. Un tope holgado evita que un enlace equivocado
 * —o un archivo que el SGC republique mal— se traiga cientos de megas a través de
 * nuestro servidor. Solo se comprueba cuando el servicio declara el tamaño; si no
 * lo declara, el navegador se encuentra el archivo y decide él.
 */
const MAXIMO_BYTES = 120 * 1024 * 1024

/** Una semana: una plancha publicada no cambia de un día para otro. */
const CACHE = 60 * 60 * 24 * 7

const error = (mensaje, estado) =>
  new Response(mensaje, { status: estado, headers: { "content-type": "text/plain; charset=utf-8" } })

/**
 * Pide la plancha cifrada y, si no hay forma, sin cifrar.
 *
 * El gestor documental del SGC publica sus enlaces en `http` pelado. `permite`
 * los sube a `https` al validarlos, porque que la dirección venga en claro no es
 * motivo para pedirla en claro; pero **no está comprobado que el SGC atienda
 * cifrado** —desde la máquina de desarrollo su dominio está bloqueado— y si no
 * atiende, insistir dejaría la función sin servir ni una hoja.
 *
 * Se baja a `http` únicamente cuando el intento cifrado no llega a haber
 * respuesta —conexión rechazada, TLS que no negocia, nombre que no resuelve—. Un
 * 404 sí es una respuesta: ese documento no existe, y repetirlo en claro no lo
 * haría aparecer.
 *
 * El tiempo agotado no reintenta: es la señal de que el SGC va lento, y volver a
 * empezar solo gasta el resto del plazo.
 */
const traer = async (url, signal) => {
  try {
    return await fetch(url, { signal })
  } catch (fallo) {
    if (fallo?.name === "AbortError") throw fallo
    return fetch(sinCifrar(url), { signal })
  }
}

export const GET = async (request) => {
  const pedida = new URL(request.url).searchParams.get("url")
  if (!pedida) return error("Falta la dirección de la plancha.", 400)

  const url = permite(pedida)
  if (!url) return error("Esa dirección no es un PDF de un servicio del Estado.", 400)

  const control = new AbortController()
  const reloj = setTimeout(() => control.abort(), TIMEOUT_MS)
  try {
    const respuesta = await traer(url, control.signal)
    if (!respuesta.ok) return error(`El servicio del SGC respondió ${respuesta.status}.`, 502)

    const tipo = respuesta.headers.get("content-type") ?? ""
    // El gestor documental a veces manda `application/octet-stream`, así que no
    // basta con exigir el tipo exacto; lo que no puede ser es una página de
    // error en HTML, que es lo que devuelve cuando el documento no existe.
    if (/html|json|xml/i.test(tipo)) return error("El servicio no devolvió un PDF.", 502)

    const largo = Number(respuesta.headers.get("content-length") ?? 0)
    if (largo > MAXIMO_BYTES) return error("La plancha pesa demasiado.", 502)

    return new Response(respuesta.body, {
      status: 200,
      headers: {
        "content-type": "application/pdf",
        "cache-control": `public, max-age=3600, s-maxage=${CACHE}, stale-while-revalidate=${CACHE}`,
      },
    })
  } catch (fallo) {
    // Igual que en `/api/sgc`: un tiempo agotado no es lo mismo que no poder
    // hablar con el servicio, y confundirlos confunde las dos soluciones.
    if (fallo?.name === "AbortError") return error("El SGC tardó demasiado.", 504)
    console.error("No se pudo traer la plancha:", fallo)
    return error("No se pudo traer la plancha.", 502)
  } finally {
    clearTimeout(reloj)
  }
}
