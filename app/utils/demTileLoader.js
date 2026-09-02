/**
 * Bajar y decodificar teselas del modelo de elevación, con memoria.
 *
 * La parte que toca la red y el navegador. `demTiles.js` es la matemática —qué
 * teselas hacen falta y dónde va cada una—; esto es quien las trae.
 *
 * **No sabe nada de MapLibre**, que es la separación que importa: se le pide una
 * tesela por su z/x/y y devuelve un arreglo de alturas. Eso lo hace comprobable
 * sin levantar un mapa.
 *
 * **Bajarlas otra vez no cuesta lo que parece.** Son las mismas teselas que
 * MapLibre ya pidió para el relieve y el 3D, así que el navegador las tiene en su
 * caché de red: la segunda petición no sale a internet. Aun así se guardan aquí
 * ya decodificadas, porque decodificar un PNG y convertirlo a alturas cuesta ~1 ms
 * por tesela y al mover el mapa se repiten casi todas.
 */

import {
  DEM_MAX_ZOOM,
  TILE_SIZE,
  blankTile,
  cellInMosaic,
  cellSizeMeters,
  maxAround,
  pasteTile,
  tileRangeFor,
  tileUrl,
  tilesOf,
} from "./demTiles"
import { sampleGrid, slopeAspectFrom } from "./terrainAnalysis"

/**
 * Cuántas teselas decodificadas se recuerdan.
 *
 * Cada una son 256 KB de alturas. Noventa y seis son 24 MB, que es lo que ocupa
 * una foto del celular y cubre de sobra el vaivén de mover el mapa por una zona:
 * volver sobre lo ya visto sale instantáneo. No es una caché general del visor;
 * se vacía sola por antigüedad.
 */
const MAX_CACHED_TILES = 96

/**
 * Cuántas peticiones a la vez.
 *
 * El navegador limita a seis por servidor de todas formas, así que pedir más solo
 * llena una cola invisible y retrasa el aviso de progreso.
 */
const CONCURRENCIA = 6

/** Teselas ya decodificadas, las más antiguas primero (`Map` conserva el orden). */
const cache = new Map()

/** Peticiones en vuelo, para no pedir dos veces la misma tesela a la vez. */
const enVuelo = new Map()

const clave = ({ z, x, y }) => `${z}/${x}/${y}`

const recordar = (llave, alturas) => {
  cache.set(llave, alturas)
  while (cache.size > MAX_CACHED_TILES) {
    const masVieja = cache.keys().next().value
    cache.delete(masVieja)
  }
}

/**
 * El lienzo donde se vuelcan los PNG para leerles los bytes.
 *
 * Uno solo, reutilizado. Crear un lienzo de 256×256 por tesela sería crear
 * cuarenta por pantalla y dejárselos al recolector de basura.
 */
let lienzo = null
const contexto = () => {
  if (!lienzo) {
    lienzo =
      typeof OffscreenCanvas === "function"
        ? new OffscreenCanvas(TILE_SIZE, TILE_SIZE)
        : Object.assign(document.createElement("canvas"), {
            width: TILE_SIZE,
            height: TILE_SIZE,
          })
  }
  // `willReadFrequently` porque de este lienzo solo se leen píxeles: sin la
  // pista, el navegador lo mantiene en la tarjeta gráfica y cada lectura obliga a
  // traérselo de vuelta.
  return lienzo.getContext("2d", { willReadFrequently: true })
}

/**
 * Una tesela, en alturas.
 *
 * `fetch` y luego `createImageBitmap` sobre el blob, y no una etiqueta `img`:
 * así el lienzo nunca queda «contaminado» —el navegador no deja leer los píxeles
 * de una imagen de otro dominio cargada por la vía normal— y de paso se pueden
 * cancelar las peticiones al mover el mapa.
 *
 * @returns {Promise<Float32Array>} 256×256 alturas en metros
 */
const bajarTesela = async (template, tesela, signal) => {
  const respuesta = await fetch(tileUrl(template, tesela), { signal })
  if (!respuesta.ok) throw new Error(`La tesela ${clave(tesela)} respondió ${respuesta.status}`)

  const bitmap = await createImageBitmap(await respuesta.blob())
  const ctx = contexto()
  ctx.clearRect(0, 0, TILE_SIZE, TILE_SIZE)
  ctx.drawImage(bitmap, 0, 0)
  bitmap.close?.()

  const { data } = ctx.getImageData(0, 0, TILE_SIZE, TILE_SIZE)
  const alturas = new Float32Array(TILE_SIZE * TILE_SIZE)
  pasteTile(alturas, TILE_SIZE, data, 0, 0)
  return alturas
}

/** La tesela, de la memoria si está, de la red si no. */
export const loadTile = (template, tesela, signal) => {
  const llave = clave(tesela)

  const guardada = cache.get(llave)
  if (guardada) {
    // Volver a insertarla la marca como recién usada, para que no la desalojen
    // las que se pidieron después pero no se vuelven a mirar.
    cache.delete(llave)
    cache.set(llave, guardada)
    return Promise.resolve(guardada)
  }

  const pendiente = enVuelo.get(llave)
  if (pendiente) return pendiente

  const promesa = bajarTesela(template, tesela, signal)
    .then((alturas) => {
      recordar(llave, alturas)
      return alturas
    })
    .finally(() => enVuelo.delete(llave))

  enVuelo.set(llave, promesa)
  return promesa
}

/**
 * Baja las teselas de un rango y las pega en un solo arreglo de alturas.
 *
 * El resultado es lo mismo que tiene abierto un SIG cuando calcula pendientes:
 * una tira contigua de números, sin nada de por medio.
 *
 * @param {string} template la plantilla de dirección, con {z}/{x}/{y}
 * @param {Array} tiles las teselas y su sitio en el mosaico, de `tilesOf()`
 * @param {{cols: number, rows: number}} size tamaño del mosaico en celdas
 * @param {Object} [opciones]
 * @param {AbortSignal} [opciones.signal] para abandonar al mover el mapa
 * @param {(hechas: number, total: number) => void} [opciones.onProgress]
 * @returns {Promise<{heights: Float32Array, missing: number}>}
 */
export const loadMosaic = async (template, tiles, { cols, rows }, opciones = {}) => {
  const { signal, onProgress } = opciones
  const alturas = new Float32Array(cols * rows)
  let hechas = 0
  let faltantes = 0

  const cola = [...tiles]
  const trabajador = async () => {
    for (;;) {
      const tesela = cola.shift()
      if (!tesela) return
      if (signal?.aborted) return

      try {
        const tile = await loadTile(template, tesela, signal)
        // Cada fila de la tesela va a su sitio del mosaico. Ya vienen en alturas,
        // así que se copian tal cual en vez de volver a decodificar.
        for (let fila = 0; fila < TILE_SIZE; fila++) {
          alturas.set(
            tile.subarray(fila * TILE_SIZE, (fila + 1) * TILE_SIZE),
            (tesela.rowOffset + fila) * cols + tesela.colOffset,
          )
        }
      } catch (error) {
        if (signal?.aborted) return
        // Una tesela que no llega se marca como sin dato, no como altura cero: un
        // cuadrado a cero saldría rodeado de acantilados perfectos.
        blankTile(alturas, cols, tesela.colOffset, tesela.rowOffset)
        faltantes += 1
      }

      hechas += 1
      onProgress?.(hechas, tiles.length)
    }
  }

  await Promise.all(
    Array.from({ length: Math.min(CONCURRENCIA, tiles.length) }, () => trabajador()),
  )

  return { heights: alturas, missing: faltantes }
}

/** Un grado de latitud, en metros. Es constante; el de longitud no. */
const METROS_POR_GRADO = 111320

/**
 * ¿Cuánto sube el terreno alrededor de un punto, respecto de ese punto?
 *
 * La usa el 3D para saber por encima de qué tiene que pasar la cámara. Y devuelve
 * el **desnivel**, no la cota, porque MapLibre coloca la cámara sobre el suelo del
 * punto que mira y no sobre el nivel del mar: estando en Medellín a 1.500 m, lo
 * que hay que salvar no son los 2.200 m de la loma sino los 700 que sobresale.
 * Confundir las dos cosas alejaba el mapa nivel y medio de zoom de más.
 *
 * Tampoco vale con la cota del punto sola: en el fondo de un valle, una cámara
 * unos cientos de metros sobre el suelo queda metida dentro de la ladera de
 * enfrente. Lo que tiene que quedar por debajo es la loma.
 *
 * Se pregunta al modelo directamente y no a MapLibre porque MapLibre solo tiene
 * las teselas de lo que está dibujando, y justo en el caso que importa —mucho
 * zoom— responde cero. Comprobado: a zoom 15 y más, `queryTerrainElevation`
 * devolvía 0 sobre un terreno de 1.800 m.
 *
 * @returns {Promise<{relief: number, center: number, highest: number}|null>}
 *   metros **sin exagerar**, o null si el modelo no llegó
 */
export const reliefAround = async (template, { lng, lat, radiusMeters, zoom, signal }) => {
  const dLat = radiusMeters / METROS_POR_GRADO
  const dLng = radiusMeters / (METROS_POR_GRADO * Math.cos((lat * Math.PI) / 180) || 1)

  const rango = tileRangeFor(
    { west: lng - dLng, east: lng + dLng, south: lat - dLat, north: lat + dLat },
    zoom,
  )
  const teselas = tilesOf(rango)
  const { heights, missing } = await loadMosaic(template, teselas, rango, { signal })
  // Abandonar deja el mosaico a medias, y a medias significa lleno de ceros: sin
  // esta salida se devolvería un desnivel calculado sobre alturas que nunca se
  // bajaron —cero es una altura perfectamente válida, y ese es el problema—.
  if (signal?.aborted) return null
  if (missing === teselas.length) return null

  const { col, row } = cellInMosaic(lng, lat, rango)
  const lado = cellSizeMeters(lat, rango.zoom)
  const radioEnCeldas = Math.max(1, Math.round(radiusMeters / lado))

  const cima = maxAround(heights, rango.cols, rango.rows, col, row, radioEnCeldas)
  const centro = heights[row * rango.cols + col]
  if (cima === null || !Number.isFinite(centro)) return null

  // Nunca negativo: si el punto que se mira es el más alto de la zona, no hay
  // nada que salvar.
  return { relief: Math.max(0, cima - centro), center: centro, highest: cima }
}

/**
 * Consulta la cota, pendiente y orientación en un punto directamente del DEM,
 * sin necesidad de activar la malla 3D de MapLibre ni deformar la vista 2D.
 *
 * @param {string} template URL de las teselas terrarium
 * @param {{lng: number, lat: number}} lngLat
 * @param {{signal?: AbortSignal}} [opciones]
 * @returns {Promise<{elevation: number, slopeDegrees?: number, slopePercent?: number, aspectDegrees?: number, aspect?: Object}|null>}
 */
export const queryTerrainFromDEM = async (template, { lng, lat }, { signal } = {}) => {
  const puntos = sampleGrid([lng, lat])
  const radioMeters = 50
  const dLat = radioMeters / METROS_POR_GRADO
  const dLng = radioMeters / (METROS_POR_GRADO * Math.cos((lat * Math.PI) / 180) || 1)

  const rango = tileRangeFor(
    { west: lng - dLng, east: lng + dLng, south: lat - dLat, north: lat + dLat },
    DEM_MAX_ZOOM,
  )
  const teselas = tilesOf(rango)
  const { heights, missing } = await loadMosaic(template, teselas, rango, { signal })
  if (missing === teselas.length || signal?.aborted) return null

  const alturas = puntos.map(([pLng, pLat]) => {
    const { col, row } = cellInMosaic(pLng, pLat, rango)
    if (col < 0 || col >= rango.cols || row < 0 || row >= rango.rows) return null
    const val = heights[row * rango.cols + col]
    return Number.isFinite(val) ? val : null
  })

  const centro = alturas[4]
  if (!Number.isFinite(centro)) return null

  return {
    elevation: centro,
    ...(slopeAspectFrom(alturas) ?? {}),
  }
}

/** Para las pruebas: dejar la memoria como recién arrancada. */
export const clearTileCache = () => {
  cache.clear()
  enVuelo.clear()
}
