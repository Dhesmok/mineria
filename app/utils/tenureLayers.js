import { fetchArcgisJson } from "./arcgis"

export const TENURE_LAYERS_URL =
  "https://annamineria.anm.gov.co/annageo/rest/services/SIGM/TenureLayers/MapServer"

export const TITLE_LAYER_NAME = "Título Vigente"
export const REQUEST_LAYER_NAME = "Solicitud Vigente"

const REQUIRED_LAYER_NAMES = [REQUEST_LAYER_NAME, TITLE_LAYER_NAME]
const LAYER_PROBE_RANGE = [0, 1, 2, 3, 4, 5]

export const tenureLayerUrl = (layerNumber) => `${TENURE_LAYERS_URL}/${layerNumber}`

let cachedLayerNumbers = null
let inFlightRequest = null

/**
 * Descubre en qué índice publica la ANM cada capa. Los números cambian entre
 * despliegues del servicio, así que no se pueden fijar en el código.
 *
 * La caché es de módulo para que el mapa, la búsqueda y el autocompletado usen los
 * mismos números: antes el autocompletado los tenía fijos en 3 y 4 mientras el resto
 * de la aplicación los descubría, y las dos vías podían discrepar.
 */
export const findTenureLayerNumbers = async () => {
  if (cachedLayerNumbers) {
    return cachedLayerNumbers
  }
  // Compartir la consulta en vuelo: varias llamadas concurrentes repetían las seis
  // peticiones de metadatos cada una.
  if (inFlightRequest) {
    return inFlightRequest
  }

  const request = (async () => {
    const probes = await Promise.all(
      LAYER_PROBE_RANGE.map(async (index) => {
        try {
          const data = await fetchArcgisJson(`${TENURE_LAYERS_URL}/${index}?f=json`)
          return [data.name, index]
        } catch (error) {
          console.error(`No se pudo leer la capa ${index}:`, error)
          return null
        }
      }),
    )

    const foundLayers = {}
    probes.forEach((probe) => {
      if (probe && REQUIRED_LAYER_NAMES.includes(probe[0])) {
        foundLayers[probe[0]] = probe[1]
      }
    })

    // No cachear un resultado incompleto: si todas las peticiones fallaban se guardaba
    // {} para siempre y las capas dinámicas quedaban rotas hasta recargar la página.
    if (REQUIRED_LAYER_NAMES.every((name) => foundLayers[name] !== undefined)) {
      cachedLayerNumbers = foundLayers
    }

    return foundLayers
  })()

  inFlightRequest = request
  try {
    return await request
  } finally {
    inFlightRequest = null
  }
}

/** Solo para pruebas. */
export const resetTenureLayerCache = () => {
  cachedLayerNumbers = null
  inFlightRequest = null
}
