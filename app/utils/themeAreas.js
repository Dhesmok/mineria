import { ANM_LAYERS, anmFillLayerId, anmLineLayerId } from "./anmLayers"
import { SGC_LAYERS, sgcLayerId } from "./sgcLayers"
import { ANH_LAYERS, anhLayerId } from "./anhLayers"

/**
 * Las capas del visor, agrupadas por área temática.
 *
 * Hasta ahora el panel enseñaba cuatro capas sueltas, todas de la ANM. El visor
 * va a integrar servicios de varias entidades, y una lista plana de veinte
 * capas no se puede leer: por eso el agrupamiento por área —Minería, Geología,
 * Hidrocarburos, Catastro— y no por entidad. Alguien busca "dónde hay fallas
 * geológicas", no "qué publica el SGC".
 *
 * **Las capas de Minería son las de verdad**: se toman de `ANM_LAYERS`, que ya
 * tiene sus direcciones y sus colores, para no acabar con dos listas que se
 * contradicen. Las demás están declaradas pero marcadas como pendientes: se ven
 * en el panel, con su interruptor deshabilitado, hasta que se conozca la
 * dirección pública de cada servicio. Es deliberado: enseñar el destino del
 * panel sin fingir que ya funciona.
 *
 * Módulo puro, sin nada de MapLibre.
 */

/**
 * Cada área trae los trazos de su icono, para dibujarlo con SVG en línea.
 *
 * `searchable` dice si su lupa está habilitada. Hoy solo Minería: el buscador
 * pregunta por TENURE_ID y CODIGO_EXPEDIENTE, que son campos de la ANM. Cuando
 * se conecten los servicios de las demás habrá que decidir por qué se busca en
 * cada una, y hasta entonces es más honesto tener el botón apagado que uno que
 * no encuentra nada.
 */
export const AREAS = [
  {
    id: "mineria",
    name: "Minería",
    source: "ANM",
    color: "#894444",
    searchable: true,
    /**
     * Un pico: cabeza curva y mango en diagonal.
     *
     * El anterior eran tres trazos diagonales sueltos que se leían como una
     * espada o un instrumento de laboratorio, según a quién se le preguntara: no
     * decía «minería» a nadie.
     *
     * Se probaron cinco candidatos dibujados **al tamaño real, 14 px**, que es
     * donde se decide: el `Pickaxe` de lucide y un martillo cruzado con pico se
     * emborronan a ese tamaño —tienen demasiado detalle—, y una gema o un casco
     * se leen bien pero hablan de minerales o de seguridad, no de la actividad.
     * Este aguanta los 14 px con tres trazos.
     */
    icon: ["M7 20.5 14.6 8.4", "M4.6 8.6a11 11 0 0 1 15.6 2.2", "M11.4 6.4 17.6 10.2"],
  },
  {
    id: "geologia",
    searchable: false,
    name: "Geología",
    source: "SGC",
    color: "#6B4E8A",
    icon: ["m2.6 19.4 6.4-11.6 4 6 2.6-4.2 5.8 9.8Z", "M9 7.8 6.4 12.6h5.4", ""],
  },
  {
    id: "hidrocarburos",
    searchable: false,
    name: "Hidrocarburos",
    source: "ANH",
    color: "#2E6B5E",
    icon: [
      "M12 2.8c2.9 3.5 4.6 6.2 4.6 8.6A4.6 4.6 0 0 1 12 16a4.6 4.6 0 0 1-4.6-4.6c0-2.4 1.7-5.1 4.6-8.6Z",
      "M4.6 20.2h14.8",
      "",
    ],
  },
  {
    // El identificador sigue siendo "catastro" a propósito: es el nombre con el
    // que se guardan el orden y el filtro de estas capas en el navegador de cada
    // usuario, y cambiarlo dejaría esas preferencias huérfanas. El nombre que se
    // ve sí cambia — el área va a alojar drenajes, curvas de nivel y demás, que
    // son cartografía y no catastro.
    id: "catastro",
    searchable: false,
    name: "Cartografía",
    source: "IGAC",
    color: "#22577A",
    icon: ["M3.4 3.4h17.2v17.2H3.4Z", "M3.4 10.2h17.2", "M10.2 20.6V10.2"],
  },
]

/**
 * Las capas de geología, que ya tienen servicio.
 *
 * Salen de `SGC_LAYERS` en vez de estar escritas otra vez aquí, por lo mismo que
 * las de Minería salen de `ANM_LAYERS`: dos listas de lo mismo acaban
 * contradiciéndose, y quien las lea después no sabrá cuál manda.
 *
 * **`raster: true` no es un detalle de implementación, cambia lo que el panel
 * ofrece.** Estas capas llegan ya dibujadas por el SGC, con su propia simbología
 * —el amarillo de un cuaternario, el granate de un batolito—, así que el selector
 * de color no tiene nada que elegir y se apaga. La opacidad sí sirve: es lo que
 * permite mirar la geología contra la imagen de satélite o contra el relieve.
 *
 * Los colores que llevan son solo para el cuadrito del panel, que necesita algo
 * con lo que distinguir una fila de otra.
 */
const SGC_PALETTE = [
  "#cbb8dd",
  "#bda6d4",
  "#a98fc6",
  "#d6c8e4",
  "#e2d7ec",
  "#d8b4e2",
  "#ce9fd8",
  "#c38bce",
  "#e0c3fc",
  "#dab6fc",
  "#d0a3fc",
  "#c690fc",
  "#bc7dfc",
  "#b26afc",
]

const SGC_THEME_LAYERS = SGC_LAYERS.map((capa, i) => ({
  key: capa.key,
  areaId: "geologia",
  label: capa.label,
  hint: capa.hint,
  scale: capa.scale,
  year: capa.year,
  raster: true,
  pending: false,
  fillColor: SGC_PALETTE[i % SGC_PALETTE.length],
  lineColor: "#6B4E8A",
}))

const ANH_PALETTE = [
  "#a9cfc5",
  "#8fbcb1",
  "#c6e2da",
  "#7fad9f",
  "#9bc2b8",
  "#6e9e90",
  "#b5d8cf",
]

const ANH_THEME_LAYERS = ANH_LAYERS.map((capa, i) => ({
  key: capa.key,
  areaId: "hidrocarburos",
  label: capa.label,
  hint: capa.hint,
  scale: capa.scale,
  year: capa.year,
  raster: true,
  pending: false,
  fillColor: ANH_PALETTE[i % ANH_PALETTE.length],
  lineColor: "#2E6B5E",
}))

/**
 * Capas todavía sin servicio. Cuando se consiga la dirección pública de una,
 * basta con moverla a su registro correspondiente con `url` o `tenureName` y
 * quitarle `pending`: el resto del visor no necesita enterarse.
 */
const PENDING_LAYERS = [
  { key: "predios", areaId: "catastro", label: "Predios", fillColor: "#b3ccdb", lineColor: "#22577A" },
  { key: "orto", areaId: "catastro", label: "Ortoimágenes", fillColor: "#c9dbe6", lineColor: "#3d6f8f" },
  { key: "cartografia", areaId: "catastro", label: "Cartografía básica", fillColor: "#d6e3ea", lineColor: "#5b8299" },
].map((layer) => ({ ...layer, pending: true }))

/**
 * Todas las capas del panel, en el orden en que aparecen agrupadas por área.
 *
 * No confundir con el orden de pintado: ese lo decide el usuario arrastrando y
 * vive aparte, en `DEFAULT_ORDER` y en el estado del panel.
 */
export const THEME_LAYERS = [
  ...ANM_LAYERS.map((layer) => ({ ...layer, areaId: "mineria", pending: false })),
  ...SGC_THEME_LAYERS,
  ...ANH_THEME_LAYERS,
  ...PENDING_LAYERS,
]

/** Las capas que ya tienen servicio: son las únicas que el mapa puede dibujar. */
export const LIVE_LAYERS = THEME_LAYERS.filter((layer) => !layer.pending)

const BY_KEY = new Map(THEME_LAYERS.map((layer) => [layer.key, layer]))

export const layerByKey = (key) => BY_KEY.get(key)

export const areaById = (id) => AREAS.find((area) => area.id === id)

/**
 * Orden de pintado de partida, de arriba abajo: lo primero de la lista es lo que
 * se ve por encima de todo en el mapa.
 *
 * Se elige así a propósito: las solicitudes por encima de los títulos porque
 * suelen ser más pequeñas y quedarían escondidas debajo, y el título histórico
 * al fondo por ser el contexto sobre el que se miran los demás.
 */
export const DEFAULT_ORDER = [
  "request",
  "anmService",
  "title",
  "historicalTitle",
  ...ANH_THEME_LAYERS.map((layer) => layer.key),
  // La geología por debajo de los títulos: es el contexto sobre el que se los
  // mira, no algo que deba taparlos. Y entre ellas, de más detalle a menos, para
  // que encender la nacional no borre la plancha.
  ...SGC_THEME_LAYERS.map((layer) => layer.key).reverse(),
  ...PENDING_LAYERS.map((layer) => layer.key),
]

/** Estado inicial de cada capa: apagada, al 60 % y con su color de fábrica. */
export const initialLayerState = () =>
  Object.fromEntries(
    THEME_LAYERS.map((layer) => [
      layer.key,
      { on: false, opacity: 0.6, fillColor: layer.fillColor, lineColor: layer.lineColor },
    ]),
  )

/**
 * Qué capas del estilo dibujan una clave del panel, de abajo arriba.
 *
 * Dos formas distintas bajo una misma lista: las de la ANM llegan como polígonos
 * y usan dos capas —relleno y contorno, en ese orden para que el borde no quede
 * tapado por su propio relleno translúcido—, mientras que las del SGC llegan ya
 * dibujadas y son una sola imagen.
 *
 * Existe para que el orden de pintado se resuelva en un solo sitio. La
 * alternativa —un bucle para la ANM y otro para el SGC— son dos opiniones sobre
 * qué va encima de qué, y tarde o temprano discrepan.
 */
export const styleLayerIdsFor = (key) => {
  const capa = BY_KEY.get(key)
  if (!capa || capa.pending) return []
  if (capa.raster) {
    if (capa.areaId === "hidrocarburos") return [anhLayerId(key)]
    return [sgcLayerId(key)]
  }
  return [anmFillLayerId(key), anmLineLayerId(key)]
}
