import { ANM_LAYERS } from "./anmLayers"

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
    icon: [
      "M13.8 2.6 21.4 10.2",
      "M10.6 7.2 3.6 14.2a2.9 2.9 0 0 0 4.1 4.1l7-7",
      "M17.4 7.4 20.6 4.2",
    ],
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
 * Capas todavía sin servicio. Cuando se consiga la dirección pública de una,
 * basta con moverla a su registro correspondiente con `url` o `tenureName` y
 * quitarle `pending`: el resto del visor no necesita enterarse.
 */
const PENDING_LAYERS = [
  { key: "planchas", areaId: "geologia", label: "Planchas geológicas", fillColor: "#cbb8dd", lineColor: "#6B4E8A" },
  { key: "simma", areaId: "geologia", label: "Movimientos en masa", fillColor: "#dcc0b6", lineColor: "#8a5b4e" },
  { key: "sismica", areaId: "geologia", label: "Amenaza sísmica", fillColor: "#e8bdb8", lineColor: "#a6564e" },
  { key: "bloques", areaId: "hidrocarburos", label: "Bloques y contratos", fillColor: "#a9cfc5", lineColor: "#2E6B5E" },
  { key: "pozos", areaId: "hidrocarburos", label: "Pozos", fillColor: "#8fbcb1", lineColor: "#1f4f45" },
  { key: "tierras", areaId: "hidrocarburos", label: "Tierras disponibles", fillColor: "#c6e2da", lineColor: "#4f8a7c" },
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
