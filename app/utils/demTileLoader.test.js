import { TILE_SIZE, tileRangeFor, tilesOf } from "./demTiles"
import { clearTileCache, loadMosaic, loadTile } from "./demTileLoader"

/**
 * El navegador, de mentira.
 *
 * Este módulo es el único de `utils/` que toca la red y el lienzo, así que
 * probarlo obliga a fingirlos. Se finge lo justo: `fetch` devuelve un sobre con
 * la altura que se le pida, y el lienzo devuelve esos mismos píxeles. Lo que se
 * comprueba de verdad es lo de siempre —la memoria, las peticiones repetidas y
 * qué pasa cuando una tesela no llega—, que es donde estaban los bugs.
 */

const PLANTILLA = "https://ejemplo/{z}/{x}/{y}.png"

/** Los píxeles de una tesela entera a una altura constante, en formato terrarium. */
const teselaDe = (metros) => {
  const total = Math.round((metros + 32768) * 256)
  const rgba = new Uint8ClampedArray(TILE_SIZE * TILE_SIZE * 4)
  for (let i = 0; i < TILE_SIZE * TILE_SIZE; i++) {
    rgba[i * 4] = (total >> 16) & 255
    rgba[i * 4 + 1] = (total >> 8) & 255
    rgba[i * 4 + 2] = total & 255
    rgba[i * 4 + 3] = 255
  }
  return rgba
}

/** Cuántas veces se pidió cada dirección. */
let peticiones
/** Direcciones que tienen que fallar. */
let rotas
/** Qué altura devuelve cada dirección; por omisión, 1000 m. */
let alturas

const montarNavegador = () => {
  peticiones = new Map()
  rotas = new Set()
  alturas = new Map()

  global.fetch = jest.fn((url) => {
    peticiones.set(url, (peticiones.get(url) ?? 0) + 1)
    if (rotas.has(url)) return Promise.resolve({ ok: false, status: 404 })
    const pixeles = teselaDe(alturas.get(url) ?? 1000)
    return Promise.resolve({ ok: true, blob: () => Promise.resolve({ pixeles }) })
  })

  // El «bitmap» se limita a llevar los píxeles del sobre hasta el lienzo.
  global.createImageBitmap = jest.fn((blob) => Promise.resolve({ pixeles: blob.pixeles }))

  let dibujado = null
  const contexto = {
    clearRect: () => {},
    drawImage: (bitmap) => {
      dibujado = bitmap.pixeles
    },
    getImageData: () => ({ data: dibujado }),
  }
  global.OffscreenCanvas = function OffscreenCanvasFalso() {
    this.getContext = () => contexto
  }
}

beforeEach(() => {
  montarNavegador()
  clearTileCache()
})

describe("loadTile", () => {
  const tesela = { z: 13, x: 100, y: 200 }

  it("devuelve las alturas que esconde el PNG", async () => {
    alturas.set("https://ejemplo/13/100/200.png", 1847.5)
    const resultado = await loadTile(PLANTILLA, tesela)

    expect(resultado).toHaveLength(TILE_SIZE * TILE_SIZE)
    expect(resultado[0]).toBeCloseTo(1847.5, 3)
    expect(resultado[TILE_SIZE * TILE_SIZE - 1]).toBeCloseTo(1847.5, 3)
  })

  it("la segunda vez no sale a la red", async () => {
    // Es lo que hace que mover el mapa por una zona ya vista sea instantáneo.
    await loadTile(PLANTILLA, tesela)
    await loadTile(PLANTILLA, tesela)
    expect(peticiones.get("https://ejemplo/13/100/200.png")).toBe(1)
  })

  it("dos peticiones a la vez se resuelven con una sola descarga", async () => {
    // Al mover el mapa, la pasada nueva pide teselas que la anterior todavía está
    // bajando. Sin esto se descargarían dos veces.
    const [a, b] = await Promise.all([
      loadTile(PLANTILLA, tesela),
      loadTile(PLANTILLA, tesela),
    ])
    expect(peticiones.get("https://ejemplo/13/100/200.png")).toBe(1)
    expect(a).toBe(b)
  })

  it("una tesela que responde mal se propaga como error", async () => {
    rotas.add("https://ejemplo/13/100/200.png")
    await expect(loadTile(PLANTILLA, tesela)).rejects.toThrow(/404/)
  })

  it("y un fallo no se queda guardado", async () => {
    // Guardar el fallo dejaría la zona rota hasta recargar la página. Es la misma
    // trampa que ya se documentó con los índices de capa de la ANM.
    rotas.add("https://ejemplo/13/100/200.png")
    await expect(loadTile(PLANTILLA, tesela)).rejects.toThrow()

    rotas.clear()
    alturas.set("https://ejemplo/13/100/200.png", 2000)
    await expect(loadTile(PLANTILLA, tesela)).resolves.toBeInstanceOf(Float32Array)
  })
})

describe("loadMosaic", () => {
  const rango = tileRangeFor(
    { west: -75.62, east: -75.58, south: 6.22, north: 6.26 },
    13,
  )
  const teselas = tilesOf(rango)

  it("pega cada tesela en su sitio", async () => {
    // Cada tesela con una altura distinta: si alguna acabara en el hueco de otra,
    // el mosaico lo delata.
    teselas.forEach((t, i) => alturas.set(`https://ejemplo/13/${t.x}/${t.y}.png`, 1000 + i))

    const { heights, missing } = await loadMosaic(PLANTILLA, teselas, rango)

    expect(missing).toBe(0)
    expect(heights).toHaveLength(rango.cols * rango.rows)
    teselas.forEach((t, i) => {
      const centro = (t.rowOffset + 128) * rango.cols + t.colOffset + 128
      expect(heights[centro]).toBeCloseTo(1000 + i, 3)
    })
  })

  it("va contando", async () => {
    // El aviso de progreso que se ve en la leyenda sale de aquí. Sin él, bajar
    // cuarenta teselas por primera vez parece que la capa se colgó.
    const avisos = []
    await loadMosaic(PLANTILLA, teselas, rango, {
      onProgress: (hechas, total) => avisos.push([hechas, total]),
    })

    expect(avisos).toHaveLength(teselas.length)
    expect(avisos[avisos.length - 1]).toEqual([teselas.length, teselas.length])
    // Y sin saltarse ninguna ni contar dos veces.
    avisos.forEach(([hechas], i) => expect(hechas).toBe(i + 1))
  })

  it("una tesela que no llega deja un hueco, no una altura cero", async () => {
    // Cero es una altura. Un cuadrado a cero saldría rodeado de acantilados
    // perfectos y se leería como un dato de verdad.
    const rota = teselas[0]
    rotas.add(`https://ejemplo/13/${rota.x}/${rota.y}.png`)

    const { heights, missing } = await loadMosaic(PLANTILLA, teselas, rango)

    expect(missing).toBe(1)
    expect(Number.isNaN(heights[rota.rowOffset * rango.cols + rota.colOffset])).toBe(true)
    // Las demás llegaron igual: una tesela caída no tumba el mosaico.
    const otra = teselas[teselas.length - 1]
    expect(heights[(otra.rowOffset + 1) * rango.cols + otra.colOffset]).toBeCloseTo(1000, 3)
  })

  it("si se abandona, deja de pedir teselas", async () => {
    // Mover el mapa mientras se baja tiene que cancelar lo anterior: si no, la
    // pasada vieja termina después de la nueva y pinta el área anterior encima.
    const control = new AbortController()
    control.abort()

    await loadMosaic(PLANTILLA, teselas, rango, { signal: control.signal })
    expect(global.fetch).not.toHaveBeenCalled()
  })
})
