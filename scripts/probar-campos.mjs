/**
 * ¿Qué campos traen de verdad las capas de la ANM?
 *
 * Se ejecuta con:  node scripts/probar-campos.mjs
 *
 * Para qué sirve: el panel ya filtra por estado, modalidad, etapa, clasificación
 * y área, porque esos campos se han visto en respuestas reales. Falta filtrar
 * por **departamento y municipio**, que es lo que más se pide, y ahí no se puede
 * ir a ciegas: no aparecen en ninguna respuesta observada, y hay dos caminos muy
 * distintos según lo que resulte.
 *
 *   - Si el servicio los trae con otro nombre (DEPARTAMENTO, DPTO, NOM_DPTO…),
 *     filtrar es añadir una línea a app/utils/layerFilters.js.
 *   - Si no los trae, hay que cruzar cada polígono con el mapa municipal del
 *     DANE, que es bastante más trabajo y hay que decidirlo a sabiendas.
 *
 * Este script pregunta y dice qué hay. No cambia nada.
 *
 * No se pudo comprobar desde el entorno donde se escribió el código, porque no
 * tiene salida a internet. Por eso se ejecuta desde tu máquina.
 */

const TENURE_SERVICE =
  "https://annamineria.anm.gov.co/annageo/rest/services/SIGM/TenureLayers/MapServer"

const SERVICIOS = [
  { nombre: "Subcontratos", url: "https://geo.anm.gov.co/webgis/rest/services/ANM/ServiciosANM/MapServer/3" },
  {
    nombre: "Título Histórico",
    url: "https://annamineria.anm.gov.co/annageo/rest/services/SIGM/VisorInterno/MapServer/87",
  },
]

/** Palabras que delatan un campo de división territorial. */
const PISTAS = ["depto", "dpto", "departa", "munic", "mpio", "municip", "divipola", "dane"]

const esTerritorial = (nombre) => {
  const limpio = nombre.toLowerCase()
  return PISTAS.some((pista) => limpio.includes(pista))
}

/** Nombre e índice de cada capa del servicio de tenencia. */
const descubrirCapas = async () => {
  const encontradas = []
  for (const indice of [0, 1, 2, 3, 4, 5, 6, 7]) {
    try {
      const respuesta = await fetch(`${TENURE_SERVICE}/${indice}?f=json`)
      const datos = await respuesta.json()
      if (datos?.name) encontradas.push({ nombre: datos.name, url: `${TENURE_SERVICE}/${indice}` })
    } catch {
      // Un índice que no existe no es un problema: se sondean varios a propósito.
    }
  }
  return encontradas
}

/**
 * Los campos que declara una capa, con su tipo.
 *
 * Se pregunta a los metadatos y no a una consulta de datos: los metadatos
 * enumeran todos los campos, mientras que una figura concreta puede traer
 * algunos vacíos y haría creer que no existen.
 */
const camposDe = async (url) => {
  const respuesta = await fetch(`${url}?f=json`)
  if (!respuesta.ok) throw new Error(`el servidor respondió ${respuesta.status}`)

  const datos = await respuesta.json()
  // Ojo con la trampa de siempre: ArcGIS responde HTTP 200 con un cuerpo que
  // contiene `error` cuando algo va mal.
  if (datos?.error) throw new Error(datos.error.message || `error ${datos.error.code}`)
  if (!Array.isArray(datos.fields)) throw new Error("la respuesta no trae la lista de campos")

  return datos.fields.map((campo) => ({ nombre: campo.name, alias: campo.alias, tipo: campo.type }))
}

/** Un ejemplo real, para ver cómo vienen escritos los valores. */
const unaFiguraDe = async (url, campos) => {
  const consulta =
    `${url}/query?` +
    new URLSearchParams({
      where: "1=1",
      outFields: campos.join(","),
      returnGeometry: "false",
      resultRecordCount: "1",
      f: "json",
    })

  const respuesta = await fetch(consulta)
  const datos = await respuesta.json()
  if (datos?.error) return null
  return datos.features?.[0]?.attributes ?? null
}

console.log("\nPreguntando a la ANM qué campos declara cada capa...\n")

const capas = [
  ...(await descubrirCapas()).map(({ nombre, url }) => ({ nombre: `${nombre} (tenencia)`, url })),
  ...SERVICIOS,
]

const hallazgos = []
let fallos = 0

for (const capa of capas) {
  try {
    const campos = await camposDe(capa.url)
    const territoriales = campos.filter((campo) => esTerritorial(campo.nombre) || esTerritorial(campo.alias || ""))

    console.log(`  ${capa.nombre}`)
    console.log(`       ${campos.length} campos en total`)

    if (territoriales.length === 0) {
      console.log("       sin campos de departamento ni municipio")
    } else {
      hallazgos.push({ capa: capa.nombre, campos: territoriales })
      for (const campo of territoriales) {
        console.log(`       → ${campo.nombre}  (${campo.alias || "sin alias"}, ${campo.tipo})`)
      }

      const ejemplo = await unaFiguraDe(capa.url, territoriales.map((c) => c.nombre))
      if (ejemplo) {
        console.log(`       ejemplo: ${JSON.stringify(ejemplo)}`)
      }
    }
  } catch (error) {
    fallos += 1
    console.log(`  ${capa.nombre}`)
    console.log(`       no se pudo preguntar: ${error.message}`)
  }
  console.log("")
}

if (capas.length === 0 || fallos === capas.length) {
  console.log("VEREDICTO: no se pudo comprobar.")
  console.log("No es que la ANM no tenga esos campos: es que no se le pudo preguntar.")
  console.log("Revisa tu conexión, o si hay un proxy o cortafuegos de por medio.")
} else if (hallazgos.length > 0) {
  console.log("VEREDICTO: hay campos de división territorial.")
  console.log("Se puede filtrar por departamento y municipio sin cruzar con nada más.")
  console.log("Pásame la salida de arriba y añado esos campos a app/utils/layerFilters.js.")
} else {
  console.log("VEREDICTO: ninguna capa declara departamento ni municipio.")
  console.log("Para filtrar por ellos habría que cruzar cada polígono con el mapa")
  console.log("municipal del DANE, que es bastante más trabajo. Con esta salida ya")
  console.log("se puede decidir si vale la pena.")
}
console.log("")
