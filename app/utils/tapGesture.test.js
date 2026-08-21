import { TAP_MAX_MOVE_PX, TAP_MAX_MS, isTap, onMapTap } from "./tapGesture"

const punto = (x, y, time) => ({ x, y, time })

describe("isTap", () => {
  it("un dedo que apenas se mueve es un toque", () => {
    // Cero no vale como umbral: un dedo nunca se queda quieto del todo.
    expect(isTap(punto(100, 100, 0), punto(103, 98, 120))).toBe(true)
  })

  it("arrastrar el mapa no lo es", () => {
    expect(isTap(punto(100, 100, 0), punto(180, 100, 200))).toBe(false)
  })

  it("ni una pulsación mantenida", () => {
    expect(isTap(punto(100, 100, 0), punto(100, 100, TAP_MAX_MS + 1))).toBe(false)
  })

  it("el umbral de movimiento se mide en diagonal, no por eje", () => {
    // Nueve píxeles en cada eje son doce y pico en diagonal: por eje pasarían,
    // y arrastrando en diagonal se abriría la ficha sin querer.
    expect(isTap(punto(0, 0, 0), punto(9, 9, 100))).toBe(false)
    expect(isTap(punto(0, 0, 0), punto(TAP_MAX_MOVE_PX, 0, 100))).toBe(true)
  })

  it("sin uno de los dos extremos, no hay toque", () => {
    // Pasa cuando el gesto empezó con dos dedos: ahí no se guarda inicio.
    expect(isTap(null, punto(1, 1, 10))).toBe(false)
    expect(isTap(punto(1, 1, 0), null)).toBe(false)
  })
})

describe("onMapTap", () => {
  /** Un mapa de mentira con lo justo: un contenedor y un lienzo. */
  const mapaFalso = () => {
    const contenedor = document.createElement("div")
    const lienzo = document.createElement("canvas")
    lienzo.getBoundingClientRect = () => ({ left: 20, top: 40 })
    return {
      contenedor,
      map: {
        getCanvasContainer: () => contenedor,
        getCanvas: () => lienzo,
        unproject: ([x, y]) => ({ lng: x / 10, lat: y / 10 }),
      },
    }
  }

  const toque = (tipo, x, y, time) => {
    const evento = new Event(tipo, { bubbles: true })
    const lista = [{ clientX: x, clientY: y }]
    evento.touches = tipo === "touchend" ? [] : lista
    evento.changedTouches = lista
    Object.defineProperty(evento, "timeStamp", { value: time })
    return evento
  }

  it("avisa con el punto en píxeles del lienzo y su coordenada", () => {
    const { contenedor, map } = mapaFalso()
    const visto = []
    onMapTap(map, (e) => visto.push(e))

    contenedor.dispatchEvent(toque("touchstart", 120, 240, 0))
    contenedor.dispatchEvent(toque("touchend", 122, 241, 100))

    expect(visto).toHaveLength(1)
    // El recuadro del lienzo empieza en (20, 40): el punto es relativo a él.
    expect(visto[0].point).toEqual({ x: 102, y: 201 })
    expect(visto[0].lngLat).toEqual({ lng: 10.2, lat: 20.1 })
  })

  it("no avisa si el dedo arrastró", () => {
    const { contenedor, map } = mapaFalso()
    const visto = []
    onMapTap(map, (e) => visto.push(e))

    contenedor.dispatchEvent(toque("touchstart", 120, 240, 0))
    contenedor.dispatchEvent(toque("touchend", 320, 240, 200))

    expect(visto).toHaveLength(0)
  })

  it("ignora los gestos de dos dedos", () => {
    // Con dos dedos el usuario está haciendo zoom o girando, no señalando.
    const { contenedor, map } = mapaFalso()
    const visto = []
    onMapTap(map, (e) => visto.push(e))

    const dosDedos = new Event("touchstart", { bubbles: true })
    dosDedos.touches = [{ clientX: 100, clientY: 100 }, { clientX: 200, clientY: 200 }]
    dosDedos.changedTouches = dosDedos.touches
    contenedor.dispatchEvent(dosDedos)
    contenedor.dispatchEvent(toque("touchend", 100, 100, 100))

    expect(visto).toHaveLength(0)
  })

  it("se desengancha del todo", () => {
    const { contenedor, map } = mapaFalso()
    const visto = []
    const quitar = onMapTap(map, (e) => visto.push(e))
    quitar()

    contenedor.dispatchEvent(toque("touchstart", 120, 240, 0))
    contenedor.dispatchEvent(toque("touchend", 121, 240, 80))

    expect(visto).toHaveLength(0)
  })

  it("sin mapa no revienta", () => {
    // El mapa puede estar destruyéndose cuando esto corre.
    expect(() => onMapTap(null, () => {})()).not.toThrow()
  })
})
