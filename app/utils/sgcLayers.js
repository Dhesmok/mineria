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
 */
export const SGC_LAYERS = [
  {
    key: "geologiaNacional",
    label: "Mapa geológico de Colombia",
    service:
      "https://srvags.sgc.gov.co/arcgis/rest/services/Mapa_Geologico_Colombia/Mapa_Geologico_Colombia_V2023/MapServer",
    scale: "1:500.000",
    year: 2023,
    hint: "Unidades geológicas de todo el país. Es la versión más reciente publicada por el SGC.",
  },
  {
    key: "geologiaDepartamentos",
    label: "Geología por departamentos",
    service:
      "https://srvags.sgc.gov.co/arcgis/rest/services/Geologia/Geologia_Por_Departamentos/MapServer",
    scale: "variable",
    year: null,
    hint: "Planchas departamentales con sus unidades y sus fallas. El detalle cambia de un departamento a otro.",
  },
  {
    key: "planchas",
    label: "Planchas geológicas 1:100.000",
    service:
      "https://srvags.sgc.gov.co/arcprod/rest/services/Geologia/Atlas_Geologico_2020/MapServer",
    scale: "1:100.000",
    year: 2020,
    hint: "Tercera edición del Atlas Geológico: la geología de las planchas publicadas, al mayor detalle disponible.",
  },
  {
    key: "estadoCartografia",
    label: "Estado de la cartografía",
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
    key: "grillaPlanchas",
    label: "Grilla de planchas",
    service: "https://srvags.sgc.gov.co/arcprod/rest/services/GrillaIGAC_100k/MapServer",
    scale: "1:100.000",
    year: null,
    hint: "La retícula de planchas del IGAC con su número. Para nombrar la plancha en la que cae un área.",
  },
]

const BY_KEY = new Map(SGC_LAYERS.map((layer) => [layer.key, layer]))

export const sgcLayerByKey = (key) => BY_KEY.get(key)

/** Las claves del catálogo, que es lo único que la ruta acepta del cliente. */
export const SGC_KEYS = SGC_LAYERS.map((layer) => layer.key)

/**
 * Tamaño de la tesela que se le pide al servicio.
 *
 * 512 y no 256: son cuatro veces menos peticiones para la misma pantalla, y
 * estos servicios responden lento —dibujan un mapa entero por petición—, así que
 * lo que importa es el número de idas y venidas, no el peso de cada una.
 */
export const SGC_TILE_SIZE = 512

/**
 * La dirección real del servicio para un recuadro.
 *
 * `bbox`, `bboxSR` e `imageSR` en 3857 porque es lo que pide MapLibre; el SGC
 * publica en 4686 y ArcGIS reproyecta al vuelo. `png32` y no `png` porque las
 * unidades geológicas usan muchos colores y la paleta de 256 los destroza.
 * `transparent=true` para que se vea el mapa de fondo por debajo, que es como se
 * usa una capa geológica: encima de la imagen o del relieve.
 *
 * @param {string} bbox el recuadro «oeste,sur,este,norte» en metros de Web Mercator
 */
export const sgcExportUrl = (service, bbox, size = SGC_TILE_SIZE) =>
  `${service}/export?bbox=${bbox}&bboxSR=3857&imageSR=3857` +
  `&size=${size},${size}&dpi=96&format=png32&transparent=true&f=image`

/**
 * La plantilla que se le da a MapLibre.
 *
 * `{bbox-epsg-3857}` lo sustituye MapLibre por el recuadro de cada tesela. Es el
 * mismo mecanismo con el que se consumen los servicios WMS.
 */
export const sgcTileTemplate = (key) =>
  `/api/sgc?capa=${encodeURIComponent(key)}&bbox={bbox-epsg-3857}`

/** La atribución, que las condiciones de uso del SGC exigen mostrar. */
export const SGC_ATTRIBUTION =
  '<a href="https://www.sgc.gov.co">Servicio Geológico Colombiano</a>'
