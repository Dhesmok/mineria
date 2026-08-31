import { fetchArcgisJson } from "./arcgis"

/**
 * Qué campos declara una capa de ArcGIS.
 *
 * **Por qué existe.** Filtrar "toda la capa" se traduce a un `where` de SQL, y
 * los nombres de campo no son los mismos en las cuatro capas de la ANM: el
 * estado del título es TITULO_ESTADO en unas y STATUS o ESTADO en otras. Nombrar
 * los tres por si acaso es lo que dispara la trampa nº 2 —ArcGIS responde HTTP
 * 200 con un cuerpo de error cuando el `where` menciona un campo inexistente—,
 * así que hay que preguntar antes.
 *
 * Y hay que **preguntarlo**, no escribirlo aquí: es la trampa nº 1. La ANM cambia
 * su servicio entre despliegues, y una tabla de campos escrita a mano envejece
 * igual de mal que una tabla de índices de capa.
 *
 * La caché es de módulo, como la de `tenureLayers`, y por lo mismo: el mapa y la
 * descarga por área tienen que preguntar por los mismos campos. Y **no se cachea
 * un fallo**, que es la trampa nº 3: si la petición no llega, el siguiente
 * intento vuelve a probar en vez de quedarse con el hueco hasta recargar.
 *
 * Módulo puro salvo por el `fetch`: recibe una dirección y devuelve nombres.
 */

/** `{url: Set<string>}` de lo ya averiguado. */
const cache = new Map()
/** Peticiones en vuelo, para no preguntar dos veces por la misma capa a la vez. */
const enVuelo = new Map()

const leer = async (layerUrl) => {
  const data = await fetchArcgisJson(`${layerUrl}?f=json`)
  const nombres = (data?.fields ?? [])
    .map((campo) => campo?.name)
    .filter((nombre) => typeof nombre === "string" && nombre !== "")

  // Una respuesta sin un solo campo no es una capa que se pueda filtrar: es una
  // respuesta que no entendimos. Guardarla como "esta capa no tiene campos"
  // haría que todo filtro devolviera `1=0` — cero resultados y ninguna pista de
  // por qué. Mejor decir que no se sabe.
  if (nombres.length === 0) throw new Error(`La capa ${layerUrl} no declaró ningún campo`)
  return new Set(nombres)
}

/**
 * Los campos de una capa, de la memoria si ya se preguntaron.
 *
 * @param {string} layerUrl la dirección de la capa, sin `/query`
 * @returns {Promise<Set<string>|null>} los nombres, o `null` si no se pudo
 *   averiguar. Ese `null` es parte del contrato: quien lo reciba tiene que
 *   decidir qué hacer sin campos, no dar por hecho que la capa no tiene ninguno.
 */
export const layerFieldsFor = async (layerUrl) => {
  const guardados = cache.get(layerUrl)
  if (guardados) return guardados

  const pendiente = enVuelo.get(layerUrl)
  if (pendiente) return pendiente

  const promesa = leer(layerUrl)
    .then((campos) => {
      cache.set(layerUrl, campos)
      return campos
    })
    .catch((error) => {
      console.error(`No se pudieron leer los campos de ${layerUrl}:`, error)
      return null
    })
    .finally(() => enVuelo.delete(layerUrl))

  enVuelo.set(layerUrl, promesa)
  return promesa
}

/** Solo para pruebas. */
export const resetLayerFieldsCache = () => {
  cache.clear()
  enVuelo.clear()
}
