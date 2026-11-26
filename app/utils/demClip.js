/**
 * El modelo de elevación recortado al área, como archivo que abre cualquier SIG.
 *
 * Era la pieza que faltaba de «dibuja un cuadro y sal con los archivos»: el ZIP
 * traía los polígonos y un README que reservaba la sección del DEM, pero no el
 * DEM. Este módulo hace el recorte y escribe el GeoTIFF.
 *
 * **De dónde salen las alturas.** De las mismas teselas que ya dibujan el relieve,
 * el 3D y la pendiente (`TERRAIN_TILE_TEMPLATE`), bajadas y decodificadas por
 * `demTileLoader`. En Colombia esas teselas son SRTM de una segunda de arco
 * —lo dice la propia tesela en su cabecera `x-amz-meta-x-imagery-sources`, que
 * para Medellín responde `srtm/N05W076.tif`—. El plan había elegido Copernicus
 * GLO-30, y la condición que lo decidió era «gratis, sin clave y sin cuota para
 * mucha gente»; estas teselas la cumplen igual, y además **ya funcionan en el
 * navegador**: los COG de Copernicus no permiten CORS (comprobado: el bucket
 * responde 403 a la consulta previa del navegador), así que usarlos exigiría un
 * intermediario en Vercel —con su tope de duración, que ya rompió las planchas— y
 * una librería para leer TIFF. Cambiar de fuente el día que convenga es cambiar
 * de dónde sale el mosaico; el recorte y la escritura de aquí no cambian.
 *
 * **Las alturas no son elipsoidales.** SRTM está referido al geoide EGM96: son
 * cotas sobre el nivel medio del mar según ese modelo, no alturas sobre el
 * elipsoide. El README de la descarga decía lo contrario y mandaba a «aplicar el
 * geoide», que sobre un dato ya referido al geoide lo descuadra entre 0 y 30 m en
 * Colombia. El GeoTIFF lo declara en sus claves (`VerticalCSTypeGeoKey` = 5773,
 * «EGM96 height»), para que el SIG que lo abra no tenga que adivinarlo.
 *
 * **Sin remuestrear.** El archivo sale en la rejilla nativa de las teselas, en
 * Web Mercator (EPSG:3857): cada celda es un dato del modelo y no una
 * interpolación. Pasarlo a MAGNA-SIRGAS aquí obligaría a inventar valores entre
 * celdas; QGIS o ArcGIS lo reproyectan al abrirlo con el método que quien lo usa
 * elija, que es donde esa decisión tiene que estar.
 *
 * Módulo puro: ni red ni MapLibre. Recibe el mosaico de alturas y devuelve bytes.
 */

import {
  DEM_MAX_ZOOM,
  EARTH_CIRCUMFERENCE_M,
  TILE_SIZE,
  cellSizeMeters,
  latToMercatorY,
  lngToMercatorX,
  tileRangeFor,
} from "./demTiles"

/** Valor de «sin dato» en el archivo. NaN no lo entienden todos los SIG. */
export const DEM_NODATA = -9999

/** El sistema de la rejilla de las teselas: Web Mercator. */
export const DEM_EPSG = 3857

/** «EGM96 height», el código EPSG del sistema vertical de SRTM. */
export const DEM_VERTICAL_EPSG = 5773

const clamp = (valor, minimo, maximo) => Math.min(Math.max(valor, minimo), maximo)

/**
 * Qué teselas pedir y qué ventana del mosaico cae dentro del área.
 *
 * Se pide el nivel más fino que tiene sentido (`DEM_MAX_ZOOM`, celdas de ~19 m
 * sobre un dato de 30). Si el área es tan grande que pasaría del tope de teselas,
 * `tileRangeFor` baja de nivel solo, y aquí se marca para que el README lo diga:
 * un DEM de 76 m que se presenta como de 19 sería un dato falso.
 *
 * @param {{west: number, south: number, east: number, north: number}} bbox
 * @returns {{range, window: {col0, row0, width, height}, originX, originY, pixelSize, cellMeters, reducedResolution: boolean}}
 */
export const planDemClip = (bbox) => {
  const range = tileRangeFor(bbox, DEM_MAX_ZOOM)
  const celdas = TILE_SIZE * 2 ** range.zoom

  // La ventana se toma por fuera: floor al oeste y al norte, ceil al este y al
  // sur. Así el recorte cubre el área entera aunque sus bordes caigan a mitad de
  // celda, que es lo que se espera de un recorte por envolvente.
  const colGlobal0 = Math.floor(clamp(lngToMercatorX(bbox.west), 0, 1) * celdas)
  const colGlobal1 = Math.ceil(clamp(lngToMercatorX(bbox.east), 0, 1) * celdas)
  const rowGlobal0 = Math.floor(clamp(latToMercatorY(bbox.north), 0, 1) * celdas)
  const rowGlobal1 = Math.ceil(clamp(latToMercatorY(bbox.south), 0, 1) * celdas)

  const col0 = clamp(colGlobal0 - range.minX * TILE_SIZE, 0, range.cols - 1)
  const row0 = clamp(rowGlobal0 - range.minY * TILE_SIZE, 0, range.rows - 1)
  // Al menos una celda: un área diminuta sigue mereciendo su dato.
  const width = clamp(colGlobal1 - range.minX * TILE_SIZE, col0 + 1, range.cols) - col0
  const height = clamp(rowGlobal1 - range.minY * TILE_SIZE, row0 + 1, range.rows) - row0

  const pixelSize = EARTH_CIRCUMFERENCE_M / celdas
  const mitad = EARTH_CIRCUMFERENCE_M / 2
  const originX = (range.minX * TILE_SIZE + col0) * pixelSize - mitad
  const originY = mitad - (range.minY * TILE_SIZE + row0) * pixelSize

  return {
    range,
    window: { col0, row0, width, height },
    originX,
    originY,
    pixelSize,
    // El lado de la celda sobre el terreno, que no es `pixelSize`: Mercator
    // estira con la latitud. En Colombia la diferencia es de menos del 2 %, pero
    // el README tiene que decir el número que es.
    cellMeters: cellSizeMeters((bbox.north + bbox.south) / 2, range.zoom),
    reducedResolution: range.zoom < DEM_MAX_ZOOM,
  }
}

/** Recorta una ventana del mosaico a un arreglo propio, fila a fila. */
export const cropMosaic = (heights, cols, { col0, row0, width, height }) => {
  const salida = new Float32Array(width * height)
  for (let f = 0; f < height; f++) {
    const desde = (row0 + f) * cols + col0
    salida.set(heights.subarray(desde, desde + width), f * width)
  }
  return salida
}

/**
 * Mínimo, máximo, media y huecos. Van al README: con tres números se sabe si el
 * archivo es el que se esperaba sin tener que abrirlo.
 */
export const demStats = (values) => {
  let min = Infinity
  let max = -Infinity
  let suma = 0
  let validas = 0
  let huecos = 0
  for (let i = 0; i < values.length; i++) {
    const v = values[i]
    if (!Number.isFinite(v)) {
      huecos += 1
      continue
    }
    if (v < min) min = v
    if (v > max) max = v
    suma += v
    validas += 1
  }
  return validas === 0
    ? { min: null, max: null, mean: null, noData: huecos, valid: 0 }
    : { min, max, mean: suma / validas, noData: huecos, valid: validas }
}

// Tipos de campo de TIFF, con su tamaño en bytes.
const SHORT = 3
const LONG = 4
const ASCII = 2
const DOUBLE = 12
const TAMANO = { [SHORT]: 2, [LONG]: 4, [ASCII]: 1, [DOUBLE]: 8 }

/**
 * Escribe un GeoTIFF de una banda en coma flotante de 32 bits, sin comprimir.
 *
 * El formato es viejo y sencillo: una cabecera, una lista de etiquetas
 * ordenadas por número y los datos. Lo que lo vuelve *geo* son tres etiquetas
 * más —dónde cae la esquina, cuánto mide la celda y en qué sistema está—, y la
 * de «sin dato», que es de GDAL pero la leen QGIS, ArcGIS y Global Mapper. No
 * hace falta ninguna librería para esto, y sumar una de cientos de kB para
 * escribir doscientos bytes de cabecera sería la trampa nº 14 al revés.
 *
 * Sin comprimir a propósito: el ZIP ya comprime, y un TIFF con compresión
 * propia dentro de un ZIP no gana casi nada y sí añade una forma más de que un
 * programa viejo no lo abra.
 *
 * @param {Object} p
 * @param {Float32Array} p.values alturas, fila a fila desde el noroeste; NaN = sin dato
 * @param {number} p.width
 * @param {number} p.height
 * @param {number} p.originX esquina noroeste, en metros del sistema
 * @param {number} p.originY
 * @param {number} p.pixelSize lado de la celda en metros del sistema
 * @returns {Uint8Array}
 */
export const encodeGeoTiff = ({ values, width, height, originX, originY, pixelSize }) => {
  const geoKeys = [
    // Cabecera: versión 1.1.0 y cuántas claves vienen.
    1, 1, 0, 6,
    // GTModelTypeGeoKey: proyectado.
    1024, 0, 1, 1,
    // GTRasterTypeGeoKey: el valor representa el área de la celda, no su esquina.
    1025, 0, 1, 1,
    // ProjectedCSTypeGeoKey.
    3072, 0, 1, DEM_EPSG,
    // ProjLinearUnitsGeoKey: metros.
    3076, 0, 1, 9001,
    // VerticalCSTypeGeoKey: EGM96. Es lo que impide que alguien le aplique el
    // geoide a un dato que ya está sobre el geoide.
    4096, 0, 1, DEM_VERTICAL_EPSG,
    // VerticalUnitsGeoKey: metros.
    4099, 0, 1, 9001,
  ]
  const nodata = `${DEM_NODATA}\0`
  const bytesImagen = width * height * 4

  // Etiquetas en orden creciente, que es lo que exige el formato.
  const etiquetas = [
    [256, LONG, [width]],
    [257, LONG, [height]],
    [258, SHORT, [32]],
    [259, SHORT, [1]],
    [262, SHORT, [1]],
    [273, LONG, [0]], // se rellena cuando se sepa dónde caen los datos
    [277, SHORT, [1]],
    [278, LONG, [height]],
    [279, LONG, [bytesImagen]],
    [284, SHORT, [1]],
    [339, SHORT, [3]], // coma flotante
    [33550, DOUBLE, [pixelSize, pixelSize, 0]],
    [33922, DOUBLE, [0, 0, 0, originX, originY, 0]],
    [34735, SHORT, geoKeys],
    [42113, ASCII, nodata],
  ]

  const inicioIfd = 8
  const tamanoIfd = 2 + etiquetas.length * 12 + 4
  // Los valores que no caben en los cuatro bytes de la etiqueta van detrás de
  // la lista, cada uno en una posición par como pide el formato.
  let cursor = inicioIfd + tamanoIfd
  const fuera = etiquetas.map(([, tipo, valores]) => {
    const bytes = TAMANO[tipo] * valores.length
    if (bytes <= 4) return null
    const posicion = cursor
    cursor += bytes + (bytes % 2)
    return posicion
  })
  // Los datos de la imagen al final, alineados a cuatro bytes para que se
  // puedan leer de una vez como Float32Array.
  const inicioDatos = cursor + ((4 - (cursor % 4)) % 4)
  etiquetas[5][2] = [inicioDatos]

  const buffer = new ArrayBuffer(inicioDatos + bytesImagen)
  const vista = new DataView(buffer)
  const bytes = new Uint8Array(buffer)

  // «II»: orden de bytes de Intel, y el 42 que identifica un TIFF.
  vista.setUint8(0, 0x49)
  vista.setUint8(1, 0x49)
  vista.setUint16(2, 42, true)
  vista.setUint32(4, inicioIfd, true)

  const escribir = (posicion, tipo, valores) => {
    valores = typeof valores === "string" ? Array.from(valores, (c) => c.charCodeAt(0)) : valores
    valores.forEach((v, i) => {
      const p = posicion + i * TAMANO[tipo]
      if (tipo === SHORT) vista.setUint16(p, v, true)
      else if (tipo === LONG) vista.setUint32(p, v, true)
      else if (tipo === DOUBLE) vista.setFloat64(p, v, true)
      else vista.setUint8(p, v)
    })
  }

  vista.setUint16(inicioIfd, etiquetas.length, true)
  etiquetas.forEach(([id, tipo, valores], i) => {
    const p = inicioIfd + 2 + i * 12
    vista.setUint16(p, id, true)
    vista.setUint16(p + 2, tipo, true)
    vista.setUint32(p + 4, valores.length, true)
    if (fuera[i] === null) {
      escribir(p + 8, tipo, valores)
    } else {
      vista.setUint32(p + 8, fuera[i], true)
      escribir(fuera[i], tipo, valores)
    }
  })
  vista.setUint32(inicioIfd + 2 + etiquetas.length * 12, 0, true) // no hay más imágenes

  const datos = new Float32Array(buffer, inicioDatos, width * height)
  for (let i = 0; i < width * height; i++) {
    const v = values[i]
    datos[i] = Number.isFinite(v) ? v : DEM_NODATA
  }
  // Float32Array escribe en el orden de la máquina. Todos los navegadores y Node
  // en uso son little-endian, igual que la cabecera «II»; si alguno no lo fuera,
  // se invierte aquí en vez de entregar un archivo con alturas sin sentido.
  if (new Uint8Array(new Uint16Array([1]).buffer)[0] !== 1) {
    for (let i = inicioDatos; i < bytes.length; i += 4) {
      bytes.subarray(i, i + 4).reverse()
    }
  }

  return bytes
}
