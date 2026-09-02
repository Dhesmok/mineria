import { linkPartsOf } from "./sgcLayers"

/**
 * Qué dirección es la plancha, y cuál se deja pasar por nuestro servidor.
 *
 * Dos preguntas de la misma cosa. La primera se hace en el navegador —de todos
 * los enlaces que trae la ficha del SGC, cuál es el mapa— y la segunda en el
 * servidor, en `/api/plancha`, antes de ir a buscarlo. Están juntas porque
 * separarlas invita a que una acepte lo que la otra rechaza, y viven fuera de la
 * propia ruta porque Next no deja exportar de un `route.js` nada que no sea un
 * manejador: intentarlo rompe la compilación con «is not a valid Route export
 * field».
 *
 * Módulo puro.
 */

/**
 * De una ficha del SGC, el enlace al PDF de la plancha geológica.
 *
 * «Estado cartográfico» devuelve varias direcciones por plancha y hay que elegir
 * una: `ECG_URL_PL` es el mapa, `ECG_URL_ME` es la memoria explicativa —un
 * informe de doscientas páginas, sin nada que colocar sobre el mapa— y
 * `ECG_VECTOR` lleva a una página del visor del SGC, que ni siquiera es un
 * archivo.
 *
 * **No se busca el nombre exacto del campo.** Es la trampa nº 1: los campos del
 * SGC cambian, y ya cambiarían con solo mirar otra de sus capas. Se puntúa: suma
 * acabar en `.pdf`, suma que el campo hable de plancha o mapa, y resta que hable
 * de memoria. Gana el mejor con puntuación positiva, y si ninguno la tiene no se
 * ofrece nada, que es la respuesta correcta para una plancha sin publicar.
 *
 * @returns {string|null}
 */
const CAMPO_DE_PLANCHA = /(_pl|planch|mapa|geolog)/i
const CAMPO_DE_MEMORIA = /(_me|memoria|informe|report)/i

export const planchaPdfFrom = (attributes) => {
  let mejor = null

  for (const { field, value } of attributes ?? []) {
    for (const parte of linkPartsOf(value)) {
      if (!parte.href) continue

      let esPdf = false
      try {
        esPdf = /\.pdf$/i.test(new URL(parte.href).pathname)
      } catch {
        continue
      }

      const nombre = String(field ?? "")
      let puntos = 0
      if (esPdf) puntos += 2
      if (CAMPO_DE_PLANCHA.test(nombre)) puntos += 2
      if (CAMPO_DE_MEMORIA.test(nombre)) puntos -= 3
      if (puntos > 0 && (!mejor || puntos > mejor.puntos)) mejor = { href: parte.href, puntos }
    }
  }

  return mejor?.href ?? null
}

/**
 * De dónde se acepta traer una plancha.
 *
 * Se compara contra el final del nombre del servidor, con el punto delante, para
 * que `sgc.gov.co.malicioso.com` no cuele. Y se acepta también el dominio pelado
 * por si alguna dirección viene sin subdominio.
 *
 * Solo `gov.co` sería demasiado ancho —cualquier entidad del Estado—, pero
 * quitarlo dejaría fuera direcciones del SGC alojadas en otro dominio suyo. El
 * compromiso: `gov.co` vale, pero el camino tiene que acabar en `.pdf`.
 */
const DOMINIOS = ["sgc.gov.co", "gov.co"]

/**
 * La dirección tal como saldrá de nuestro servidor, o `null` si no se acepta.
 *
 * Se devuelve reconstruida y sin credenciales ni fragmento: lo que salga tiene
 * que ser exactamente lo que aquí se validó, no la cadena que llegó. Un
 * `usuario:clave@` colado en la dirección viajaría con la petición y quedaría en
 * los registros del SGC a nombre nuestro.
 *
 * **Se acepta `http` además de `https`, y esto costó una tanda.** La primera
 * versión exigía `https` y parecía lo obvio; el resultado fue que la función no
 * colocó ni una plancha, con un 400 que decía «esa dirección no es un PDF de un
 * servicio del Estado» sobre direcciones que lo eran. El gestor documental del
 * SGC publica sus enlaces en `http` pelado —`http://recordcenter.sgc.gov.co/…`—
 * y eso no es negociable desde aquí: es lo que devuelve su servicio.
 *
 * Lo que sí se puede es **subirlas a `https` al salir** y dejar que la ruta baje
 * a `http` solo si el SGC no atiende cifrado. Que la dirección llegue en claro no
 * es motivo para pedirla en claro.
 */
export const permite = (texto) => {
  let url
  try {
    url = new URL(String(texto))
  } catch {
    return null
  }
  if (url.protocol !== "https:" && url.protocol !== "http:") return null

  const servidor = url.hostname.toLowerCase()
  const permitido = DOMINIOS.some((d) => servidor === d || servidor.endsWith(`.${d}`))
  if (!permitido) return null
  if (!/\.pdf$/i.test(url.pathname)) return null

  return `https://${url.host}${url.pathname}${url.search}`
}

/**
 * La misma dirección sin cifrar, para el segundo intento.
 *
 * No se pudo comprobar si `recordcenter.sgc.gov.co` atiende en `https`: desde la
 * máquina donde se escribió esto el proxy bloquea `sgc.gov.co`, así que un fallo
 * de conexión no distingue «el SGC no lo sirve» de «aquí no se llega». Ante esa
 * duda, se intentan los dos por orden y funciona en los dos casos — que es la
 * misma decisión que llevó a montar `/api/sgc`.
 *
 * Solo la usa la ruta, y solo sobre lo que `permite` ya validó: no es una puerta
 * de atrás para pedir en claro cualquier cosa.
 */
export const sinCifrar = (url) => String(url).replace(/^https:/, "http:")
