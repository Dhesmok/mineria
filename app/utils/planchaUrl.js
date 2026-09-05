import { linkPartsOf } from "./sgcLayers"

const CAMPO_DE_PLANCHA = /(_pl|planch|mapa|geolog)/i
const CAMPO_DE_MEMORIA = /(_me|memoria|informe|report)/i

/**
 * Selecciona un PDF sin depender de nombres exactos de campos.
 * Las páginas de visor no participan, aunque su campo mencione "mapa".
 */
export const planchaPdfFrom = (attributes) => {
  let mejor = null

  for (const { field, value } of attributes ?? []) {
    for (const parte of linkPartsOf(value)) {
      if (!parte.href) continue

      let url
      try {
        url = new URL(parte.href)
      } catch {
        continue
      }

      if (url.protocol !== "https:" && url.protocol !== "http:") continue
      if (!/\.pdf$/i.test(url.pathname)) continue

      const nombre = String(field ?? "")
      let puntos = 2

      if (CAMPO_DE_PLANCHA.test(nombre)) puntos += 2
      if (CAMPO_DE_MEMORIA.test(nombre)) puntos -= 3

      if (puntos > 0 && (!mejor || puntos > mejor.puntos)) {
        mejor = { href: parte.href, puntos }
      }
    }
  }

  return mejor?.href ?? null
}

/**
 * Se mantiene la compatibilidad con enlaces estatales externos al SGC.
 *
 * Esto es una política de nombres, no una defensa completa contra SSRF:
 * la ruta también debe controlar puertos, redirecciones y la IP de conexión.
 */
const DOMINIOS = ["sgc.gov.co", "gov.co"]

/**
 * Valida y reconstruye una URL:
 * - HTTP o HTTPS de entrada; siempre HTTPS de salida.
 * - Dominio permitido, comparado por etiquetas completas.
 * - Camino terminado en .pdf.
 * - Sin credenciales ni fragmento.
 *
 * Los puertos explícitos no estándar se conservan por compatibilidad.
 * La política de puertos de conexión corresponde al servidor.
 */
export const permite = (texto) => {
  if (typeof texto !== "string" || texto.length > 8192) return null

  let url
  try {
    url = new URL(texto)
  } catch {
    return null
  }

  if (url.protocol !== "https:" && url.protocol !== "http:") return null

  const servidor = url.hostname.toLowerCase()
  const permitido = DOMINIOS.some(
    (dominio) => servidor === dominio || servidor.endsWith(`.${dominio}`),
  )

  if (!permitido) return null
  if (!/\.pdf$/i.test(url.pathname)) return null

  return `https://${url.host}${url.pathname}${url.search}`
}

/**
 * Se conserva como utilidad compatible con los consumidores existentes.
 * La ruta segura de planchas no la utiliza.
 */
export const sinCifrar = (url) => String(url).replace(/^https:/, "http:")
