/**
 * De un DXF de AutoCAD a GeoJSON.
 *
 * El DXF es el formato en que llega el trabajo de topografía: el plano del
 * lindero levantado con GPS, el polígono que el ingeniero dibujó sobre el título,
 * las labores subterráneas. Es un formato de dibujo, no de datos geográficos, y
 * eso marca todo lo que hay aquí:
 *
 * - **No trae sistema de coordenadas.** Ni uno. Son metros desde un origen que el
 *   archivo no nombra. Quién decide en qué sistema están es `userLayers.js` (ver
 *   `guessSourceCrs`); este módulo entrega los números tal como están escritos.
 *
 * - **No trae atributos, trae capas.** Lo que en un shapefile serían columnas,
 *   aquí es el nombre de la capa de dibujo: «LINDERO», «MOJONES», «VIA». Se
 *   guarda en `CAPA`, que acaba siendo el campo por el que se distingue una cosa
 *   de otra al pulsarla.
 *
 * - **No distingue un polígono de una línea cerrada**, porque para dibujar da
 *   igual. Aquí no: una polilínea marcada como cerrada se convierte en polígono
 *   —es lo que quiere decir un lindero— y una abierta en línea.
 *
 * - **Casi todo el dibujo no es geometría.** Cotas, sombreados, splines, bloques
 *   con el rótulo de la empresa. Lo que no se sabe leer **se cuenta y se dice**,
 *   en vez de desaparecer: un CAD del que salen tres líneas de las doscientas
 *   entidades que tiene es un archivo que no se cargó, y quien lo abre tiene que
 *   enterarse por el panel y no por el mapa vacío.
 *
 * La lectura del archivo la hace `dxf-parser`, que es quien sabe de los códigos
 * de grupo del formato. Este módulo traduce lo que aquel entrega, y es una
 * función pura: recibe el objeto ya interpretado y devuelve figuras.
 */

/** Cuántos segmentos se le dan a un círculo completo al convertirlo en línea. */
const SEGMENTOS_POR_VUELTA = 64

/**
 * Hasta dónde se persigue un bloque metido dentro de otro bloque.
 *
 * Los bloques de AutoCAD se pueden anidar, y un archivo mal cerrado puede
 * referenciarse a sí mismo. Sin tope eso es un bucle infinito que cuelga la
 * pestaña sin ningún mensaje; con tope, lo peor que pasa es que un rótulo muy
 * anidado no salga.
 */
const PROFUNDIDAD_MAX_BLOQUES = 5

const esPunto = (p) => p && Number.isFinite(p.x) && Number.isFinite(p.y)

const posicion = (p) => [p.x, p.y]

/** Quita los puntos repetidos seguidos, que en un anillo rompen el polígono. */
const sinRepetidos = (posiciones) =>
  posiciones.filter((p, i) => i === 0 || p[0] !== posiciones[i - 1][0] || p[1] !== posiciones[i - 1][1])

/**
 * Los atributos que lleva cada figura.
 *
 * Pocos y con nombres en español porque es lo que se va a leer en la ficha del
 * mapa. `TIPO` es la entidad de CAD de la que salió, que es la pista para
 * entender por qué algo se dibujó como línea y no como polígono.
 */
const propiedadesDe = (entidad, extra = {}) => {
  const props = {
    CAPA: entidad.layer ?? "0",
    TIPO: entidad.type,
    ...extra,
  }
  if (entidad.handle !== undefined && entidad.handle !== null) props.HANDLE = String(entidad.handle)
  return props
}

const feature = (geometry, properties) => ({ type: "Feature", geometry, properties })

/**
 * Una polilínea, abierta o cerrada.
 *
 * `shape: true` es cómo `dxf-parser` dice «está cerrada» —el bit 1 del código 70
 * del formato—. Un polígono necesita además que el primer punto se repita al
 * final, que el DXF no escribe porque para dibujar no hace falta.
 *
 * Con menos de tres vértices distintos no hay polígono posible: se deja como
 * línea, que es lo que se puede dibujar honestamente, en vez de inventar un
 * anillo degenerado que MapLibre descarta en silencio.
 */
const dePolilinea = (entidad) => {
  const puntos = sinRepetidos((entidad.vertices ?? []).filter(esPunto).map(posicion))
  if (puntos.length < 2) return null

  const cerrada = Boolean(entidad.shape)
  if (cerrada && puntos.length >= 3) {
    const anillo = [...puntos, puntos[0]]
    return feature({ type: "Polygon", coordinates: [anillo] }, propiedadesDe(entidad))
  }

  return feature({ type: "LineString", coordinates: puntos }, propiedadesDe(entidad))
}

const deLinea = (entidad) => {
  const puntos = (entidad.vertices ?? []).filter(esPunto).map(posicion)
  if (puntos.length < 2) return null
  return feature({ type: "LineString", coordinates: puntos }, propiedadesDe(entidad))
}

const dePunto = (entidad) => {
  const p = entidad.position
  if (!esPunto(p)) return null
  return feature({ type: "Point", coordinates: posicion(p) }, propiedadesDe(entidad))
}

/**
 * Un rótulo: entra como punto, con su texto en los atributos.
 *
 * No se dibuja el texto sobre el mapa —el estilo del visor no tiene tipografías
 * cargadas, ver `userStyleLayerIds`— pero tirar los rótulos sería perder la mitad
 * de la información de un plano: los números de los mojones, el nombre de la
 * quebrada, la cota. Puestos como punto se pueden pulsar y se leen.
 */
const deTexto = (entidad) => {
  const p = entidad.startPoint ?? entidad.position
  if (!esPunto(p)) return null
  const texto = entidad.text ?? ""
  return feature(
    { type: "Point", coordinates: posicion(p) },
    propiedadesDe(entidad, { TEXTO: texto }),
  )
}

/**
 * Un círculo, convertido en polígono de 64 lados.
 *
 * Polígono y no línea porque en un plano de minería un círculo delimita algo
 * —el área de influencia de un pozo, la boca de una labor—, y como polígono se
 * le puede medir el área y se ve relleno como el resto de los cerramientos.
 */
const deCirculo = (entidad) => {
  const c = entidad.center
  if (!esPunto(c) || !Number.isFinite(entidad.radius) || entidad.radius <= 0) return null

  const anillo = []
  for (let i = 0; i < SEGMENTOS_POR_VUELTA; i += 1) {
    const angulo = (i / SEGMENTOS_POR_VUELTA) * Math.PI * 2
    anillo.push([c.x + entidad.radius * Math.cos(angulo), c.y + entidad.radius * Math.sin(angulo)])
  }

  // El anillo se cierra **copiando el primer vértice**, no calculando el ángulo
  // de la vuelta completa: `cos(2π)` no devuelve exactamente 1, así que el último
  // punto salía a una diezmilésima de milímetro del primero y el anillo quedaba
  // abierto para cualquiera que compare las dos posiciones — que es lo que exige
  // el formato GeoJSON y lo que miran las librerías de geometría.
  anillo.push(anillo[0])

  return feature({ type: "Polygon", coordinates: [anillo] }, propiedadesDe(entidad))
}

/**
 * Un arco: línea, porque un arco no cierra nada.
 *
 * Los ángulos llegan **en radianes** de `dxf-parser` aunque el DXF los escriba en
 * grados, y el final puede ser menor que el principio cuando el arco cruza el
 * cero. Sin sumar la vuelta, el arco sale dibujado por el lado contrario: los 30°
 * que van de 350° a 20° se convertirían en los 330° que sobran.
 */
const deArco = (entidad) => {
  const c = entidad.center
  if (!esPunto(c) || !Number.isFinite(entidad.radius) || entidad.radius <= 0) return null

  const inicio = Number.isFinite(entidad.startAngle) ? entidad.startAngle : 0
  let fin = Number.isFinite(entidad.endAngle) ? entidad.endAngle : Math.PI * 2
  while (fin < inicio) fin += Math.PI * 2

  const pasos = Math.max(2, Math.ceil(((fin - inicio) / (Math.PI * 2)) * SEGMENTOS_POR_VUELTA))
  const linea = []
  for (let i = 0; i <= pasos; i += 1) {
    const angulo = inicio + ((fin - inicio) * i) / pasos
    linea.push([c.x + entidad.radius * Math.cos(angulo), c.y + entidad.radius * Math.sin(angulo)])
  }

  return feature({ type: "LineString", coordinates: linea }, propiedadesDe(entidad))
}

/**
 * Un SOLID o un 3DFACE: el triángulo o cuadrilátero relleno del CAD.
 *
 * `dxf-parser` los entrega con cuatro puntos, y el cuarto repite el tercero
 * cuando es un triángulo — de ahí el `sinRepetidos`.
 */
const deCara = (entidad) => {
  const puntos = sinRepetidos((entidad.points ?? []).filter(esPunto).map(posicion))
  if (puntos.length < 3) return null
  return feature({ type: "Polygon", coordinates: [[...puntos, puntos[0]]] }, propiedadesDe(entidad))
}

const CONVERSORES = {
  LWPOLYLINE: dePolilinea,
  POLYLINE: dePolilinea,
  LINE: deLinea,
  POINT: dePunto,
  TEXT: deTexto,
  MTEXT: deTexto,
  ATTRIB: deTexto,
  CIRCLE: deCirculo,
  ARC: deArco,
  SOLID: deCara,
  "3DFACE": deCara,
}

/**
 * Mueve, gira y escala una figura, que es lo que hace una inserción de bloque.
 *
 * Se aplica **a la figura ya convertida** y no a la entidad de CAD: así hay una
 * sola transformación para los diez tipos de entidad, en vez de una por tipo. El
 * orden —primero escalar, luego girar, luego mover— es el de AutoCAD, y cambiarlo
 * da un plano parecido pero corrido.
 */
const transformarFigura = (figura, { x = 0, y = 0, xScale = 1, yScale = 1, rotation = 0 }) => {
  const radianes = ((Number.isFinite(rotation) ? rotation : 0) * Math.PI) / 180
  const cos = Math.cos(radianes)
  const sen = Math.sin(radianes)
  const ex = Number.isFinite(xScale) && xScale !== 0 ? xScale : 1
  const ey = Number.isFinite(yScale) && yScale !== 0 ? yScale : 1

  const mover = (coordinates) => {
    if (typeof coordinates[0] === "number") {
      const px = coordinates[0] * ex
      const py = coordinates[1] * ey
      return [x + px * cos - py * sen, y + px * sen + py * cos]
    }
    return coordinates.map(mover)
  }

  return {
    ...figura,
    geometry: { ...figura.geometry, coordinates: mover(figura.geometry.coordinates) },
  }
}

/**
 * Convierte un DXF ya interpretado en figuras de GeoJSON.
 *
 * @param {{entities?: object[], blocks?: object}} parsed lo que devuelve `dxf-parser`
 * @returns {{features: object[], skipped: Record<string, number>}} las figuras y
 *   la cuenta de lo que no se supo leer, por tipo de entidad
 */
export const dxfToFeatures = (parsed) => {
  const features = []
  const skipped = {}
  const bloques = parsed?.blocks ?? {}

  const convertir = (entidades, transformacion, profundidad) => {
    ;(entidades ?? []).forEach((entidad) => {
      if (!entidad?.type) return

      // Una inserción no dibuja nada por sí misma: es «pon aquí el bloque tal».
      // Sin desplegarla, un plano hecho todo de bloques —que es lo normal en los
      // que salen de una plantilla de empresa— se carga vacío.
      if (entidad.type === "INSERT") {
        const bloque = bloques[entidad.name]
        if (!bloque || profundidad >= PROFUNDIDAD_MAX_BLOQUES) {
          skipped.INSERT = (skipped.INSERT ?? 0) + 1
          return
        }

        // El bloque tiene su propio punto base, y sus entidades están escritas
        // respecto a él: hay que descontarlo antes de llevarlas al sitio de la
        // inserción. Sin esto, un bloque con punto base distinto de cero sale
        // desplazado justo esa distancia.
        const base = bloque.position ?? { x: 0, y: 0 }
        const propia = {
          x: (entidad.position?.x ?? 0) - (base.x ?? 0) * (entidad.xScale ?? 1),
          y: (entidad.position?.y ?? 0) - (base.y ?? 0) * (entidad.yScale ?? 1),
          xScale: entidad.xScale ?? 1,
          yScale: entidad.yScale ?? 1,
          rotation: entidad.rotation ?? 0,
        }

        convertir(bloque.entities, [...transformacion, propia], profundidad + 1)
        return
      }

      const conversor = CONVERSORES[entidad.type]
      if (!conversor) {
        skipped[entidad.type] = (skipped[entidad.type] ?? 0) + 1
        return
      }

      const figura = conversor(entidad)
      if (!figura) {
        skipped[entidad.type] = (skipped[entidad.type] ?? 0) + 1
        return
      }

      // Las transformaciones se aplican de dentro hacia fuera: la del bloque más
      // interno primero, y la de la inserción de más arriba al final.
      const colocada = transformacion.reduce((acc, t) => transformarFigura(acc, t), figura)
      features.push(colocada)
    })
  }

  convertir(parsed?.entities, [], 0)

  return { features, skipped }
}

/**
 * Lo que no se pudo leer, dicho en una frase.
 *
 * Se nombran los tipos de entidad tal como los escribe AutoCAD —SPLINE,
 * DIMENSION, HATCH— y no traducidos: es lo que alguien puede buscar en su
 * programa para convertirlo («explotar» un hatch, convertir un spline en
 * polilínea) y lo que va a reconocer en el nombre de la capa.
 */
export const describeSkipped = (skipped = {}) => {
  const entradas = Object.entries(skipped).filter(([, n]) => n > 0)
  if (entradas.length === 0) return null

  const total = entradas.reduce((suma, [, n]) => suma + n, 0)
  const detalle = entradas
    .sort((a, b) => b[1] - a[1])
    .slice(0, 4)
    .map(([tipo, n]) => `${n} ${tipo}`)
    .join(", ")

  return `${total} ${total === 1 ? "entidad del CAD no se pudo leer" : "entidades del CAD no se pudieron leer"} (${detalle}). ` +
    "Los splines, sombreados y cotas no son geometría que el visor pueda dibujar: conviértelos a polilíneas en el CAD y vuelve a exportar."
}
