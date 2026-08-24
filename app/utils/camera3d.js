/**
 * Dónde está la cámara, y hasta dónde se puede acercar sin meterse en el cerro.
 *
 * **El problema que resuelve.** Al pulsar «Ver en 3D» con mucho zoom, la vista
 * salía desde debajo del suelo y había que alejarse a mano buscando el sitio.
 * No era un fallo de dibujo: era geometría.
 *
 * En un mapa plano, el zoom **es** la altura de la cámara. Cada nivel que se
 * acerca la baja a la mitad: sobre Medellín, a zoom 13 la cámara está a 12.800 m
 * y a zoom 18 a 400. Mientras el mapa es plano da igual, porque el suelo está a
 * cota cero por definición. Pero al encender el 3D el terreno sube a su cota de
 * verdad —1.800 m, y con exageración 1,5 la superficie dibujada llega a 2.700—
 * mientras la cámara sigue donde estaba. A zoom 18 eso deja la cámara 2.300 m
 * **por debajo** de la montaña. Está dentro del cerro, literalmente.
 *
 * E inclinar la empeora: al inclinarse conserva la distancia al punto que mira,
 * así que baja. A 58° se queda al 53 % de la altura que tenía.
 *
 * **Por qué la solución es alejarse y no otra cosa.** En una cámara en
 * perspectiva, la altura y el detalle están atados: el zoom es la altura. Se
 * puede aflojar el vínculo estrechando el campo de visión —un teleobjetivo mira
 * de lejos y ve pequeño—, pero para salvar 2.300 m a zoom 18 haría falta un
 * campo de unos 3°, y con eso el relieve pierde toda la perspectiva y se ve
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
 * Cuánto se deja entre la cámara y lo más alto del terreno, en metros.
 *
 * **Es un margen de aterrizaje, no un mínimo permanente**, y la diferencia
 * importa: solo se aplica cuando hay que corregir. Si se exigiera siempre,
 * mirar en 3D una zona plana a la orilla del mar quedaría limitado a zoom 17
 * sin que nada estuviera mal — una restricción inventada donde no había
 * problema. Ver `safeZoomFor`.
 */
export const CLEARANCE_M = 400

/**
 * Qué se considera «lo que hay alrededor», en metros.
 *
 * No basta con la cota del punto que se mira. Estando en el fondo de un valle,
 * una cámara 400 m sobre el fondo queda metida dentro de la ladera de enfrente y
 * la vista es un muro de tierra. Lo que tiene que quedar por debajo es la loma,
 * no el suelo que se pisa. Dos kilómetros es el orden de lo que se ve en pantalla
 * a los zooms donde esto pasa.
 */
export const SCENE_RADIUS_M = 2000

/**
 * Nivel de teselas con el que se mira «qué tan alto está el terreno por aquí».
 *
 * Grueso a propósito: la pregunta es la altura de la loma, no el detalle de la
 * ladera, y una tesela de este nivel abarca 19 km, así que casi siempre basta
 * una. Suaviza las crestas unas decenas de metros, que es justo lo que absorbe
 * el margen de arriba.
 */
export const LOOKAROUND_DEM_ZOOM = 11

/**
 * Altura de la cámara sobre el nivel del mar, en metros.
 *
 * Es la fórmula que usa MapLibre por dentro, escrita aquí para poder invertirla.
 * Comprobada contra `transform.getCameraAltitude()` en el navegador: a zoom 13 y
 * 58° de inclinación devuelve 6.787 m y MapLibre reporta 6.787.
 *
 * @param {number} latitude grados
 * @param {number} zoom el del mapa (teselas de 512 px)
 * @param {number} pitch inclinación de la cámara, en grados
 * @param {number} viewportHeight alto del lienzo, en píxeles
 * @param {number} [fov] campo de visión vertical, en grados
 */
export const cameraAltitude = ({ latitude, zoom, pitch, viewportHeight, fov = DEFAULT_FOV }) => {
  // La distancia de la cámara al punto que mira, en píxeles. Sale de encajar el
  // alto de la pantalla dentro del campo de visión.
  const distancia = (0.5 * viewportHeight) / Math.tan((fov * Math.PI) / 360)
  return distancia * Math.cos((pitch * Math.PI) / 180) * metersPerPixel(latitude, zoom)
}

/**
 * El zoom más cercano al que la cámara todavía vuela por encima del terreno.
 *
 * Se despeja de la fórmula de arriba: la altura de la cámara se divide por dos
 * en cada nivel de zoom, así que basta saber a cuánto está a zoom cero y dividir
 * hasta llegar al techo que se le pide.
 *
 * @param {number} terrainTopMeters lo más alto del terreno alrededor, **ya
 *   multiplicado por la exageración** — es lo que se dibuja, no lo que mide
 * @param {number} [clearance] margen de vista por encima de eso
 * @returns {number} un zoom, no necesariamente entero; `Infinity` si no hay nada
 *   que esquivar
 */
export const maxZoomAboveTerrain = ({
  latitude,
  pitch,
  viewportHeight,
  fov = DEFAULT_FOV,
  terrainTopMeters,
  clearance = CLEARANCE_M,
}) => {
  // El guardia va sobre el dato de entrada y no sobre la suma. Con
  // `terrainTopMeters` a `null`, la suma da 400 —JavaScript trata null como
  // cero— y eso pasaba por bueno: sin altura conocida se calculaba un tope
  // igualmente y el mapa se alejaba por un número que nadie había medido.
  if (!Number.isFinite(terrainTopMeters)) return Infinity

  const techo = terrainTopMeters + clearance
  if (techo <= 0) return Infinity

  const aZoomCero = cameraAltitude({ latitude, zoom: 0, pitch, viewportHeight, fov })
  if (!(aZoomCero > 0)) return Infinity

  return Math.log2(aZoomCero / techo)
}

/**
 * El zoom con el que entrar en 3D: el que se tenía, o el máximo seguro.
 *
 * **Solo se mete cuando la cámara iba a quedar bajo tierra**, y ahí está la
 * decisión. Aplicar el margen siempre habría limitado el zoom también donde no
 * pasaba nada —una playa, una sabana—, y una herramienta que restringe sin
 * motivo se siente rota aunque funcione. Así que la pregunta es binaria: ¿queda
 * la cámara por debajo de la superficie? Si no, no se toca nada. Si sí, se sale
 * hasta el margen.
 *
 * Estar «justo por encima» no es una mala vista, dicho sea de paso: el techo que
 * se le pasa es lo más alto de un par de kilómetros a la redonda, así que rozarlo
 * significa estar a la altura de la loma mirando por encima de ella.
 *
 * **Solo aleja, nunca acerca.** Quien está mirando de lejos lo pidió así.
 */
export const safeZoomFor = ({ currentZoom, terrainTopMeters, clearance, ...vista }) => {
  if (!Number.isFinite(terrainTopMeters)) return currentZoom

  const altura = cameraAltitude({ ...vista, zoom: currentZoom })
  if (altura > terrainTopMeters) return currentZoom

  const tope = maxZoomAboveTerrain({ ...vista, terrainTopMeters, clearance })
  return Number.isFinite(tope) ? Math.min(currentZoom, tope) : currentZoom
}
