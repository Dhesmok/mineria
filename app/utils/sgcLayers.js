/**
 * Las capas de geología del Servicio Geológico Colombiano.
 *
 * ## Por qué van como imagen y no como polígonos, que es lo que hace la ANM
 *
 * Tres razones, y las tres pesan:
 *
 * 1. **La simbología es el dato.** Un geólogo reconoce una unidad por su color y
 *    su trama: el amarillo pálido de un depósito cuaternario, el granate de un
 *    batolito. Traer los polígonos y repintarlos con dos colores nuestros —que es
 *    lo que hacemos con los títulos mineros— convertiría un mapa geológico en una
 *    mancha. El servicio ya sabe dibujarse; se le pide dibujado.
 * 2. **El volumen.** El mapa geológico nacional son miles de polígonos con
 *    contornos largos. Pedirlos como GeoJSON en cada movimiento del mapa es el
 *    error que ya costó una tanda con la capa de pendiente.
 * 3. **No hay que nombrar ni un índice de capa.** Se exporta el servicio
 *    completo, así que nunca se escribe «la capa 177». Los índices del SGC son
 *    tan volátiles como los de la ANM —dentro de «Geología por departamentos»,
 *    «Fallas Geológicas» aparece en la 43, la 60 y la 177 según el
 *    departamento—, y la trampa nº 1 de este proyecto es justo esa.
 *
 * ## Y por qué pasan por una ruta propia en vez de ir directas
 *
 * MapLibre pide las teselas ráster con `fetch`, no con una etiqueta `img`. Eso
 * las somete a CORS: si el servidor del SGC no manda la cabecera que lo permite,
 * el navegador descarta la imagen y la capa no se dibuja, sin más aviso que un
 * mensaje en la consola.
 *
 * **No he podido comprobar si el SGC la manda**: el proxy de la máquina donde se
 * escribió esto bloquea el acceso a `sgc.gov.co`. Ante esa duda, la ruta propia
 * es la opción que funciona en los dos casos. Si algún día se comprueba que el
 * SGC permite CORS, quitar el intermediario es borrar una línea de aquí — y
 * conviene hacerlo, porque cada tesela deja de pasar por nuestro servidor.
 *
 * **El cliente pide por clave, no por dirección.** `/api/sgc?capa=geologia-2023`
 * y no `/api/sgc?url=…`. Es lo que impide que la ruta acabe siendo un proxy
 * abierto con el que cualquiera pueda pedir lo que quiera desde nuestro dominio:
 * solo existen las cinco direcciones de esta lista.
 *
 * Módulo puro: describe servicios y arma direcciones. No toca MapLibre.
 */

/** Prefijo de los identificadores dentro del estilo del mapa. */
export const SGC_SOURCE_PREFIX = "sgc-src-"
export const SGC_LAYER_PREFIX = "sgc-"

export const sgcSourceId = (key) => `${SGC_SOURCE_PREFIX}${key}`
export const sgcLayerId = (key) => `${SGC_LAYER_PREFIX}${key}`

/**
 * El catálogo.
 *
 * `service` es la dirección del MapServer **sin** `/export`: la arma
 * `sgcExportUrl`. `scale` y `year` no son adorno — un mapa a 1:500.000 y otro a
 * 1:100.000 responden preguntas distintas, y con la capa encendida no hay forma
 * de saber cuál se está mirando si no se dice.
 *
 * El orden es de menos a más detalle, que es como se usan: primero el nacional
 * para situarse, después la plancha.
 *
 * **Los nombres son cortos a propósito.** En la fila del panel caben unos
 * veinticinco caracteres antes de que el nombre se corte con puntos suspensivos,
 * y «Mapa geológico de Colombia» se leía «Mapa geológico de Colo…», que no
 * distingue nada. El encabezado del área ya dice «GEOLOGÍA · SGC», así que
 * repetirlo en cada fila era gastar el ancho en lo que ya se sabe. Lo que hace
 * falta ahí es la escala, que es lo que diferencia una capa de la otra.
 *
 * **La grilla de planchas del IGAC estuvo aquí y se quitó**: iba desfasada
 * respecto al estado de la cartografía, y dos retículas que dicen cosas
 * distintas sobre la misma plancha es peor que ninguna.
 *
 * `selectable: false` marca los servicios que no se despiezan — ver
 * `geologiaNacional`.
 */
export const SGC_LAYERS = [
  {
    key: "geologiaNacional",
    label: "Geología 1:500.000",
    // Este servicio no se despieza. Tiene dos capas dentro, pero no son dos
    // temas independientes sino las dos mitades de un mismo dibujo: encender
    // solo una deja el mapa a medias o en blanco. Ofrecer esa elección era
    // ofrecer una forma de romperlo.
    selectable: false,
    service:
      "https://srvags.sgc.gov.co/arcgis/rest/services/Mapa_Geologico_Colombia/Mapa_Geologico_Colombia_V2023/MapServer",
    scale: "1:500.000",
    year: 2023,
    hint: "Unidades geológicas de todo el país. Es la versión más reciente publicada por el SGC.",
  },
  {
    key: "geologiaDepartamentos",
    label: "Geología por departamento",
    service:
      "https://srvags.sgc.gov.co/arcgis/rest/services/Geologia/Geologia_Por_Departamentos/MapServer",
    scale: "variable",
    year: null,
    hint: "Planchas departamentales con sus unidades y sus fallas. El detalle cambia de un departamento a otro.",
  },
  {
    key: "planchas",
    label: "Planchas 1:100.000",
    service:
      "https://srvags.sgc.gov.co/arcprod/rest/services/Geologia/Atlas_Geologico_2020/MapServer",
    scale: "1:100.000",
    year: 2020,
    hint: "Tercera edición del Atlas Geológico: la geología de las planchas publicadas, al mayor detalle disponible.",
  },
  {
    key: "estadoCartografia",
    label: "Estado cartográfico",
    service:
      "https://srvags.sgc.gov.co/arcgis/rest/services/Estado_Cartografia_Geologica/Estado_Catografia_Geologica/MapServer",
    scale: "1:100.000",
    year: null,
    // Puede parecer una capa administrativa y es lo contrario: dice si lo que se
    // está mirando en las otras capas es cartografía levantada o un relleno de
    // escala menor. Sin ella, un vacío de información y un terreno homogéneo se
    // ven exactamente igual.
    hint: "Qué planchas tienen cartografía publicada y cuáles no. Sirve para saber si un vacío es geología o es falta de dato.",
  },
  {
    key: "metalogenico2022",
    label: "Mapa Metalogénico 2022",
    service:
      "https://srvags.sgc.gov.co/arcgis/rest/services/Mapa_Metalogenico_2022/Mapa_Metalogenico_Colombia_2022/MapServer",
    scale: "1:1.000.000",
    year: 2022,
    hint: "Depósitos minerales, distritos y cinturones metalogénicos, distritos aluviales, carbones y fosfatos.",
  },
  {
    key: "depositosMinerales",
    label: "Depósitos minerales",
    service:
      "https://srvags.sgc.gov.co/arcgis/rest/services/Anomalias_Geoquimica/Depositos_Minerales/MapServer",
    scale: "variable",
    year: null,
    hint: "Inventario de yacimientos minerales clasificados y subprovincias metalogénicas de Colombia.",
  },
  {
    key: "potencialCarbonifero",
    label: "Potencial carbonífero",
    service:
      "https://srvags.sgc.gov.co/arcgis/rest/services/Mapa_Potencial_Carbonifero_Colombia/Mapa_Potencial_Carbonifero_Colombia/MapServer",
    scale: "1:1.000.000",
    year: null,
    hint: "Zonas de potencial, mantos y cuencas carboníferas del territorio nacional.",
  },
  {
    key: "geofisica2022",
    label: "Anomalías geofísicas 2022",
    service:
      "https://srvags.sgc.gov.co/arcgis/rest/services/Geofisica/Anomalias_Geofisicas_V2022/MapServer",
    scale: "variable",
    year: 2022,
    hint: "Magnetometría aerotransportada, lineamientos magnéticos y gammaespectrometría K-Th-U.",
  },
  {
    key: "anomaliasGeoquimicas",
    label: "Anomalías geoquímicas",
    service:
      "https://srvags.sgc.gov.co/arcgis/rest/services/Anomalias_Geoquimica/Anomalias_Geoquimicas_y_Potencial_Geoquimico/MapServer",
    scale: "variable",
    year: null,
    hint: "Zonas con potencial geoquímico y anomalías multielemento en sedimentos de corriente.",
  },
  {
    key: "atlasGeoquimico",
    label: "Atlas geoquímico 2018",
    service:
      "https://srvags.sgc.gov.co/arcgis/rest/services/Atlas_Geoquimico_V2018/Atlas_Geoquimico_de_Colombia_V2018/MapServer",
    scale: "1:1.500.000",
    year: 2018,
    hint: "Distribución de concentraciones geoquímicas y elementos en el territorio nacional.",
  },
  {
    key: "movimientosMasa",
    label: "Movimientos en masa 100K",
    service:
      "https://srvags.sgc.gov.co/arcgis/rest/services/Mapa_Nacional_Amenaza_Mov_Masa_100K/Mapa_Nacional_Amenaza_Movimientos_Masa_100K/MapServer",
    scale: "1:100.000",
    year: null,
    hint: "Mapa nacional de amenaza y susceptibilidad por movimientos en masa y deslizamientos.",
  },
  {
    key: "amenazaSismica",
    label: "Amenaza sísmica nacional",
    service:
      "https://srvags.sgc.gov.co/arcgis/rest/services/Amenaza_Sismica/Amenaza_Sismica_Nacional/MapServer",
    scale: "nacional",
    year: null,
    hint: "Aceleración sísmica esperada (PGA) y modelo de fuentes sismogénicas.",
  },
  {
    key: "datacionesRadiometricas",
    label: "Dataciones radiométricas",
    service:
      "https://srvags.sgc.gov.co/arcgis/rest/services/Catalogo_Dataciones_Radiometricas_Colombia/Catalogo_Dataciones_Radiometricas_Colombia_2015/MapServer",
    scale: "puntos",
    year: 2015,
    hint: "Catálogo nacional de edades radiométricas de rocas e intrusiones.",
  },
  {
    key: "litotecaNacional",
    label: "Litoteca nacional",
    service:
      "https://srvags.sgc.gov.co/arcgis/rest/services/Mapa_Inventario_Muestra_Litoteca/Mapa_Inventario_Muestra_Litoteca/MapServer",
    scale: "puntos",
    year: null,
    hint: "Inventario de pozos y testigos de perforación física custodiados por el SGC.",
  },
]

const BY_KEY = new Map(SGC_LAYERS.map((layer) => [layer.key, layer]))

export const sgcLayerByKey = (key) => BY_KEY.get(key)

/** Las claves del catálogo, que es lo único que la ruta acepta del cliente. */
export const SGC_KEYS = SGC_LAYERS.map((layer) => layer.key)

/**
 * Cuánto puede medir, como mucho, la imagen que se pide.
 *
 * ArcGIS rechaza tamaños grandes y estos servicios ya van lentos de por sí. Dos
 * mil píxeles cubren una pantalla 4K con holgura.
 */
export const SGC_MAX_IMAGE_PX = 2048

/**
 * La dirección real del servicio para un recuadro.
 *
 * `bbox`, `bboxSR` e `imageSR` en 3857 porque es lo que pide MapLibre; el SGC
 * publica en 4686 y ArcGIS reproyecta al vuelo. `png32` y no `png` porque las
 * unidades geológicas usan muchos colores y la paleta de 256 los destroza.
 * `transparent=true` para que se vea el mapa de fondo por debajo, que es como se
 * usa una capa geológica: encima de la imagen o del relieve.
 *
 * **El tamaño tiene que guardar la misma proporción que el recuadro.** Si no,
 * ArcGIS ensancha el recuadro por su cuenta para que cuadren, y la imagen acaba
 * cubriendo un trozo de terreno distinto del que se pidió: el mapa sale
 * desplazado sin que nada falle.
 *
 * @param {string} bbox el recuadro «oeste,sur,este,norte» en metros de Web Mercator
 * @param {string} size «ancho,alto» en píxeles
 */
export const sgcExportUrl = (service, bbox, size, layers = "") =>
  `${service}/export?bbox=${bbox}&bboxSR=3857&imageSR=3857` +
  `&size=${size}&dpi=96&format=png32&transparent=true` +
  (layers ? `&layers=${layers}` : "") +
  "&f=image"

/**
 * Qué tamaño de imagen pedir para un recuadro y una pantalla.
 *
 * Devuelve `[ancho, alto]` en píxeles, con la proporción exacta del recuadro y
 * sin pasarse del tope. Es función pura y está aparte porque es justo la cuenta
 * que, hecha a ojo, descoloca el mapa.
 */
export const sgcImageSize = (bboxMeters, screenPx, max = SGC_MAX_IMAGE_PX) => {
  const [oeste, sur, este, norte] = bboxMeters
  const ancho = Math.abs(este - oeste)
  const alto = Math.abs(norte - sur)
  if (!(ancho > 0) || !(alto > 0)) return [1, 1]

  const proporcion = ancho / alto
  let w = Math.min(Math.max(Math.round(screenPx?.[0] ?? max), 1), max)
  let h = Math.max(Math.round(w / proporcion), 1)
  if (h > max) {
    h = max
    w = Math.max(Math.round(h * proporcion), 1)
  }
  return [w, h]
}

/**
 * La dirección de **una sola imagen** para el trozo de mapa que se está viendo.
 *
 * ## Por qué una imagen y no teselas, que es lo que había
 *
 * Porque los rótulos salían repetidos. La grilla de planchas escribía el número
 * de cada cuadrícula cuatro veces, una por cada tesela que la tocaba: ArcGIS
 * dibuja cada imagen que le piden sin saber nada de las de al lado, así que
 * coloca el rótulo en cada una. Con teselas eso no tiene arreglo — no es un
 * ajuste que falte, es que la pregunta está mal hecha.
 *
 * Pidiendo una sola imagen del rectángulo visible, el servicio rotula una vez,
 * que es lo que hace su propio visor. De paso son menos idas y venidas: antes
 * eran entre cuatro y nueve peticiones por pantalla a un servidor que tarda
 * segundos.
 *
 * Lo que se pierde: al mover el mapa hay que volver a pedirla entera, mientras
 * que las teselas que seguían en pantalla se reaprovechaban. Para un servicio
 * lento y con rótulos, sale a cuenta.
 */
export const sgcImageUrl = ({ key, bbox, width, height, sub = [] }) => {
  const params = new URLSearchParams({
    capa: key,
    bbox: bbox.join(","),
    tam: `${Math.round(width)},${Math.round(height)}`,
  })
  if (sub.length) params.set("sub", sub.join(","))
  return `/api/sgc?${params}`
}

/** La dirección de nuestra ruta para preguntarle al servicio qué capas tiene. */
export const sgcMetaUrl = (key) => `/api/sgc?capa=${encodeURIComponent(key)}&modo=meta`

/** Y para pedirle la leyenda. */
export const sgcLegendUrl = (key) => `/api/sgc?capa=${encodeURIComponent(key)}&modo=leyenda`

/**
 * Y para preguntarle qué hay en un punto.
 *
 * ArcGIS necesita saber, además del punto, **con qué mapa se está mirando**:
 * el recuadro y el tamaño en píxeles. Es lo que le permite convertir la
 * tolerancia —«a cuántos píxeles del clic»— en una distancia sobre el terreno.
 * Sin eso, un clic al lado de un contacto geológico devolvería la unidad
 * equivocada o ninguna.
 */
export const sgcIdentifyUrl = ({ key, lng, lat, bbox, width, height, sub = [], tolerance = 4 }) => {
  const params = new URLSearchParams({
    capa: key,
    modo: "identify",
    punto: `${lng},${lat}`,
    bbox,
    tam: `${Math.round(width)},${Math.round(height)}`,
    tol: String(tolerance),
  })
  if (sub.length) params.set("sub", sub.join(","))
  return `/api/sgc?${params}`
}

/**
 * Los grupos de primer nivel de un servicio: sus «subcapas elegibles».
 *
 * En «Geología por departamentos» cada grupo es un departamento. Se leen del
 * propio servicio en vez de escribirlos aquí por lo de siempre —los índices del
 * SGC cambian—, pero también por algo más simple: **no sé cuántos son ni cómo se
 * llaman.** Desde la máquina donde se escribió esto el SGC está bloqueado, así
 * que lo único honesto es enseñar lo que el servicio diga de sí mismo.
 *
 * Por eso tampoco se filtra por «parece un departamento»: si el servicio agrupa
 * de otra manera, se verá su agrupación y no una lista inventada.
 *
 * `on` es lo que el servicio trae encendido de fábrica, y no es un detalle: es la
 * explicación de por qué «Geología por departamentos» dibujaba solo Antioquia.
 * Con ese dato, las casillas pueden arrancar marcadas exactamente en lo que se
 * está viendo, en vez de vacías bajo un mapa que sí tiene algo pintado.
 *
 * @param {Object} serviceJson lo que devuelve `MapServer?f=json`
 * @returns {Array<{id:number, label:string, ids:number[], on:boolean}>} vacío si no hay grupos
 */
/**
 * Lo que es un límite administrativo y no geología.
 *
 * Dentro de cada departamento el SGC mete, además de las unidades y las fallas,
 * el límite municipal y el departamental. Son útiles de vez en cuando, pero
 * encendidos de partida tapan la geología con una malla de líneas negras justo
 * cuando lo que se quiere ver es el color de las unidades. Siguen ahí, en la
 * lista, para encenderlos a mano.
 *
 * No se busca la palabra «departamental» suelta: hay capas de geología que la
 * llevan en el nombre, y apagarlas sería apagar el dato.
 */
const ES_LIMITE = /l[ií]mite|municipi|frontera|divisi[óo]n\s+pol[ií]tica/i

/** Y lo que son rótulos, que es lo contrario: sin ellos hay que ir a clic por unidad. */
const ES_ETIQUETA = /anotaci|etiqueta|r[óo]tulo|label|texto|nomencla/i

/**
 * El año que un departamento lleva pegado al nombre, si lo lleva.
 *
 * «La Guajira» aparece dos veces en el servicio, con dos levantamientos de años
 * distintos. Enseñar los dos obliga a elegir sin criterio, y el año en el nombre
 * no ayuda a nadie a encontrar su departamento en una lista de treinta y dos.
 */
const anioDe = (nombre) => {
  const encontrado = String(nombre).match(/\b(19|20)\d{2}\b/)
  return encontrado ? Number(encontrado[0]) : null
}

/** El nombre sin el año ni los adornos que lo acompañan. */
export const nombreDeDepartamento = (nombre) =>
  String(nombre)
    // Los separadores primero, y el año después. Al revés no funciona con
    // `Valle_del_Cauca_2020`: el guion bajo cuenta como letra, así que el año no
    // empieza donde una palabra empieza y la búsqueda no lo encuentra.
    .replace(/[()[\]{}_·.,-]+/g, " ")
    .replace(/\b(19|20)\d{2}\b/g, "")
    .replace(/\s+/g, " ")
    .trim()

/** Para comparar «La Guajira» con «Guajira» sin que el artículo estorbe. */
const claveDe = (nombre) =>
  nombreDeDepartamento(nombre)
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/^(la|el|los|las)\s+/, "")

export const subLayersFrom = (serviceJson) => {
  const capas = serviceJson?.layers
  if (!Array.isArray(capas) || capas.length === 0) return []

  const porId = new Map(capas.map((capa) => [capa?.id, capa]))
  const raiz = capas.filter((capa) => (capa?.parentLayerId ?? -1) < 0)
  // Un servicio plano —sin grupos— no tiene nada que elegir: se dibuja entero.
  const grupos = raiz.filter((capa) => Array.isArray(capa?.subLayerIds) && capa.subLayerIds.length)
  if (grupos.length < 2) return []

  /**
   * Las **hojas** de un grupo: las capas que de verdad dibujan algo.
   *
   * Solo las hojas, y no también el grupo que las contiene, por dos razones. La
   * primera es la ficha: pedirle a ArcGIS el grupo *y* su contenido devuelve la
   * misma unidad dos veces, y la ficha la enseñaba repetida. La segunda es que
   * son las hojas las que tienen nombre propio —«Fallas», «Municipios»— y por
   * tanto lo único que se puede ofrecer para encender y apagar por separado.
   */
  const hojas = (id, vistos = new Set()) => {
    if (vistos.has(id)) return []
    vistos.add(id)
    const capa = porId.get(id)
    if (!capa) return []
    const hijos = capa.subLayerIds ?? []
    if (!hijos.length) return [capa]
    const dentro = hijos.flatMap((hijo) => hojas(hijo, vistos))
    // Si un grupo no llega a ninguna hoja —porque el servicio se referencia a sí
    // mismo, que pasa— se usa el grupo. Mejor pedirle al servicio algo de más que
    // dejar un departamento sin nada que encender.
    return dentro.length ? dentro : [capa]
  }

  /**
   * Si una capa se dibuja de fábrica hay que mirar también a sus padres: ArcGIS
   * marca la visibilidad capa por capa, y una hoja encendida dentro de un grupo
   * apagado no se ve. Sin esta cuenta, las casillas arrancaban marcadas en cosas
   * que no estaban en pantalla.
   */
  const visibleDeFabrica = (capa) => {
    let actual = capa
    const vistos = new Set()
    while (actual && !vistos.has(actual.id)) {
      if (!actual.defaultVisibility) return false
      vistos.add(actual.id)
      const padre = actual.parentLayerId
      actual = padre >= 0 ? porId.get(padre) : null
    }
    return true
  }

  const nombreDe = (capa, respaldo) => String(capa?.name ?? respaldo)

  const armados = grupos.map((grupo) => {
    const nombre = nombreDe(grupo, `Grupo ${grupo.id}`)
    const dentro = hojas(grupo.id).map((capa) => {
      const etiqueta = nombreDe(capa, `Capa ${capa.id}`)
      return {
        id: capa.id,
        label: etiqueta,
        ids: [capa.id],
        // Los límites, apagados aunque el servicio los traiga encendidos; los
        // rótulos, encendidos aunque no los traiga. Son las dos únicas veces que
        // no se hace caso al servicio, y las dos por lo mismo: lo que se quiere
        // ver es la geología.
        on: ES_LIMITE.test(etiqueta)
          ? false
          : ES_ETIQUETA.test(etiqueta) || visibleDeFabrica(capa),
      }
    })
    return {
      id: grupo.id,
      label: nombreDeDepartamento(nombre) || nombre,
      year: anioDe(nombre),
      // Lo que se le pide al servicio para este grupo son sus hojas.
      ids: dentro.map((hoja) => hoja.id),
      on: Boolean(grupo.defaultVisibility),
      children: dentro,
    }
  })

  // Un departamento repetido se queda con su levantamiento más reciente. Sin
  // esto, «La Guajira» salía dos veces y no había forma de saber cuál era cuál.
  const porNombre = new Map()
  armados.forEach((grupo) => {
    const clave = claveDe(grupo.label)
    const previo = porNombre.get(clave)
    if (!previo || (grupo.year ?? 0) > (previo.year ?? 0)) porNombre.set(clave, grupo)
  })

  return [...porNombre.values()].sort((a, b) => a.label.localeCompare(b.label, "es"))
}

/** Las subcapas que hay que dibujar de fábrica, leídas del propio servicio. */
export const defaultSubSelection = (grupos) =>
  grupos.flatMap((grupo) => (grupo.children ?? []).filter((h) => h.on).map((h) => h.id))

/**
 * Los atributos de un `identify`, ya limpios y listos para enseñar.
 *
 * ArcGIS devuelve mucho ruido: identificadores internos, campos vacíos, formas.
 * Lo que le sirve a un geólogo son los nombres de campo con contenido — la
 * unidad, la edad, la litología—, y en el orden en que vengan, que es el que el
 * SGC eligió al publicar.
 */
/**
 * Campos que son fontanería de la base de datos y no dicen nada.
 *
 * Además de los de siempre —`OBJECTID`, `Shape`—, los servicios del SGC arrastran
 * pares como `UCG_P_` y `UCG_P_ID`, que son números internos de su base de datos
 * de ArcGIS. En la ficha ocupaban dos de las cuatro filas y no informaban de
 * nada. Se van los que **acaban en `_` o en `_ID` y además valen un número**: las
 * dos condiciones juntas, porque un campo llamado `COD_ID` con valor `Qal` sí es
 * un dato.
 */
const CAMPO_INTERNO = /^(objectid|shape|fid|globalid|se_anno)/i
const CAMPO_DE_BASE = /(_id|_)$/i

/**
 * Traduce un valor con su significado, cuando se conoce.
 *
 * `Qal` es lo que guarda la base de datos; «Depósitos aluviales» es lo que un
 * geólogo quiere leer. Lo segundo lo publica el propio servicio en la simbología
 * de la capa —cada color lleva su valor y su descripción—, así que no hay que
 * inventarse ningún diccionario: se pide y se cruza. Ver el modo `campos` de
 * `/api/sgc`.
 */
export const describeValue = (valor, diccionario) => {
  const texto = String(valor)
  const significado = diccionario?.[texto]
  return significado && significado !== texto ? `${texto} — ${significado}` : texto
}

export const identifyResultsFrom = (json) => {
  const encontrados = json?.results
  if (!Array.isArray(encontrados)) return []

  const limpios = encontrados.map((resultado) => ({
    // El índice de la capa se conserva porque es la llave con la que se le pide
    // al servicio qué significan sus códigos.
    layerId: Number.isInteger(resultado?.layerId) ? resultado.layerId : null,
    layerName: String(resultado?.layerName ?? ""),
    value: String(resultado?.value ?? ""),
    attributes: Object.entries(resultado?.attributes ?? {})
      .filter(([campo, valor]) => {
        if (valor === null || valor === undefined) return false
        const texto = String(valor).trim()
        // «Null» con mayúscula es literalmente lo que escribe ArcGIS en un campo
        // vacío. Sin quitarlo, la ficha se llena de filas que no dicen nada.
        if (texto === "" || texto === "Null" || texto === "<Null>") return false
        if (CAMPO_INTERNO.test(campo)) return false
        return !(CAMPO_DE_BASE.test(campo) && /^\d+$/.test(texto))
      })
      .map(([campo, valor]) => ({ field: campo, value: String(valor) })),
  }))

  /**
   * Y fuera los repetidos.
   *
   * La ficha enseñaba la misma unidad dos veces. La causa de raíz —pedirle al
   * servicio un grupo y su contenido a la vez— está arreglada en
   * `subLayersFrom`, pero un servicio puede publicar la misma geometría en dos
   * capas suyas y devolverla dos veces igualmente. Dos filas idénticas no
   * informan de nada: informan de un fallo que no existe.
   *
   * **La huella es solo de los atributos**, y ese es el arreglo. Antes se hacía
   * sobre el resultado entero, `layerId` incluido, así que el caso que este
   * bloque dice cubrir —la misma unidad publicada en dos capas— tenía dos
   * huellas distintas y sobrevivía intacto: solo se quitaban las repeticiones
   * dentro de una misma capa, que es el caso que ya no ocurre.
   *
   * Se conserva el primero, que viene de la capa que ArcGIS devuelve antes, o
   * sea la de más arriba en el servicio.
   */
  const vistos = new Set()
  return limpios.filter((resultado) => {
    const huella = JSON.stringify(resultado.attributes)
    if (vistos.has(huella)) return false
    vistos.add(huella)
    return true
  })
}

/** Lo que ArcGIS considera una dirección web dentro del valor de un campo. */
const ENLACE = /https?:\/\/[^\s<>"')]+/gi

/**
 * Parte el valor de un campo en trozos de texto y enlaces.
 *
 * **Por qué.** El servicio de estado de la cartografía devuelve direcciones —la
 * memoria explicativa de una plancha, su publicación— y como texto plano no
 * sirven de nada: hay que copiarlas a mano. Se separan aquí, y no en el
 * componente, porque decidir qué es un enlace es una regla, no una decoración, y
 * conviene poder probarla.
 *
 * Se recorta la puntuación final: un punto o una coma pegados al cierre son del
 * texto, no de la dirección.
 *
 * **Los paréntesis quedan fuera de la dirección siempre**, y es una decisión, no
 * un descuido: una dirección puede llevar paréntesis balanceados y reconocerlos
 * exige contarlos. El caso real de estos servicios es el contrario —«(ver
 * https://…)»—, donde el paréntesis es del texto. Ante la duda se prefiere
 * partir de más: un enlace un carácter corto sigue siendo copiable; uno que se
 * traga el paréntesis de cierre lleva a una página que no existe.
 *
 * @returns {Array<{text: string, href?: string}>}
 */
export const linkPartsOf = (value) => {
  const texto = String(value ?? "")
  const partes = []
  let ultimo = 0

  for (const encontrado of texto.matchAll(ENLACE)) {
    const bruto = encontrado[0]
    const limpio = bruto.replace(/[.,;:]+$/, "")
    const inicio = encontrado.index

    if (inicio > ultimo) partes.push({ text: texto.slice(ultimo, inicio) })
    partes.push({ text: limpio, href: limpio })
    ultimo = inicio + limpio.length
  }

  if (ultimo < texto.length) partes.push({ text: texto.slice(ultimo) })
  return partes.length ? partes : [{ text: texto }]
}

/**
 * Cómo se enseña una dirección larga en una tarjeta estrecha.
 *
 * `https://www2.sgc.gov.co/publicaciones/planchas/146.pdf` en una columna de
 * quince ems ocupa tres renglones partidos por la mitad de las palabras, y lo
 * que se lee no es nada. Lo que de verdad informa son dos cosas: de qué sitio es
 * y qué archivo es. El resto va al `title` y al propio enlace, que no se toca.
 *
 * El tope son veintiséis caracteres porque la columna del valor mide unos 150 px
 * a 11 px de letra, y ahí caben veintitantos. Se midió en una captura: con
 * cuarenta y dos, que era lo primero que puse, las direcciones seguían saliendo
 * en tres renglones y el recorte no servía de nada.
 *
 * Se recorta solo si hace falta: una dirección corta se enseña entera.
 */
export const shortLinkText = (href, max = 26) => {
  const texto = String(href ?? "")
  if (texto.length <= max) return texto

  // Se recorta al final pase lo que pase: hay direcciones con un nombre de
  // archivo interminable, y una de ellas volvería a ocupar los tres renglones
  // que esto viene a evitar.
  const recortar = (t) => (t.length <= max ? t : `${t.slice(0, max - 1)}…`)

  try {
    const { hostname, pathname } = new URL(texto)
    const sitio = hostname.replace(/^www\d*\./, "")
    const ultimo = pathname.split("/").filter(Boolean).pop()
    return recortar(ultimo ? `${sitio}/…/${ultimo}` : sitio)
  } catch {
    // Una dirección que no se deja analizar se recorta a lo bruto: peor eso que
    // romper la ficha por un valor raro del servicio.
    return recortar(texto)
  }
}

/**
 * La leyenda de un servicio, aplanada.
 *
 * @returns {Array<{layerId:number, layerName:string, items:Array<{label:string, image:string}>}>}
 */
export const legendFrom = (json) => {
  const capas = json?.layers
  if (!Array.isArray(capas)) return []

  return capas
    .map((capa) => ({
      layerId: capa?.layerId,
      layerName: String(capa?.layerName ?? ""),
      items: (capa?.legend ?? [])
        .filter((item) => item?.imageData)
        .map((item) => ({
          label: String(item?.label ?? "").trim(),
          // El servicio manda el símbolo en base64. Se arma aquí el `data:` para
          // que quien lo pinte no tenga que saber de formatos.
          image: `data:${item?.contentType ?? "image/png"};base64,${item.imageData}`,
        })),
    }))
    .filter((capa) => capa.items.length > 0)
}

/** La atribución, que las condiciones de uso del SGC exigen mostrar. */
export const SGC_ATTRIBUTION =
  '<a href="https://www.sgc.gov.co">Servicio Geológico Colombiano</a>'

/**
 * Lo que hace legible una ficha: cómo se llama cada campo y qué significa cada
 * código.
 *
 * Las dos cosas las publica el propio servicio en `MapServer/<capa>?f=json`:
 *
 * - `fields[].alias` es el nombre que el SGC le puso al campo para enseñarlo.
 *   Suele ser el mismo críptico que el interno, y por eso solo se usa cuando de
 *   verdad aporta algo distinto.
 * - `drawingInfo.renderer.uniqueValueInfos` es la tabla que empareja cada valor
 *   con su descripción, porque es la que usa ArcGIS para elegir el color. Ahí
 *   está lo que convierte `Qal` en «Depósitos aluviales».
 *
 * @returns {{field: string, aliases: Object, meanings: Object}}
 */
export const fieldInfoFrom = (layerJson) => {
  const renderer = layerJson?.drawingInfo?.renderer
  const aliases = {}
  for (const campo of layerJson?.fields ?? []) {
    const nombre = campo?.name
    const alias = campo?.alias
    if (nombre && alias && alias !== nombre) aliases[nombre] = String(alias)
  }

  const meanings = {}
  for (const info of renderer?.uniqueValueInfos ?? []) {
    // `value` puede venir con varios campos separados por comas cuando el
    // servicio pinta por más de uno; se guarda tal cual y ya cruzará o no.
    const valor = info?.value
    const etiqueta = String(info?.label ?? "").trim()
    if (valor !== undefined && valor !== null && etiqueta) meanings[String(valor)] = etiqueta
  }

  return { field: String(renderer?.field1 ?? ""), aliases, meanings }
}

/** La dirección de nuestra ruta para pedir eso. */
export const sgcFieldsUrl = (key, layerId) =>
  `/api/sgc?capa=${encodeURIComponent(key)}&modo=campos&sub=${Number(layerId)}`
