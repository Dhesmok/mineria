/**
 * Filtros sobre las capas ya cargadas.
 *
 * **Se filtra en el navegador, no en el servicio.** Las capas ya traen todos sus
 * atributos —son los mismos que enseña la ficha al hacer clic—, así que filtrar
 * es esconder lo que no cumple, sin volver a consultar a la ANM. Eso lo hace
 * instantáneo y, sobre todo, honesto: el filtro solo puede ofrecer los valores
 * que de verdad están en pantalla.
 *
 * De ahí la decisión de fondo: **las opciones no están escritas en el código,
 * se leen de los datos**. Nadie sabe de memoria qué etapas usa la ANM ni cómo
 * las escribe, y una lista inventada acabaría ofreciendo "Exploración" cuando el
 * servicio dice "EXPLORACION". Recorriendo lo cargado, las opciones son siempre
 * las correctas aunque la ANM cambie su vocabulario.
 *
 * Lo que **no** está aquí es departamento y municipio: ninguna respuesta
 * observada de los cuatro servicios trae esos campos. Ver `scripts/probar-campos.mjs`,
 * que los sondea desde una máquina con internet para decidir por dónde ir.
 *
 * Módulo puro: recibe atributos y devuelve datos.
 */

import { escapeSqlText } from "./sqlText"

/**
 * Campos por los que se puede filtrar.
 *
 * `read` existe porque cada capa de la ANM bautiza sus campos a su manera: el
 * estado del título viene como TITULO_ESTADO en unas capas y como STATUS o
 * ESTADO en otras. Es el mismo respaldo que ya usa la ficha del expediente.
 */
export const FILTER_FIELDS = [
  {
    key: "estado",
    label: "Estado",
    fields: ["TITULO_ESTADO", "STATUS", "ESTADO"],
  },
  {
    key: "modalidad",
    label: "Modalidad",
    fields: ["MODALIDAD"],
  },
  {
    key: "etapa",
    label: "Etapa",
    fields: ["ETAPA"],
  },
  {
    key: "clasificacion",
    label: "Clasificación",
    fields: ["CLASIFICACION_MINERIA"],
  },
]

/** El primer campo con valor, siguiendo el orden de respaldo. */
const readField = (properties, fields) => {
  for (const field of fields) {
    const value = properties?.[field]
    if (value !== undefined && value !== null && String(value).trim() !== "") {
      return String(value).trim()
    }
  }
  return null
}

const AREA_FIELD = "AREA_HA"

/**
 * Recorre lo cargado y devuelve qué valores existen y en qué rango van las
 * áreas. Es lo que llena los desplegables del panel.
 *
 * @param {Array<Object>} featureProperties atributos de cada figura en pantalla
 */
export const collectFilterOptions = (featureProperties) => {
  const lista = Array.isArray(featureProperties) ? featureProperties : []
  const valores = Object.fromEntries(FILTER_FIELDS.map((campo) => [campo.key, new Set()]))
  let minArea = Infinity
  let maxArea = -Infinity

  lista.forEach((properties) => {
    FILTER_FIELDS.forEach((campo) => {
      const valor = readField(properties, campo.fields)
      if (valor) valores[campo.key].add(valor)
    })

    const area = Number(properties?.[AREA_FIELD])
    if (Number.isFinite(area)) {
      if (area < minArea) minArea = area
      if (area > maxArea) maxArea = area
    }
  })

  return {
    values: Object.fromEntries(
      // Ordenados alfabéticamente: el orden en que llegan del servicio no
      // significa nada y cambia entre consultas.
      FILTER_FIELDS.map((campo) => [campo.key, [...valores[campo.key]].sort((a, b) => a.localeCompare(b, "es"))]),
    ),
    area: Number.isFinite(minArea) ? { min: minArea, max: maxArea } : null,
  }
}

/**
 * La expresión que lee un campo con sus respaldos, en el lenguaje de MapLibre.
 *
 * **El envoltorio que convierte la cadena vacía en nada no sobra.** `coalesce`
 * solo se salta lo que vale `null`, y ArcGIS devuelve `""` —no `null`— en un
 * campo de texto sin dato. Sin esto, un título con `TITULO_ESTADO: ""` y
 * `ESTADO: "Vigente"` se leía como `""` y el mapa lo escondía, mientras
 * `matchesFilters` —que sí salta los vacíos— lo seguía contando: el panel decía
 * un número y el mapa enseñaba otro, sin ningún error de por medio. Es la peor
 * clase de discrepancia porque las dos mitades parecen correctas por separado.
 */
const readExpression = (field) => [
  "case",
  ["==", ["to-string", ["coalesce", ["get", field], ""]], ""],
  null,
  ["to-string", ["get", field]],
]

/**
 * El `""` del final tampoco es adorno: `match` exige texto o número y **revienta
 * la expresión entera si le llega `null`**, así que una figura sin ninguno de
 * los campos dejaría la capa sin filtrar en vez de sin coincidencias. Con la
 * cadena vacía, esa figura simplemente no casa con nada, que es lo correcto.
 *
 * Y `to-string` porque `readField` compara textos: un área guardada como número
 * y una opción guardada como "12" son el mismo valor y tienen que casar.
 */
const fieldExpression = (fields) => ["coalesce", ...fields.map(readExpression), ""]

/**
 * Traduce lo elegido en el panel a un filtro de MapLibre.
 *
 * @param {Object} selections {estado: ["Vigente"], etapa: [], ...}
 * @param {Object|null} areaRange {min, max} en hectáreas, o null si no se acota
 * @returns {Array|null} la expresión, o null cuando no hay nada que filtrar
 */
export const buildMapFilter = (selections = {}, areaRange = null) => {
  const condiciones = []

  FILTER_FIELDS.forEach((campo) => {
    const elegidos = selections?.[campo.key]
    if (!Array.isArray(elegidos) || elegidos.length === 0) return
    // `match` con lista de valores es lo que MapLibre resuelve más rápido; el
    // último par es qué devolver cuando no coincide ninguno.
    condiciones.push(["match", fieldExpression(campo.fields), elegidos, true, false])
  })

  if (areaRange) {
    // `to-number` no sobra: hay capas que devuelven el área como texto, y
    // comparar "123.45" con un número da siempre falso, sin avisar.
    const area = ["to-number", ["get", AREA_FIELD]]
    if (Number.isFinite(areaRange.min)) condiciones.push([">=", area, areaRange.min])
    if (Number.isFinite(areaRange.max)) condiciones.push(["<=", area, areaRange.max])
  }

  if (condiciones.length === 0) return null
  return condiciones.length === 1 ? condiciones[0] : ["all", ...condiciones]
}

/** Comilla simple duplicada: es como SQL escapa una comilla dentro de un texto. */
const quote = (value) => `'${escapeSqlText(value)}'`

/** Lo que se le pide al servicio cuando la capa no puede cumplir el filtro. */
export const NO_MATCHES = "1=0"

/**
 * El mismo filtro, pero en SQL, para pedírselo al servicio.
 *
 * Existe porque filtrar "en pantalla" y filtrar "en toda la capa" son dos cosas
 * distintas de verdad, no dos formas de decir lo mismo. En pantalla se esconde
 * lo que ya está cargado, y es instantáneo. En toda la capa hay que preguntarle
 * al servicio, porque los títulos que cumplen pueden estar a mil kilómetros de
 * donde se está mirando.
 *
 * ## Por qué hace falta saber qué campos tiene la capa
 *
 * El respaldo entre nombres de campo existe porque **cada capa de la ANM
 * bautiza el suyo a su manera**: el estado del título es TITULO_ESTADO en unas y
 * STATUS o ESTADO en otras. Traducirlo a un `OR` de los tres parecía lo natural,
 * y es justo lo que dispara la trampa nº 2 del proyecto: un `where` que nombra
 * un campo inexistente hace que ArcGIS responda **HTTP 200 con un cuerpo de
 * error**, `fetchArcgisJson` lo convierte en excepción y el visor saca el banner
 * rojo. O sea que el respaldo pensado para que ninguna capa se quedara sin
 * filtrar era lo que las rompía todas.
 *
 * Con `fields` —los nombres que la propia capa declara, leídos en runtime como
 * manda la trampa nº 1— se pregunta solo por los que existen. Y si no existe
 * ninguno, se pide `1=0` en vez de callar la condición: esa capa **no puede**
 * cumplir el filtro, y devolverla entera sería enseñar como resultado lo que no
 * se ha filtrado.
 *
 * @param {Object} selections {estado: ["Vigente"], ...}
 * @param {Object|null} areaRange {min, max} en hectáreas
 * @param {Set<string>|null} [fields] los campos que la capa declara, o null si
 *   no se pudieron averiguar; con null se nombran todos, que es como estaba
 * @returns {string|null} la cláusula, o null si no hay nada que filtrar
 */
export const buildWhereClause = (selections = {}, areaRange = null, fields = null) => {
  // La comparación va sin distinguir mayúsculas: los nombres de campo de ArcGIS
  // no las distinguen y una capa que publique `Estado` no debería quedarse fuera
  // por una letra.
  const disponibles = fields ? new Set([...fields].map((f) => String(f).toUpperCase())) : null
  const existe = (field) => !disponibles || disponibles.has(field.toUpperCase())

  const partes = []
  let imposible = false

  FILTER_FIELDS.forEach((campo) => {
    const elegidos = selections?.[campo.key]
    if (!Array.isArray(elegidos) || elegidos.length === 0) return

    const usables = campo.fields.filter(existe)
    if (usables.length === 0) {
      imposible = true
      return
    }

    const lista = elegidos.map(quote).join(", ")
    const porCampo = usables.map((field) => `${field} IN (${lista})`)
    partes.push(porCampo.length === 1 ? porCampo[0] : `(${porCampo.join(" OR ")})`)
  })

  if (areaRange) {
    if (!existe(AREA_FIELD)) imposible = true
    else {
      if (Number.isFinite(areaRange.min)) partes.push(`${AREA_FIELD} >= ${areaRange.min}`)
      if (Number.isFinite(areaRange.max)) partes.push(`${AREA_FIELD} <= ${areaRange.max}`)
    }
  }

  // `imposible` solo se marca cuando había algo que filtrar, así que aquí no
  // puede confundirse con "no hay filtro puesto".
  if (imposible) return NO_MATCHES
  return partes.length === 0 ? null : partes.join(" AND ")
}

/** ¿Hay algún filtro puesto? Lo usa el panel para enseñar el botón de limpiar. */
export const hasActiveFilters = (selections = {}, areaRange = null) =>
  Boolean(buildMapFilter(selections, areaRange))

/**
 * ¿Estos atributos pasan el filtro?
 *
 * Es la misma decisión que toma `buildMapFilter` dentro de MapLibre, pero en
 * JavaScript, para poder contarlos y para llenar la tabla de resultados sin
 * preguntarle al mapa qué está pintando.
 */
export const matchesFilters = (properties, selections = {}, areaRange = null) => {
  const pasaCampos = FILTER_FIELDS.every((campo) => {
    const elegidos = selections?.[campo.key]
    if (!Array.isArray(elegidos) || elegidos.length === 0) return true
    return elegidos.includes(readField(properties, campo.fields))
  })
  if (!pasaCampos) return false

  if (!areaRange) return true
  const area = Number(properties?.[AREA_FIELD])
  if (!Number.isFinite(area)) return false
  return area >= areaRange.min && area <= areaRange.max
}

/** Cuántas figuras pasan el filtro, para poder decirlo antes de aplicarlo. */
export const countMatching = (featureProperties, selections = {}, areaRange = null) => {
  const lista = Array.isArray(featureProperties) ? featureProperties : []
  return lista.filter((properties) => matchesFilters(properties, selections, areaRange)).length
}
