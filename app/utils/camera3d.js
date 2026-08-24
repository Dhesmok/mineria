/**
 * A qué altura vuela la cámara del 3D, y cuánto hay que subirla para ver.
 *
 * **Esto se escribió dos veces, y la primera partía de una premisa falsa.** Vale
 * la pena contar las dos, porque la equivocada es la que parece obvia.
 *
 * *Lo que parecía.* En un mapa plano el zoom **es** la altura de la cámara: cada
 * nivel que se acerca la baja a la mitad. Sobre Medellín, a zoom 13 está a
 * 12.800 m y a zoom 18 a 400. Al encender el terreno el suelo sube a su cota de
 * verdad, así que —parecía— la cámara se quedaba 2.300 m dentro de la montaña, y
 * había que sacarla por encima de los 2.700 m de superficie.
 *
 * *Lo que pasa de verdad.* MapLibre coloca la cámara **sobre la cota del centro**,
 * no sobre el nivel del mar. Es el mismo criterio de Google Earth: a zoom 17 uno
 * está 425 m sobre el suelo que pisa, esté ese suelo a 0 m o a 1.800. Medido
 * contra `transform.getCameraAltitude()` en siete combinaciones de zoom e
 * inclinación, con el terreno ya cargado: coincide siempre con «cota del centro
 * más el desnivel de cámara», con un margen de 8 m.
 *
 * Y entonces, ¿por qué la vista salía rota? Por dos cosas distintas:
 *
 * 1. **MapLibre solo aplica la cota del centro si la conoce en ese instante.** Si
 *    `setTerrain` y el movimiento de cámara van seguidos, la pose se calcula con
 *    cota cero — y no la vuelve a tocar nunca. Comprobado: quince segundos
 *    después seguía a 424 m con el suelo a 2.700. El arreglo es esperar a que el
 *    terreno cargue antes de inclinar; lo hace `useTerrainGL`.
 * 2. **Las lomas de al lado.** Estar 425 m sobre el suelo que uno pisa no evita
 *    estar dentro de la ladera de enfrente, si esa ladera sube 1.000 m. Eso es lo
 *    que calcula este módulo.
 *
 * Así que lo que hay que salvar **no es la cota del terreno, sino cuánto
 * sobresale el relieve por encima del punto que se está mirando**. En Medellín la
 * diferencia entre las dos lecturas es kilómetro y medio de altura, o sea nivel y
 * medio de zoom: la premisa equivocada alejaba mucho más de lo necesario.
 *
 * **Por qué la solución es alejarse y no otra cosa.** En una cámara en
 * perspectiva, la altura y el detalle están atados: el zoom es la altura. Se
 * puede aflojar el vínculo estrechando el campo de visión —un teleobjetivo mira
 * de lejos y ve pequeño—, pero para salvar mil metros a zoom 18 haría falta un
 * campo de pocos grados, y con eso el relieve pierde la perspectiva y se ve
 * plano. Así que se sale hacia arriba, que además es lo que uno hace a mano.
 *
 * Módulo puro: recibe números y devuelve números.
 */

import { metersPerPixel } from "./imageExport"

/**
 * Campo de visión vertical de MapLibre, en grados.
 *
 * Es su valor por omisión y el visor no lo cambia, pero se pasa como parámetro
 * en vez de darlo por hecho: el día que alguien lo toque, esto tiene que seguir
 * dando la altura correcta en lugar de mentir en silencio.
 */
export const DEFAULT_FOV = 36.86989764584402

/**
 * Cuánto se deja entre la cámara y lo más alto del relieve, en metros.
 *
 * **Es un margen de aterrizaje, no un mínimo permanente**, y la diferencia
 * importa: solo se aplica cuando hay que corregir. Si se exigiera siempre, mirar
 * en 3D una zona plana quedaría limitado sin que nada estuviera mal — una
 * restricción inventada donde no había problema. Ver `safeZoomFor`.
 */
export const CLEARANCE_M = 400

/**
 * Qué se considera «lo que hay alrededor», en metros.
 *
 * No basta con la cota del punto que se mira. Estando en el fondo de un valle,
 * una cámara unos cientos de metros sobre el suelo queda metida dentro de la
 * ladera de enfrente y la vista es un muro de tierra. Lo que tiene que quedar por
 * debajo es la loma, no el suelo que se pisa. Dos kilómetros es el orden de lo
 * que se ve en pantalla a los zooms donde esto pasa.
 */
export const SCENE_RADIUS_M = 2000

/**
 * Nivel de teselas con el que se mira «cuánto sube el terreno por aquí».
 *
 * Grueso a propósito: la pregunta es la altura de la loma, no el detalle de la
 * ladera, y una tesela de este nivel abarca 19 km, así que casi siempre basta
 * una. Suaviza las crestas unas decenas de metros, que es justo lo que absorbe
 * el margen de arriba.
 */
export const LOOKAROUND_DEM_ZOOM = 11

/**
 * A qué altura vuela la cámara **sobre el suelo del punto que mira**.
 *
 * No sobre el nivel del mar: MapLibre suma por su cuenta la cota del centro, así
 * que este número es el desnivel de la cámara respecto de ese suelo. A zoom 17 e
 * inclinada 45° son 566 m, se esté sobre el mar o sobre el altiplano.
 *
 * @param {number} latitude grados
 * @param {number} zoom el del mapa (teselas de 512 px)
 * @param {number} pitch inclinación de la cámara, en grados
 * @param {number} viewportHeight alto del lienzo, en píxeles
 * @param {number} [fov] campo de visión vertical, en grados
 */
export const cameraHeightAboveGround = ({
  latitude,
  zoom,
  pitch,
  viewportHeight,
  fov = DEFAULT_FOV,
}) => {
  // La distancia de la cámara al punto que mira, en píxeles. Sale de encajar el
  // alto de la pantalla dentro del campo de visión.
  const distancia = (0.5 * viewportHeight) / Math.tan((fov * Math.PI) / 360)
  return distancia * Math.cos((pitch * Math.PI) / 180) * metersPerPixel(latitude, zoom)
}

/**
 * El zoom más cercano al que la cámara todavía pasa por encima de las lomas.
 *
 * Se despeja de la fórmula de arriba: el desnivel de la cámara se divide por dos
 * en cada nivel de zoom, así que basta saber cuánto es a zoom cero y dividir
 * hasta llegar al techo que se le pide.
 *
 * @param {number} reliefMeters cuánto sobresale el terreno de alrededor **por
 *   encima del punto que se mira**, ya multiplicado por la exageración
 * @param {number} [clearance] margen por encima de eso
 * @returns {number} un zoom, no necesariamente entero; `Infinity` si no hay nada
 *   que esquivar
 */
export const maxZoomAboveTerrain = ({
  latitude,
  pitch,
  viewportHeight,
  fov = DEFAULT_FOV,
  reliefMeters,
  clearance = CLEARANCE_M,
}) => {
  // El guardia va sobre el dato de entrada y no sobre la suma. Con `reliefMeters`
  // a `null`, la suma da 400 —JavaScript trata null como cero— y eso pasaba por
  // bueno: sin relieve conocido se calculaba un tope igualmente y el mapa se
  // alejaba por un número que nadie había medido.
  if (!Number.isFinite(reliefMeters)) return Infinity

  const techo = reliefMeters + clearance
  if (techo <= 0) return Infinity

  const aZoomCero = cameraHeightAboveGround({ latitude, zoom: 0, pitch, viewportHeight, fov })
  if (!(aZoomCero > 0)) return Infinity

  return Math.log2(aZoomCero / techo)
}

/**
 * El zoom con el que entrar en 3D: el que se tenía, o el máximo seguro.
 *
 * **Solo se mete cuando la cámara iba a quedar dentro de una loma**, y ahí está la
 * decisión. Aplicar el margen siempre habría limitado el zoom también donde no
 * pasaba nada —una sabana, una playa—, y una herramienta que restringe sin motivo
 * se siente rota aunque funcione. Así que la pregunta es binaria: ¿se queda la
 * cámara por debajo de lo que sobresale alrededor? Si no, no se toca nada.
 *
 * Estar «justo por encima» no es mala vista, dicho sea de paso: el techo que se
 * le pasa es lo más alto de un par de kilómetros a la redonda, así que rozarlo
 * significa ir a la altura de la loma mirando por encima de ella.
 *
 * **Solo aleja, nunca acerca.** Quien está mirando de lejos lo pidió así.
 */
export const safeZoomFor = ({ currentZoom, reliefMeters, clearance, ...vista }) => {
  if (!Number.isFinite(reliefMeters)) return currentZoom

  const desnivel = cameraHeightAboveGround({ ...vista, zoom: currentZoom })
  if (desnivel > reliefMeters) return currentZoom

  const tope = maxZoomAboveTerrain({ ...vista, reliefMeters, clearance })
  return Number.isFinite(tope) ? Math.min(currentZoom, tope) : currentZoom
}
