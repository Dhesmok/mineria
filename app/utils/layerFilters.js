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

/** La expresión que lee un campo con sus respaldos, en el lenguaje de MapLibre. */
const fieldExpression = (fields) =>
  fields.length === 1 ? ["get", fields[0]] : ["coalesce", ...fields.map((field) => ["get", field])]

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

/**
 * El mismo filtro, pero en SQL, para pedírselo al servicio.
 *
 * Existe porque filtrar "en pantalla" y filtrar "en toda la capa" son dos cosas
 * distintas de verdad, no dos formas de decir lo mismo. En pantalla se esconde
 * lo que ya está cargado, y es instantáneo. En toda la capa hay que preguntarle
 * al servicio, porque los títulos que cumplen pueden estar a mil kilómetros de
 * donde se está mirando.
 *
 * El respaldo entre nombres de campo se traduce a un `OR`: una capa que no tenga
 * TITULO_ESTADO puede tener ESTADO, y preguntar solo por el primero devolvería
 * cero resultados en esa capa sin decir por qué.
 *
 * @returns {string|null} la cláusula, o null si no hay nada que filtrar
 */
export const buildWhereClause = (selections = {}, areaRange = null) => {
  const partes = []

  FILTER_FIELDS.forEach((campo) => {
    const elegidos = selections?.[campo.key]
    if (!Array.isArray(elegidos) || elegidos.length === 0) return

    const lista = elegidos.map(quote).join(", ")
    const porCampo = campo.fields.map((field) => `${field} IN (${lista})`)
    partes.push(porCampo.length === 1 ? porCampo[0] : `(${porCampo.join(" OR ")})`)
  })

  if (areaRange) {
    if (Number.isFinite(areaRange.min)) partes.push(`${AREA_FIELD} >= ${areaRange.min}`)
    if (Number.isFinite(areaRange.max)) partes.push(`${AREA_FIELD} <= ${areaRange.max}`)
  }

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
