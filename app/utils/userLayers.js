import { centralMeridianOf, CRS_LIST, SOURCE_CRS, toGeographic } from "./crs"

/**
 * Las capas que trae el usuario: sus propios archivos puestos sobre el mapa.
 *
 * Hasta ahora todo lo que dibujaba el visor venía de un servicio del Estado —ANM,
 * SGC, ANH—, con sus claves, sus colores y su orden escritos en `themeAreas.js`.
 * Un shapefile de un plano de topografía, un KML de una comisión de campo o el
 * CAD que manda el ingeniero no están en ninguna lista: aparecen cuando alguien
 * los abre y desaparecen al cerrar la pestaña.
 *
 * Eso obliga a dos cosas que el resto de las capas no necesitan:
 *
 * 1. **Las capas del estilo se crean al vuelo.** Todo lo demás está declarado
 *    desde el arranque (ver la cabecera de `mapStyles.js`), y por buenas razones.
 *    Aquí no se puede: no se sabe cuántas van a ser ni cómo se llaman. Lo que sí
 *    se conserva es la otra mitad de esa decisión —que el orden de pintado se
 *    resuelva en un solo sitio—, y de ahí `userStyleLayerIds()`, que
 *    `styleLayerIdsFor` usa igual que usa las de la ANM.
 *
 * 2. **Hay que preguntarse en qué sistema están las coordenadas.** Un servicio
 *    dice en qué sistema responde; un archivo, casi nunca. Un shapefile puede
 *    traer `.prj` y un KML es siempre geográfico, pero un DXF son números
 *    pelados: 1.043.210, 1.187.905. Esos dos números son un punto de Antioquia
 *    en Origen Bogotá y también un punto del Pacífico en CTM-12, y nada en el
 *    archivo dice cuál. Ver `guessSourceCrs`.
 *
 * Módulo puro: no sabe nada de MapLibre ni de archivos.
 */

/**
 * El prefijo que distingue una capa del usuario de las del visor.
 *
 * No es cosmético: `styleLayerIdsFor` y el panel reciben una clave y tienen que
 * saber de qué tipo de capa hablan sin consultar ninguna lista, porque la lista
 * de estas vive en el estado de React y esos dos módulos son puros. Los dos
 * puntos no pueden salir en una clave de las nuestras —son todas identificadores
 * de JavaScript— así que no hay colisión posible.
 */
export const USER_LAYER_PREFIX = "usuario:"

export const isUserLayerKey = (key) =>
  typeof key === "string" && key.startsWith(USER_LAYER_PREFIX)

export const userLayerKey = (id) => `${USER_LAYER_PREFIX}${id}`

/** El área del panel donde caen. Tiene que coincidir con la de `themeAreas`. */
export const USER_AREA_ID = "misdatos"

export const userSourceId = (key) => `${key}-src`
export const userFillLayerId = (key) => `${key}-relleno`
export const userLineLayerId = (key) => `${key}-linea`
export const userPointLayerId = (key) => `${key}-punto`

/**
 * Las tres capas del estilo que dibujan un archivo, **de abajo arriba**.
 *
 * Tres y no una porque un archivo trae lo que le dé la gana: un shapefile de
 * polígonos, un KML con la ruta de una comisión y sus paradas, un CAD con
 * linderos y mojones. MapLibre no tiene una capa que pinte de todo —`fill` no
 * dibuja líneas y `line` no dibuja puntos—, así que se declaran las tres y cada
 * una pinta lo que le toca. Las que no tienen nada que pintar no cuestan nada.
 *
 * El orden importa y es el mismo criterio que en las capas de la ANM: el
 * contorno por encima de su propio relleno translúcido, y los puntos encima de
 * todo, que suelen ser mojones o vértices y son lo más pequeño que hay.
 *
 * **No hay capa de texto a propósito.** El estilo del visor no declara `glyphs`,
 * así que una capa `symbol` con `text-field` no dibujaría nada —y MapLibre no
 * avisa—. Las etiquetas de la ANM se hacen con marcadores de HTML por eso mismo
 * (ver `mapLabelsGL`). Los rótulos de un CAD entran como puntos con su texto en
 * los atributos: se ven al pulsarlos, no escritos sobre el mapa.
 */
export const userStyleLayerIds = (key) => [
  userFillLayerId(key),
  userLineLayerId(key),
  userPointLayerId(key),
]

/**
 * Colores para las capas que llegan.
 *
 * **No es `LAYER_PALETTE` de `colors.js` a propósito**, aunque exista y sea la
 * que ofrece el selector: aquella empieza por los cuatro colores de las capas de
 * la ANM —está pensada para que quien cambie uno pueda volver atrás—, y una capa
 * propia del mismo color que los títulos mineros hace imposible la comparación,
 * que es justo para lo que se carga el archivo. Estos ocho están escogidos por lo
 * contrario: por no parecerse al granate de la ANM, al violeta del SGC ni al
 * verde de la ANH. El selector sigue ofreciendo la otra para quien quiera.
 */
export const USER_PALETTE = [
  "#e07a3f",
  "#3f8fe0",
  "#e0c93f",
  "#e04f8f",
  "#3fe0c9",
  "#8f3fe0",
  "#7fe03f",
  "#e03f3f",
]

export const colorForUserLayer = (cuantasHay = 0) =>
  USER_PALETTE[cuantasHay % USER_PALETTE.length]

/**
 * El nombre que se enseña, sacado del nombre del archivo.
 *
 * Se le quita la extensión y se cambian los guiones bajos por espacios, que es
 * como vienen casi todos los shapefiles («TITULOS_VIGENTES_2024.shp»). No se
 * capitaliza ni se toca nada más: el nombre del archivo es lo que quien lo cargó
 * reconoce, y «corregirlo» solo consigue que no encuentre su capa.
 */
export const layerLabelFromFileName = (fileName = "") => {
  const base = String(fileName).split(/[\\/]/).pop() || ""
  const sinExtension = base.replace(/\.[^.]+$/, "")
  const limpio = sinExtension.replace(/[_]+/g, " ").trim()
  return limpio || "Capa sin nombre"
}

/** Recorre las coordenadas de una geometría, sea del tipo que sea. */
const eachPosition = (coordinates, visit) => {
  if (!Array.isArray(coordinates)) return
  if (typeof coordinates[0] === "number") {
    visit(coordinates)
    return
  }
  coordinates.forEach((hijo) => eachPosition(hijo, visit))
}

/**
 * Cuántos polígonos, líneas y puntos trae una colección.
 *
 * Se enseña en el panel («12 polígonos · 340 puntos») porque es la única forma
 * que tiene quien carga un archivo de saber que entró lo que esperaba. Un DXF
 * del que salen 4.000 puntos y ningún polígono casi siempre significa que los
 * linderos venían como SPLINE y no se pudieron leer.
 */
export const countGeometries = (featureCollection) => {
  const cuenta = { polygons: 0, lines: 0, points: 0 }
  const features = featureCollection?.features ?? []

  features.forEach((feature) => {
    const tipo = feature?.geometry?.type
    if (tipo === "Polygon" || tipo === "MultiPolygon") cuenta.polygons += 1
    else if (tipo === "LineString" || tipo === "MultiLineString") cuenta.lines += 1
    else if (tipo === "Point" || tipo === "MultiPoint") cuenta.points += 1
  })

  return cuenta
}

/** Cómo se lee esa cuenta en una línea de panel. */
export const describeCount = (cuenta) => {
  const partes = []
  if (cuenta.polygons) partes.push(`${cuenta.polygons} ${cuenta.polygons === 1 ? "polígono" : "polígonos"}`)
  if (cuenta.lines) partes.push(`${cuenta.lines} ${cuenta.lines === 1 ? "línea" : "líneas"}`)
  if (cuenta.points) partes.push(`${cuenta.points} ${cuenta.points === 1 ? "punto" : "puntos"}`)
  return partes.join(" · ") || "sin figuras"
}

/**
 * El recuadro que ocupa una colección: `[oeste, sur, este, norte]`.
 *
 * Se descartan las coordenadas que no son números finitos. No es paranoia: un
 * DXF con una entidad a medio escribir trae `NaN`, y un solo `NaN` en el recuadro
 * hace que `fitBounds` mande la cámara a ningún sitio —el mapa se queda gris y
 * parece que la capa no cargó—.
 */
export const bboxOfFeatureCollection = (featureCollection) => {
  let oeste = Infinity
  let sur = Infinity
  let este = -Infinity
  let norte = -Infinity

  ;(featureCollection?.features ?? []).forEach((feature) => {
    eachPosition(feature?.geometry?.coordinates, ([x, y]) => {
      if (!Number.isFinite(x) || !Number.isFinite(y)) return
      if (x < oeste) oeste = x
      if (x > este) este = x
      if (y < sur) sur = y
      if (y > norte) norte = y
    })
  })

  if (oeste === Infinity) return null
  return [oeste, sur, este, norte]
}

/**
 * ¿Estos números pueden ser grados?
 *
 * Es la primera pregunta que hay que hacerle a un archivo, y basta con mirar los
 * topes del planeta: nada en grados se sale de ±180 y ±90. Un este de 1.043.210
 * no es una longitud por mucho que el archivo no diga nada.
 *
 * Lo que esta prueba **no** puede detectar es un CAD en coordenadas locales
 * —origen inventado en una esquina de la mina, valores de 0 a 800—, que pasa por
 * geográfico y aterriza en el golfo de Guinea. De eso avisa `plausiblyColombia`.
 */
export const looksGeographic = (bbox) => {
  if (!bbox) return false
  const [oeste, sur, este, norte] = bbox
  return (
    Math.abs(oeste) <= 180 &&
    Math.abs(este) <= 180 &&
    Math.abs(sur) <= 90 &&
    Math.abs(norte) <= 90
  )
}

/**
 * El recuadro de Colombia con margen, en grados.
 *
 * Generoso a propósito: de San Andrés (81,7° O y 13,4° N) al trapecio amazónico
 * (4,2° S) y a la frontera con Venezuela (66,8° O). No sirve para decidir nada
 * —hay planos legítimos de fuera del país— pero sí para dos cosas: elegir entre
 * varios sistemas de coordenadas candidatos, y avisar de que algo cayó lejísimos.
 */
export const COLOMBIA_BBOX = [-84, -5, -66, 14]

/**
 * El meridiano medio de Colombia continental: 73° O.
 *
 * No es el centro de `COLOMBIA_BBOX`, que se va a 75° O por llevar dentro San
 * Andrés y Providencia, a mil kilómetros del continente. Es el punto medio entre
 * la frontera con Panamá y la de Venezuela, y es el criterio con que se ordenan
 * los sistemas candidatos: no por casualidad es también el meridiano central que
 * el IGAC le puso al CTM-12 cuando tuvo que elegir uno para todo el país.
 */
export const COLOMBIA_CENTER_LON = -73

export const plausiblyColombia = (bbox) => {
  if (!bbox) return false
  const [oeste, sur, este, norte] = bbox
  const [cOeste, cSur, cEste, cNorte] = COLOMBIA_BBOX
  const centroX = (oeste + este) / 2
  const centroY = (sur + norte) / 2
  return centroX >= cOeste && centroX <= cEste && centroY >= cSur && centroY <= cNorte
}

/**
 * En qué sistema plano pueden estar estos números, si en alguno.
 *
 * **Por qué se adivina en vez de preguntar.** Un DXF y un shapefile sin `.prj`
 * son coordenadas sin sistema, y sin sistema no hay nada que dibujar. Se puede
 * preguntar antes de enseñar nada —y quien no sepa la respuesta se queda con el
 * mapa vacío— o se puede probar cuál de los diez sistemas que el visor conoce
 * deja el archivo dentro de Colombia, dibujarlo con ese y **decir que es una
 * suposición**, con el selector al lado. Se hace lo segundo: el 95 % de los
 * archivos de este país están en uno de los cinco orígenes MAGNA o en CTM-12, y
 * ver la capa encima del municipio correcto es la forma más rápida de confirmar
 * que la suposición era buena.
 *
 * **Lo que la hace fiable es que los rangos no se solapan.** Un CTM-12 ronda los
 * 5.000.000 en el este y los 2.000.000 en el norte; un origen MAGNA, el millón
 * en los dos; un UTM, los 500.000 y el millón y pico. Probar un CTM-12 con
 * números de MAGNA lo manda al Pacífico, y al revés, a Brasil. Los que sí se
 * confunden entre sí son los cinco orígenes MAGNA —comparten falso este y falso
 * norte y solo cambia el meridiano central—, así que un punto de Antioquia en
 * Origen Bogotá también cae en Colombia leído como Origen Este. Por eso se
 * devuelven **todos** los candidatos y no solo el primero: el panel dice cuántos
 * había, que es la forma honesta de contar que aquí hay una duda de verdad.
 *
 * **Caer dentro de Colombia no basta, y eso costó dos pruebas en rojo.** El país
 * mide dieciocho grados de ancho, así que hay lecturas equivocadas que también
 * aterrizan dentro de él: un shapefile en UTM 18N leído como Origen Bogotá queda
 * 467 km al oeste —en Nariño, perfectamente verosímil— y un CAD en coordenadas
 * locales de tres cifras, leído igual, cae en el Pacífico frente a Tumaco. Las
 * dos pasaban por buenas. La segunda condición es que el punto quede dentro de la
 * franja que cubre ese sistema, que es lo que dice `coverageHalfSpan` en
 * `crs.js`: tres grados a cada lado del meridiano central en un huso, once en el
 * CTM-12, que es nacional. Los 4,2 grados de desvío del UTM y los 9 del CAD local
 * se caen ahí.
 *
 * **El orden de la respuesta no puede ser el de la lista de sistemas**, y aquí hay
 * otra prueba en rojo detrás. Un punto de Antioquia en UTM 18N es también un punto
 * legítimo de UTM 17N, 660 km más al oeste: los husos comparten falso este y solo
 * cambia el meridiano. Con el orden de `CRS_LIST` ganaba el 17, que en Colombia
 * solo cubre una esquina de Nariño. Y ordenar por «lo cerca que queda del
 * meridiano de su sistema» empata siempre, porque los husos están a distancias
 * iguales.
 *
 * Lo que decide es **cuál de los sistemas empatados cubre mejor el país**: se
 * ordenan por lo cerca que está su meridiano central del meridiano medio de
 * Colombia continental. Eso deja de primero el huso 18 entre los UTM —el que
 * cubre casi todo el territorio— y el Origen Bogotá entre los cinco MAGNA, que es
 * el que se usó como origen nacional de hecho durante décadas. En caso de duda,
 * el más probable.
 *
 * @returns {string[]} identificadores EPSG, del más probable al menos
 */
export const candidateSourceCrs = (bbox) => {
  if (!bbox) return []
  const [oeste, sur, este, norte] = bbox
  const centro = [(oeste + este) / 2, (sur + norte) / 2]

  const encaja = (crs) => {
    try {
      const [lon, lat] = toGeographic(centro, crs.id)
      if (!plausiblyColombia([lon, lat, lon, lat])) return false

      const meridiano = centralMeridianOf(crs.id)
      const franja = crs.coverageHalfSpan
      if (meridiano === null || !franja) return true

      return Math.abs(lon - meridiano) <= franja
    } catch {
      // proj4 lanza con números absurdos —un este de 10^12—, y eso es
      // exactamente un «no, no es este sistema».
      return false
    }
  }

  const cobertura = (crs) => Math.abs((centralMeridianOf(crs.id) ?? 0) - COLOMBIA_CENTER_LON)

  return CRS_LIST.filter((crs) => crs.projected)
    .filter(encaja)
    .sort((a, b) => cobertura(a) - cobertura(b))
    .map((crs) => crs.id)
}

/** El candidato de más arriba, o nada si ninguno deja el archivo en Colombia. */
export const guessSourceCrs = (bbox) => candidateSourceCrs(bbox)[0] ?? null

/**
 * Pasa una colección entera al sistema en que trabaja el mapa.
 *
 * Se guarda **siempre** la colección original tal como venía del archivo, y esta
 * función se vuelve a llamar cada vez que alguien cambia el sistema en el panel.
 * La alternativa —reproyectar en el sitio y quedarse solo con el resultado— hace
 * que el segundo intento parta de coordenadas ya transformadas: elegir Bogotá y
 * luego CTM-12 daría un punto en el mar sin que nada explique por qué.
 *
 * Cuesta el doble de memoria y es lo correcto.
 */
export const reprojectFeatureCollection = (featureCollection, crsId) => {
  if (!featureCollection) return featureCollection
  if (!crsId || crsId === SOURCE_CRS) return featureCollection

  const convertirPosicion = (posicion) => {
    const [x, y] = posicion
    if (!Number.isFinite(x) || !Number.isFinite(y)) return posicion
    const [lon, lat] = toGeographic([x, y], crsId)
    // La tercera componente, si viene, es una altura en metros: no la toca
    // ninguna de estas transformaciones, que son todas planas.
    return posicion.length > 2 ? [lon, lat, posicion[2]] : [lon, lat]
  }

  const convertir = (coordinates) => {
    if (!Array.isArray(coordinates)) return coordinates
    if (typeof coordinates[0] === "number") return convertirPosicion(coordinates)
    return coordinates.map(convertir)
  }

  return {
    ...featureCollection,
    features: (featureCollection.features ?? []).map((feature) => {
      if (!feature?.geometry?.coordinates) return feature
      return {
        ...feature,
        geometry: {
          ...feature.geometry,
          coordinates: convertir(feature.geometry.coordinates),
        },
      }
    }),
  }
}

/**
 * La ficha completa de una capa cargada, lista para el panel y para el mapa.
 *
 * Lleva las dos colecciones —la del archivo y la reproyectada— por lo dicho en
 * `reprojectFeatureCollection`, y el estado de la duda sobre el sistema:
 * `crsGuessed` es lo que hace que el panel la enseñe en ámbar y con el selector
 * abierto en vez de callarse.
 */
export const buildUserLayer = ({
  id,
  label,
  source,
  featureCollection,
  crsId,
  crsGuessed = false,
  warnings = [],
  fillColor = USER_PALETTE[0],
  lineColor,
}) => {
  const original = featureCollection ?? { type: "FeatureCollection", features: [] }
  const data = reprojectFeatureCollection(original, crsId)
  const bbox = bboxOfFeatureCollection(data)
  const cuenta = countGeometries(data)
  const key = userLayerKey(id)

  return {
    key,
    id,
    areaId: USER_AREA_ID,
    label,
    // De qué archivo salió y en qué formato: es lo que se enseña al pasar por
    // encima de la fila, y lo que permite distinguir dos capas que el usuario
    // llamó igual.
    source,
    // `raster: false` para que el panel ofrezca el selector de color: estas
    // llegan como geometría, no dibujadas.
    raster: false,
    pending: false,
    crsId,
    crsGuessed,
    warnings,
    // Los colores viajan en la ficha, como en `THEME_LAYERS`, porque son lo que
    // necesita el estado inicial de la capa en el panel. Del contorno se encarga
    // `darken` en quien la crea; aquí solo se guarda lo que llegue.
    fillColor,
    lineColor: lineColor ?? fillColor,
    counts: cuenta,
    hint: describeCount(cuenta),
    bbox,
    // Fuera de Colombia no es un error —un plano puede ser de donde sea— pero sí
    // es lo primero que hay que mirar cuando una capa «no aparece».
    farFromColombia: Boolean(bbox) && !plausiblyColombia(bbox),
    original,
    data,
  }
}

/** La misma capa con otro sistema de origen: se reproyecta desde el archivo. */
export const withSourceCrs = (layer, crsId) =>
  buildUserLayer({
    id: layer.id,
    label: layer.label,
    source: layer.source,
    featureCollection: layer.original,
    crsId,
    // Elegido a mano ya no es una suposición, y el panel deja de avisar.
    crsGuessed: false,
    warnings: layer.warnings,
    fillColor: layer.fillColor,
    lineColor: layer.lineColor,
  })
