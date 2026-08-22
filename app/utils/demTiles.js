/**
 * Leer el modelo de elevación por nuestra cuenta, como lo haría un SIG.
 *
 * **Por qué existe este archivo.** La pendiente se calculaba preguntándole la
 * altura al motor de mapa punto por punto: veinte mil `unproject` más veinte mil
 * `queryTerrainElevation` por pantalla. Cada `unproject` con el terreno puesto no
 * es una fórmula, es un rayo lanzado contra la malla del relieve. Medido: 10,4
 * segundos de navegador congelado por pasada, y como la pasada se repetía cada
 * vez que llegaba un lote de teselas, se acumulaban hasta tumbar la pestaña.
 *
 * QGIS no hace nada de eso. Abre el archivo del modelo y lee la celda que
 * necesita de una tira de números en memoria. Aquí se puede hacer exactamente lo
 * mismo: las teselas del modelo son PNG en una dirección pública, ya están en la
 * caché del navegador porque MapLibre las bajó para el relieve, y la altura viene
 * empaquetada en los canales de color. Bajarlas, decodificarlas y pegarlas en un
 * solo arreglo deja la misma tira de números que tiene QGIS. Eso es todo lo que
 * hace este módulo.
 *
 * **Y hay un segundo beneficio, menos obvio y más importante.** Trabajar sobre la
 * rejilla del modelo y no sobre la de la pantalla significa que la pendiente de
 * una ladera es la misma sin importar cuánto te hayas acercado. Antes se
 * muestreaba cada 8 píxeles de pantalla, que según el zoom son 15 m o 60 m: la
 * misma ladera daba números distintos a distinta escala. Eso era un error, y era
 * también la razón de que la capa se apagara sola por debajo de cierto zoom.
 *
 * Módulo puro: no sabe nada de MapLibre. Recibe un rectángulo en coordenadas y
 * devuelve qué teselas hacen falta y dónde va cada una en el mosaico.
 */

/** Lado de una tesela de elevación, en celdas. Lo fija el proveedor. */
export const TILE_SIZE = 256

/**
 * Hasta qué nivel tiene sentido pedir teselas.
 *
 * Existen hasta el 15, pero el dato de origen en Colombia es SRTM de una segunda
 * de arco, o sea ~30 m. El nivel 13 ya da celdas de 19 m; del 14 para arriba lo
 * que llega es la misma información estirada. Pedirlo daría cuatro veces más
 * celdas para dibujar el mismo relieve, y —peor— la leyenda diría «celdas 10 m»
 * justo al lado del aviso que dice que el modelo es de 30. Un visor no puede
 * contradecirse a sí mismo en el mismo recuadro.
 */
export const DEM_MAX_ZOOM = 13

/**
 * Y desde qué nivel.
 *
 * Por debajo del 10 las celdas pasan de 150 m: la pendiente que sale sigue siendo
 * una pendiente real, pero la de un terreno tan generalizado que ya no responde a
 * la pregunta que se le hace al abrir la capa.
 */
export const DEM_MIN_ZOOM = 10

/**
 * Tope de teselas por pasada.
 *
 * En una pantalla normal salen unas 35. El tope es para una pantalla enorme o una
 * ventana muy apaisada: antes que bajar cien teselas, se baja un nivel de zoom.
 * Es la lección de la versión anterior — lo que no tiene freno acaba tumbando el
 * navegador.
 */
export const MAX_TILES = 64

/** Radio de la esfera con que se define Web Mercator. */
const EARTH_RADIUS_M = 6378137
const EARTH_CIRCUMFERENCE_M = 2 * Math.PI * EARTH_RADIUS_M

/** Hasta dónde llega Web Mercator. Más allá el mapa no existe. */
export const MERCATOR_MAX_LAT = 85.0511287798066

const clamp = (valor, minimo, maximo) => Math.min(Math.max(valor, minimo), maximo)

/** Longitud a la coordenada normalizada de Mercator, de 0 a 1. */
export const lngToMercatorX = (lng) => (lng + 180) / 360

/** Latitud a la coordenada normalizada de Mercator, de 0 (norte) a 1 (sur). */
export const latToMercatorY = (lat) => {
  const acotada = clamp(lat, -MERCATOR_MAX_LAT, MERCATOR_MAX_LAT)
  const radianes = (acotada * Math.PI) / 180
  return 0.5 - Math.log(Math.tan(Math.PI / 4 + radianes / 2)) / (2 * Math.PI)
}

/** Y de vuelta. */
export const mercatorXToLng = (x) => x * 360 - 180

export const mercatorYToLat = (y) => {
  const radianes = 2 * Math.atan(Math.exp((0.5 - y) * 2 * Math.PI)) - Math.PI / 2
  return (radianes * 180) / Math.PI
}

/**
 * Qué nivel de teselas pedir para un zoom de mapa.
 *
 * **El «+1» no es un ajuste a ojo: es una diferencia de convenio.** MapLibre
 * mide el zoom con teselas de 512 píxeles, y las del modelo de elevación son de
 * 256. A un mismo zoom, entonces, el mundo de MapLibre tiene el doble de
 * píxeles: su nivel 12 corresponde al nivel 13 de estas teselas. (Es lo mismo
 * que hace MapLibre por dentro con `tileSize: 256` en la fuente del terreno,
 * solo que ahí no se ve.)
 *
 * Sin el «+1» todo *parecía* funcionar: la capa salía bien colocada y con los
 * colores correctos, solo que dibujada a la mitad de resolución de lo que la
 * pantalla podía enseñar. No lo encontró ninguna prueba sobre los datos; se vio
 * midiendo en una captura dónde caían las franjas de una rampa conocida.
 */
export const demZoomFor = (mapZoom) =>
  clamp(Math.round(mapZoom) + 1, DEM_MIN_ZOOM, DEM_MAX_ZOOM)

/**
 * El lado de una celda del modelo sobre el terreno, en metros.
 *
 * Mercator estira las distancias con la latitud, así que el mismo nivel de zoom
 * son celdas más pequeñas cuanto más lejos del ecuador. En Colombia el factor es
 * casi 1, pero escribirlo bien cuesta una línea y evita que alguien que use esto
 * en otra latitud herede un error silencioso.
 */
export const cellSizeMeters = (lat, zoom) =>
  (EARTH_CIRCUMFERENCE_M * Math.cos((lat * Math.PI) / 180)) / (TILE_SIZE * 2 ** zoom)

/**
 * Qué teselas cubren un rectángulo, y de qué tamaño sale el mosaico.
 *
 * Si salen más de las que aguanta el tope, se baja un nivel y se vuelve a
 * intentar: cada nivel que se baja divide las teselas por cuatro, así que se
 * resuelve en dos vueltas como mucho.
 *
 * @param {{west: number, south: number, east: number, north: number}} bounds
 * @param {number} zoom nivel de teselas deseado
 * @returns {{zoom, minX, minY, maxX, maxY, tilesX, tilesY, cols, rows}}
 */
export const tileRangeFor = (bounds, zoom) => {
  const nivel = clamp(Math.round(zoom), 0, DEM_MAX_ZOOM)
  const teselas = 2 ** nivel

  const oeste = clamp(lngToMercatorX(bounds.west), 0, 1)
  const este = clamp(lngToMercatorX(bounds.east), 0, 1)
  const norte = clamp(latToMercatorY(bounds.north), 0, 1)
  const sur = clamp(latToMercatorY(bounds.south), 0, 1)

  const minX = Math.floor(oeste * teselas)
  const minY = Math.floor(norte * teselas)
  // El menos épsilon es para el borde exacto: si el rectángulo termina justo en
  // la línea entre dos teselas, `ceil` pediría una columna entera de más que no
  // se ve.
  const maxX = Math.min(teselas - 1, Math.ceil(este * teselas - 1e-9) - 1)
  const maxY = Math.min(teselas - 1, Math.ceil(sur * teselas - 1e-9) - 1)

  const tilesX = Math.max(1, maxX - minX + 1)
  const tilesY = Math.max(1, maxY - minY + 1)

  // El tope de teselas manda por encima del zoom mínimo, y el reparto es a
  // propósito: aquí se cuida la memoria, y que el resultado *signifique* algo lo
  // cuida `slopeUnavailableReason`, que se niega a dibujar por debajo del nivel
  // 10. Mezclar las dos cosas en una sola comprobación dejaría que un rectángulo
  // enorme pidiera cien teselas con tal de no bajar de un nivel que, de todas
  // formas, el visor no iba a pintar.
  if (tilesX * tilesY > MAX_TILES && nivel > 0) {
    return tileRangeFor(bounds, nivel - 1)
  }

  return {
    zoom: nivel,
    minX,
    minY,
    maxX: minX + tilesX - 1,
    maxY: minY + tilesY - 1,
    tilesX,
    tilesY,
    cols: tilesX * TILE_SIZE,
    rows: tilesY * TILE_SIZE,
  }
}

/**
 * Las cuatro esquinas del mosaico, en el orden que espera MapLibre.
 *
 * Arriba-izquierda, arriba-derecha, abajo-derecha, abajo-izquierda. Son las
 * esquinas exactas de las teselas, no las del rectángulo pedido: el mosaico
 * siempre es un poco más grande que lo que se ve, y colocarlo por las esquinas
 * del rectángulo pedido lo dejaría desplazado.
 */
export const mosaicCornersOf = (range) => {
  const teselas = 2 ** range.zoom
  const oeste = mercatorXToLng(range.minX / teselas)
  const este = mercatorXToLng((range.maxX + 1) / teselas)
  const norte = mercatorYToLat(range.minY / teselas)
  const sur = mercatorYToLat((range.maxY + 1) / teselas)

  return [
    [oeste, norte],
    [este, norte],
    [este, sur],
    [oeste, sur],
  ]
}

/** Las teselas del rango, con su sitio dentro del mosaico. */
export const tilesOf = (range) => {
  const lista = []
  for (let y = range.minY; y <= range.maxY; y++) {
    for (let x = range.minX; x <= range.maxX; x++) {
      lista.push({
        z: range.zoom,
        x,
        y,
        colOffset: (x - range.minX) * TILE_SIZE,
        rowOffset: (y - range.minY) * TILE_SIZE,
      })
    }
  }
  return lista
}

/** La dirección de una tesela, a partir de la plantilla de la fuente. */
export const tileUrl = (template, { z, x, y }) =>
  template.replace("{z}", String(z)).replace("{x}", String(x)).replace("{y}", String(y))

/**
 * La altura que esconde un píxel del PNG.
 *
 * Es la fórmula «terrarium», y cada proveedor usa la suya. Con la equivocada no
 * falla nada: salen montañas donde no las hay. Está también en `mapStyles.js`,
 * donde se le pasa el nombre del formato a MapLibre; aquí hay que escribirla
 * porque somos nosotros los que decodificamos.
 */
export const elevationFromPixel = (r, g, b) => r * 256 + g + b / 256 - 32768

/**
 * Pega una tesela ya decodificada en el mosaico de alturas.
 *
 * @param {Float32Array} mosaic alturas del mosaico completo
 * @param {number} mosaicCols ancho del mosaico en celdas
 * @param {Uint8ClampedArray} rgba los píxeles de la tesela, cuatro bytes cada uno
 * @param {number} colOffset dónde empieza esta tesela dentro del mosaico
 * @param {number} rowOffset
 */
export const pasteTile = (mosaic, mosaicCols, rgba, colOffset, rowOffset) => {
  for (let fila = 0; fila < TILE_SIZE; fila++) {
    const origen = fila * TILE_SIZE * 4
    const destino = (rowOffset + fila) * mosaicCols + colOffset
    for (let col = 0; col < TILE_SIZE; col++) {
      const i = origen + col * 4
      mosaic[destino + col] = elevationFromPixel(rgba[i], rgba[i + 1], rgba[i + 2])
    }
  }
}

/**
 * Marca una tesela que no llegó como «sin dato».
 *
 * NaN y no cero. Cero es una altura, y una tesela fallida pintada a cero sería un
 * cuadrado de acantilados contra sus vecinas — exactamente el tipo de dato falso
 * que parece verdadero.
 */
export const blankTile = (mosaic, mosaicCols, colOffset, rowOffset) => {
  for (let fila = 0; fila < TILE_SIZE; fila++) {
    const destino = (rowOffset + fila) * mosaicCols + colOffset
    mosaic.fill(NaN, destino, destino + TILE_SIZE)
  }
}
