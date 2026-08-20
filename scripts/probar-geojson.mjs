/**
 * ¿Los servicios de la ANM saben responder en GeoJSON?
 *
 * Se ejecuta con:  node scripts/probar-geojson.mjs
 *
 * Para qué sirve: hoy el visor le pide a la ANM su formato propio (el de Esri)
 * y lo traduce a GeoJSON, que es lo mismo que hacía el visor con Leaflet. Los
 * servidores ArcGIS modernos saben responder GeoJSON directamente, y si los de
 * la ANM lo hacen, ese paso de traducción sobra.
 *
 * No se pudo comprobar desde el entorno donde se escribió el código, porque no
 * tenía salida a internet. Este script lo comprueba desde tu máquina y dice, en
 * español, qué habla cada servicio.
 *
 * No cambia nada: solo pregunta.
 */

const TENURE_SERVICE =
  "https://annamineria.anm.gov.co/annageo/rest/services/SIGM/TenureLayers/MapServer"

// Un recuadro pequeño sobre Antioquia. Da igual si adentro hay títulos o no:
// lo que se está probando es si el servicio entiende el formato pedido, no
// cuántos polígonos devuelve.
const RECUADRO = "-75.7,6.1,-75.4,6.4"

const consultar = (url, formato) =>
  `${url}/query?` +
  new URLSearchParams({
    where: "1=1",
    geometry: RECUADRO,
    geometryType: "esriGeometryEnvelope",
    inSR: "4326",
    outSR: "4326",
    spatialRel: "esriSpatialRelIntersects",
    outFields: "*",
    returnGeometry: "true",
    resultRecordCount: "1",
    f: formato,
  })

/** Nombre e índice de cada capa del servicio de tenencia. */
const descubrirCapas = async () => {
  const encontradas = []
  for (const indice of [0, 1, 2, 3, 4, 5]) {
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
 * Pregunta en GeoJSON y dictamina.
 *
 * Ojo con la trampa de siempre: ArcGIS responde HTTP 200 con un cuerpo que
 * contiene `error` cuando algo va mal. Mirar solo el código de estado no basta.
 */
const hablaGeoJSON = async (url) => {
  try {
    const respuesta = await fetch(consultar(url, "geojson"))

    // Un fallo de red o de acceso no dice nada sobre si el servicio habla
    // GeoJSON: puede ser tu conexión, un proxy de la empresa o el servicio
    // caído. Se distingue de una respuesta real para no sacar conclusiones
    // falsas.
    if (!respuesta.ok) {
      return { estado: "duda", motivo: `no se pudo preguntar: el servidor respondió ${respuesta.status}` }
    }

    const texto = await respuesta.text()
    let datos
    try {
      datos = JSON.parse(texto)
    } catch {
      return { estado: "duda", motivo: "la respuesta no es JSON; puede ser una página de error" }
    }

    if (datos?.error) {
      return { estado: "no", motivo: `lo rechazó: ${datos.error.message || `error ${datos.error.code}`}` }
    }
    if (datos?.type !== "FeatureCollection") {
      return { estado: "no", motivo: `respondió algo que no es GeoJSON (type: ${datos?.type})` }
    }

    const cuantas = datos.features?.length ?? 0
    const geometria = datos.features?.[0]?.geometry?.type
    return {
      estado: "si",
      motivo: cuantas
        ? `GeoJSON válido (${cuantas} figura, geometría ${geometria})`
        : "GeoJSON válido, sin figuras dentro de ese recuadro",
    }
  } catch (error) {
    return { estado: "duda", motivo: `no se pudo conectar: ${error.message}` }
  }
}

const servicios = [
  ...(await descubrirCapas()).map(({ nombre, url }) => ({ nombre: `${nombre} (tenencia)`, url })),
  {
    nombre: "Subcontratos",
    url: "https://geo.anm.gov.co/webgis/rest/services/ANM/ServiciosANM/MapServer/3",
  },
  {
    nombre: "Título Histórico",
    url: "https://annamineria.anm.gov.co/annageo/rest/services/SIGM/VisorInterno/MapServer/87",
  },
]

console.log("\nPreguntando a los servicios de la ANM si saben responder en GeoJSON...\n")

const ETIQUETA = { si: "SÍ   ", no: "NO   ", duda: "¿?   " }
const estados = []

for (const servicio of servicios) {
  const resultado = await hablaGeoJSON(servicio.url)
  estados.push(resultado.estado)
  console.log(`  ${ETIQUETA[resultado.estado]}${servicio.nombre}`)
  console.log(`       ${resultado.motivo}`)
}

console.log("")

if (estados.length === 0 || estados.includes("duda")) {
  console.log("VEREDICTO: no se pudo comprobar.")
  console.log("No es que la ANM no hable GeoJSON: es que no se le pudo preguntar.")
  console.log("Revisa tu conexión, o si hay un proxy o cortafuegos de por medio, e")
  console.log("inténtalo otra vez. Mientras tanto no hay que cambiar nada.")
} else if (estados.every((estado) => estado === "si")) {
  console.log("VEREDICTO: todos los servicios hablan GeoJSON.")
  console.log("Se les puede pedir GeoJSON directamente y quitar el paso de traducción.")
  console.log("Es una simplificación, no un arreglo: como está ahora también funciona.")
  console.log("Para hacerlo: en app/utils/anmLayers.js, cambiar f: 'json' por")
  console.log("f: 'geojson' y dejar de convertir con arcgisResponseToGeoJSON.")
} else {
  console.log("VEREDICTO: al menos un servicio NO habla GeoJSON.")
  console.log("Hay que dejar el código como está: pedir el formato de Esri y traducirlo.")
  console.log("Que es justamente lo que hace hoy, así que no hay nada que tocar.")
}
console.log("")
