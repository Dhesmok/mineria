/**
 * Los límites del tamaño de la rosa de los vientos.
 *
 * Viven aquí, sueltos, y no dentro de `useGeolocationGL`, por una razón muy
 * concreta: las preferencias guardadas tienen que validar contra ellos, y el
 * hook de geolocalización lee las preferencias. Importarse el uno al otro sería
 * un ciclo, y los ciclos entre módulos se manifiestan como valores `undefined`
 * en tiempo de ejecución, no como un error de compilación.
 *
 * 250 px es mucho en un celular y poco en un monitor grande; de ahí que se pueda
 * ajustar y que el ajuste se recuerde.
 */
export const COMPASS_SIZE_DEFAULT = 250
export const COMPASS_SIZE_MIN = 120
export const COMPASS_SIZE_MAX = 420
