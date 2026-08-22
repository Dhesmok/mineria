/**
 * Meter texto del usuario dentro de una consulta SQL de ArcGIS, sin sustos.
 *
 * **Qué problema resuelve, exactamente.** El autocompletado del buscador arma su
 * consulta con lo que se teclea:
 *
 *     UPPER(TENURE_ID) LIKE 'ABC%'
 *
 * Las comillas ya se escapaban, así que **no había forma de romper la consulta
 * ni de colar otra**: eso no era el problema, por mucho que una auditoría
 * automática lo llamara «inyección». Lo que sí quedaba suelto es que en SQL el
 * `%` y el `_` no son caracteres normales dentro de un `LIKE`: son comodines. El
 * `%` significa «lo que sea, de cualquier largo» y el `_`, «un carácter
 * cualquiera».
 *
 * El buscador exige tres caracteres antes de consultar, justamente para no
 * barrer el país entero con una letra. Pero teclear `%%%` cumple ese mínimo y
 * produce `LIKE '%%%%'`, que **es exactamente el barrido nacional que el mínimo
 * quería evitar**. No es un agujero de seguridad; es una puerta abierta a
 * castigar el servicio de la ANM sin querer.
 *
 * **Por qué se quitan los comodines y no se escapan.** Escaparlos es lo
 * «correcto» de manual, pero exige añadirle a la consulta una cláusula `ESCAPE`
 * y confiar en que el servicio de la ANM la admita. Desde el entorno donde se
 * escribió esto no hay forma de alcanzar la ANM para comprobarlo, y una consulta
 * con una cláusula que el servidor no entienda deja el buscador sin funcionar
 * **para todo el mundo**. Quitarlos no puede fallar: no existe expediente
 * colombiano con un `%` o un `_` en el código —son letras, dígitos y guiones—,
 * así que lo que se descarta no se estaba buscando.
 *
 * Si algún día aparece un código con uno de esos caracteres, el arreglo es la
 * cláusula `ESCAPE`, y hay que probarlo contra el servicio de verdad antes de
 * darlo por bueno.
 *
 * Módulo puro: recibe texto y devuelve texto.
 */

/**
 * Una comilla simple dentro de un texto SQL se escribe doblándola.
 *
 * Estaba escrito a mano en tres sitios —el buscador, el autocompletado y los
 * filtros—, que es como una de las tres se queda sin arreglar el día que haya
 * que tocarlo.
 */
export const escapeSqlText = (value) => String(value ?? "").replace(/'/g, "''")

/**
 * El texto sin los comodines de `LIKE`.
 *
 * @param {string} value
 * @returns {string}
 */
export const stripLikeWildcards = (value) => String(value ?? "").replace(/[%_]/g, "")

/**
 * El patrón para buscar «lo que empiece por esto», listo para meter entre
 * comillas en un `LIKE`.
 *
 * Devuelve `null` cuando, quitados los comodines, no queda bastante para
 * consultar. Ese `null` es la parte importante: es lo que impide que `%%%` —que
 * cumple el mínimo de tres caracteres antes de limpiarlo y no cumple nada
 * después— acabe consultando el país entero.
 *
 * @param {string} value lo que el usuario ha tecleado
 * @param {number} minLength cuántos caracteres útiles hacen falta para consultar
 * @returns {string|null} el patrón, o null si no hay que consultar
 */
export const likePrefixPattern = (value, minLength = 3) => {
  const limpio = stripLikeWildcards(String(value ?? "").trim())
  if (limpio.length < minLength) return null
  return `${escapeSqlText(limpio.toUpperCase())}%`
}
