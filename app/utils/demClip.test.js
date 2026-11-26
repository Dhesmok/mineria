import {
  DEM_EPSG,
  DEM_NODATA,
  DEM_VERTICAL_EPSG,
  cropMosaic,
  demStats,
  encodeGeoTiff,
  planDemClip,
} from "./demClip"
import { DEM_MAX_ZOOM, EARTH_CIRCUMFERENCE_M, TILE_SIZE, mercatorXToLng, mercatorYToLat } from "./demTiles"

/**
 * Un lector mínimo de TIFF, solo para comprobar lo que escribe `encodeGeoTiff`.
 * Lee las etiquetas de la primera imagen tal como las leería cualquier SIG.
 */
const leerTiff = (bytes) => {
  const vista = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  expect(String.fromCharCode(bytes[0], bytes[1])).toBe("II")
  expect(vista.getUint16(2, true)).toBe(42)
  const ifd = vista.getUint32(4, true)
  const n = vista.getUint16(ifd, true)
  const tam = { 2: 1, 3: 2, 4: 4, 12: 8 }
  const etiquetas = {}
  const ids = []
  for (let i = 0; i < n; i++) {
    const p = ifd + 2 + i * 12
    const id = vista.getUint16(p, true)
    const tipo = vista.getUint16(p + 2, true)
    const cuenta = vista.getUint32(p + 4, true)
    const bytesValor = tam[tipo] * cuenta
    const donde = bytesValor <= 4 ? p + 8 : vista.getUint32(p + 8, true)
    const valores = []
    for (let k = 0; k < cuenta; k++) {
      const q = donde + k * tam[tipo]
      if (tipo === 3) valores.push(vista.getUint16(q, true))
      else if (tipo === 4) valores.push(vista.getUint32(q, true))
      else if (tipo === 12) valores.push(vista.getFloat64(q, true))
      else valores.push(vista.getUint8(q))
    }
    etiquetas[id] = tipo === 2 ? String.fromCharCode(...valores).replace(/\0$/, "") : valores
    ids.push(id)
  }
  return { etiquetas, ids }
}

describe("encodeGeoTiff", () => {
  const values = new Float32Array([100, 200.5, NaN, 400, 500, 600])
  const tiff = encodeGeoTiff({
    values,
    width: 3,
    height: 2,
    originX: -8400000,
    originY: 700000,
    pixelSize: 19.1,
  })
  const { etiquetas, ids } = leerTiff(tiff)

  it("escribe las etiquetas en orden creciente, como exige el formato", () => {
    expect([...ids]).toEqual([...ids].sort((a, b) => a - b))
  })

  it("declara una banda en coma flotante de 32 bits sin comprimir", () => {
    expect(etiquetas[256]).toEqual([3])
    expect(etiquetas[257]).toEqual([2])
    expect(etiquetas[258]).toEqual([32])
    expect(etiquetas[259]).toEqual([1])
    expect(etiquetas[339]).toEqual([3])
  })

  it("coloca la esquina noroeste y el tamaño de celda", () => {
    expect(etiquetas[33922]).toEqual([0, 0, 0, -8400000, 700000, 0])
    expect(etiquetas[33550]).toEqual([19.1, 19.1, 0])
  })

  it("declara Web Mercator y el geoide EGM96 en sus claves", () => {
    // La clave vertical es lo que impide que alguien le aplique un geoide a un
    // dato que ya está sobre el geoide: el README viejo mandaba a hacerlo.
    const claves = etiquetas[34735]
    const valor = (id) => {
      for (let i = 4; i < claves.length; i += 4) if (claves[i] === id) return claves[i + 3]
      return undefined
    }
    expect(claves[3]).toBe((claves.length - 4) / 4)
    expect(valor(3072)).toBe(DEM_EPSG)
    expect(valor(4096)).toBe(DEM_VERTICAL_EPSG)
  })

  it("los huecos van como el valor de sin dato, no como cero", () => {
    expect(etiquetas[42113]).toBe(String(DEM_NODATA))
    const inicio = etiquetas[273][0]
    expect(inicio % 4).toBe(0)
    const datos = new Float32Array(tiff.buffer.slice(inicio, inicio + 24))
    expect(Array.from(datos)).toEqual([100, 200.5, DEM_NODATA, 400, 500, 600])
    expect(etiquetas[279]).toEqual([24])
    expect(tiff.length).toBe(inicio + 24)
  })
})

describe("planDemClip", () => {
  const bbox = { west: -75.6, south: 6.2, east: -75.5, north: 6.3 }

  it("pide el nivel más fino que tiene sentido en un área pequeña", () => {
    const plan = planDemClip(bbox)
    expect(plan.range.zoom).toBe(DEM_MAX_ZOOM)
    expect(plan.reducedResolution).toBe(false)
    // ~19 m en Colombia, no los 10 de un nivel que el dato no tiene.
    expect(plan.cellMeters).toBeGreaterThan(18)
    expect(plan.cellMeters).toBeLessThan(20)
  })

  it("la ventana cubre el área entera y cae dentro del mosaico", () => {
    const plan = planDemClip(bbox)
    const { col0, row0, width, height } = plan.window
    expect(col0 + width).toBeLessThanOrEqual(plan.range.cols)
    expect(row0 + height).toBeLessThanOrEqual(plan.range.rows)

    // Las esquinas del recorte, de vuelta a grados, abrazan el área por fuera.
    const celdas = TILE_SIZE * 2 ** plan.range.zoom
    const oeste = mercatorXToLng((plan.range.minX * TILE_SIZE + col0) / celdas)
    const este = mercatorXToLng((plan.range.minX * TILE_SIZE + col0 + width) / celdas)
    const norte = mercatorYToLat((plan.range.minY * TILE_SIZE + row0) / celdas)
    const sur = mercatorYToLat((plan.range.minY * TILE_SIZE + row0 + height) / celdas)
    expect(oeste).toBeLessThanOrEqual(bbox.west)
    expect(este).toBeGreaterThanOrEqual(bbox.east)
    expect(norte).toBeGreaterThanOrEqual(bbox.north)
    expect(sur).toBeLessThanOrEqual(bbox.south)
    // …y por poco: menos de una celda de holgura a cada lado.
    expect(bbox.west - oeste).toBeLessThan(360 / celdas)
  })

  it("el origen en metros corresponde a la esquina de la ventana", () => {
    const plan = planDemClip(bbox)
    const celdas = TILE_SIZE * 2 ** plan.range.zoom
    expect(plan.pixelSize).toBeCloseTo(EARTH_CIRCUMFERENCE_M / celdas, 9)
    const lngOrigen = (plan.originX / (EARTH_CIRCUMFERENCE_M / 2)) * 180
    expect(lngOrigen).toBeCloseTo(
      mercatorXToLng((plan.range.minX * TILE_SIZE + plan.window.col0) / celdas),
      9,
    )
  })

  it("en un área enorme baja la resolución y lo marca", () => {
    // Que el README pueda decirlo: un DEM de 76 m presentado como de 19 sería
    // un dato falso.
    const plan = planDemClip({ west: -76.5, south: 5.5, east: -74.5, north: 7.5 })
    expect(plan.range.zoom).toBeLessThan(DEM_MAX_ZOOM)
    expect(plan.reducedResolution).toBe(true)
    expect(plan.range.tilesX * plan.range.tilesY).toBeLessThanOrEqual(64)
  })

  it("un área diminuta sigue teniendo al menos una celda", () => {
    const plan = planDemClip({ west: -75.5, south: 6.25, east: -75.5, north: 6.25 })
    expect(plan.window.width).toBeGreaterThanOrEqual(1)
    expect(plan.window.height).toBeGreaterThanOrEqual(1)
  })
})

describe("cropMosaic y demStats", () => {
  it("recorta la ventana fila a fila", () => {
    // Mosaico 4×3 numerado por posición.
    const mosaico = Float32Array.from({ length: 12 }, (_, i) => i)
    const recorte = cropMosaic(mosaico, 4, { col0: 1, row0: 1, width: 2, height: 2 })
    expect(Array.from(recorte)).toEqual([5, 6, 9, 10])
  })

  it("resume sin contar los huecos", () => {
    const stats = demStats(new Float32Array([10, NaN, 30]))
    expect(stats).toEqual({ min: 10, max: 30, mean: 20, noData: 1, valid: 2 })
  })

  it("sin ningún dato no inventa números", () => {
    expect(demStats(new Float32Array([NaN])).min).toBeNull()
  })
})
