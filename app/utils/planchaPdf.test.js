import pdfjs from "pdfjs-dist"
import {
  ANCHO_MEDIDA,
  anchoMaximoDeTextura,
  calcularEscalaMedida,
  prepararPlancha,
  rasterizarParaMedir,
  recortarMapa,
} from "./planchaPdf"

jest.mock("pdfjs-dist", () => ({
  GlobalWorkerOptions: { workerSrc: "" },
  getDocument: jest.fn(),
}))

describe("calcularEscalaMedida", () => {
  const dimensionOriginal = { width: 2500, height: 2000 }

  test("en escritorio usa el presupuesto de ANCHO_MEDIDA (3000 px)", () => {
    window.innerWidth = 1280
    const escala = calcularEscalaMedida(dimensionOriginal)
    const anchoEsperado = dimensionOriginal.width * escala
    const altoEsperado = dimensionOriginal.height * escala
    const pixeles = anchoEsperado * altoEsperado

    expect(ANCHO_MEDIDA).toBe(3000)
    expect(anchoEsperado).toBeLessThanOrEqual(3000)
    expect(pixeles).toBeLessThanOrEqual(7500000)
    expect(escala).toBeCloseTo(3000 / 2500, 2)
  })

  test("en móvil (< 768 px) limita a 1600 px y presupuesto de 2 Megapíxeles", () => {
    window.innerWidth = 1280
    const escalaEscritorio = calcularEscalaMedida(dimensionOriginal)

    window.innerWidth = 412
    const escala = calcularEscalaMedida(dimensionOriginal)
    const anchoEsperado = dimensionOriginal.width * escala
    const altoEsperado = dimensionOriginal.height * escala
    const pixeles = anchoEsperado * altoEsperado

    expect(anchoEsperado).toBeLessThanOrEqual(1600)
    expect(pixeles).toBeLessThanOrEqual(2000001)
    expect(escala).toBeLessThan(escalaEscritorio)
  })

  test("en móvil con reintento (intento 2) reduce a 1200 px y 1.44 Megapíxeles", () => {
    window.innerWidth = 390
    const escala1 = calcularEscalaMedida(dimensionOriginal, { intento: 1 })
    const escala2 = calcularEscalaMedida(dimensionOriginal, { intento: 2 })

    expect(escala2).toBeLessThan(escala1)
    const ancho2 = dimensionOriginal.width * escala2
    const alto2 = dimensionOriginal.height * escala2
    expect(ancho2).toBeLessThanOrEqual(1200)
    expect(ancho2 * alto2).toBeLessThanOrEqual(1440001)
  })

  test("presupuesto estricto: el redondeo de ancho y alto nunca excede los límites", () => {
    window.innerWidth = 412
    const formatos = [
      { width: 5000, height: 1000 },
      { width: 1000, height: 5000 },
      { width: 2579, height: 2012 }, // Plancha 19
      { width: 3400, height: 3400 }, // Cuadrada grande
    ]

    for (const f of formatos) {
      const escala = calcularEscalaMedida(f, { intento: 1 })
      const wEntero = Math.round(f.width * escala)
      const hEntero = Math.round(f.height * escala)
      expect(wEntero).toBeLessThanOrEqual(1600)
      expect(wEntero * hEntero).toBeLessThanOrEqual(2000000)
    }
  })

  test("contraejemplo de Astra (40000 x 35000): cumple estrictamente <= 2 MP y <= 1600 px", () => {
    window.innerWidth = 412
    const escala = calcularEscalaMedida({ width: 40000, height: 35000 })
    const w = Math.max(1, Math.round(40000 * escala))
    const h = Math.max(1, Math.round(35000 * escala))
    expect(w).toBeLessThanOrEqual(1600)
    expect(w * h).toBeLessThanOrEqual(2000000)
  })

  test("contraejemplo astronómico de Astra (40e9 x 35e9): cumple estrictamente sobre dimensiones efectivas", () => {
    window.innerWidth = 412
    const f = { width: 40000000000, height: 35000000000 }
    const escala = calcularEscalaMedida(f)
    const w = Math.max(1, Math.round(f.width * escala))
    const h = Math.max(1, Math.round(f.height * escala))
    expect(w).toBeLessThanOrEqual(1600)
    expect(w * h).toBeLessThanOrEqual(2000000)
  })

  test("desbordamiento aritmético a Infinity (1e200 x 1e200): no colapsa ni devuelve 1", () => {
    window.innerWidth = 412
    const escala = calcularEscalaMedida({ width: 1e200, height: 1e200 })
    expect(calcularEscalaMedida({ width: 1e200, height: 1e200 })).toBeGreaterThan(0)
    expect(calcularEscalaMedida({ width: 1e200, height: 1e200 })).toBeLessThan(1)
    const effW = Math.max(1, Math.round(1e200 * escala))
    const effH = Math.max(1, Math.round(1e200 * escala))
    expect(effW).toBeLessThanOrEqual(1600)
    expect(effW * effH).toBeLessThanOrEqual(2000000)
  })

  test("retorna 0 ante dimensiones inválidas, nulas, vacías, negativas, NaN o Infinity", () => {
    expect(calcularEscalaMedida(null)).toBe(0)
    expect(calcularEscalaMedida(undefined)).toBe(0)
    expect(calcularEscalaMedida({})).toBe(0)
    expect(calcularEscalaMedida({ width: 0, height: 0 })).toBe(0)
    expect(calcularEscalaMedida({ width: -500, height: 1000 })).toBe(0)
    expect(calcularEscalaMedida({ width: 1000, height: -500 })).toBe(0)
    expect(calcularEscalaMedida({ width: NaN, height: 1000 })).toBe(0)
    expect(calcularEscalaMedida({ width: 1000, height: NaN })).toBe(0)
    expect(calcularEscalaMedida({ width: Infinity, height: 1000 })).toBe(0)
    expect(calcularEscalaMedida({ width: 1000, height: Infinity })).toBe(0)
    // Sin coerción de tipos (booleanos, cadenas, símbolos)
    expect(calcularEscalaMedida({ width: true, height: 1000 })).toBe(0)
    expect(calcularEscalaMedida({ width: 1000, height: true })).toBe(0)
    expect(calcularEscalaMedida({ width: "1000", height: 1000 })).toBe(0)
    expect(calcularEscalaMedida({ width: 1000, height: "1000" })).toBe(0)
    expect(calcularEscalaMedida({ width: Symbol("invalido"), height: 1000 })).toBe(0)
    expect(calcularEscalaMedida({ width: 1000, height: Symbol("invalido") })).toBe(0)
    expect(calcularEscalaMedida({ width: {}, height: 1000 })).toBe(0)
    expect(calcularEscalaMedida({ width: 1000, height: {} })).toBe(0)
    expect(calcularEscalaMedida({ width: [], height: 1000 })).toBe(0)
    expect(calcularEscalaMedida({ width: 1000, height: [] })).toBe(0)
  })
})

describe("ciclo de vida y limpieza de recursos (recortarMapa y rasterizarParaMedir)", () => {
  let createdCanvases = []
  let mock2d
  const origCreateElement = document.createElement.bind(document)
  let getContextSpy

  beforeEach(() => {
    createdCanvases = []
    jest.spyOn(document, "createElement").mockImplementation((tag) => {
      const el = origCreateElement(tag)
      if (tag === "canvas") createdCanvases.push(el)
      return el
    })

    mock2d = {
      fillStyle: "",
      fillRect: jest.fn(),
      drawImage: jest.fn(),
      getImageData: jest.fn((x, y, w, h) => {
        const total = (w || 100) * (h || 100)
        const arr = new Uint8ClampedArray(total * 4)
        for (let i = 0; i < total * 4; i += 4) {
          arr[i] = 100     // R oscuro (< 235)
          arr[i + 1] = 100 // G oscuro (< 235)
          arr[i + 2] = 100 // B oscuro (< 235)
          arr[i + 3] = 255 // A opaco (> 128)
        }
        return { data: arr }
      }),
      isContextLost: jest.fn(() => false),
    }

    getContextSpy = jest.spyOn(HTMLCanvasElement.prototype, "getContext").mockImplementation((tipo) => {
      if (tipo === "2d") return mock2d
      return null
    })
  })

  afterEach(() => {
    document.createElement.mockRestore?.()
    getContextSpy?.mockRestore?.()
  })

  const mockGeo = {
    frame: { left: 100, right: 900, top: 100, bottom: 700 },
  }

  test("recortarMapa: ante excepción síncrona reduce el lienzo a 1x1", async () => {
    const mockPagina = {
      getViewport: jest.fn(() => ({ width: 800, height: 600 })),
      render: jest.fn(),
    }
    // Forzar fallo síncrono al obtener contexto 2D
    getContextSpy.mockImplementation((tipo) => (tipo === "2d" ? null : null))

    await expect(recortarMapa(mockPagina, mockGeo, 1)).rejects.toThrow("No se pudo inicializar el lienzo")
    const mapaCanvas = createdCanvases[createdCanvases.length - 1]
    expect(mapaCanvas.width).toBe(1)
    expect(mapaCanvas.height).toBe(1)
  })

  test("recortarMapa: ante inicio síncrono con RenderingCancelledException lanza AbortError y retira listener", async () => {
    const controller = new AbortController()
    const removeListenerSpy = jest.spyOn(controller.signal, "removeEventListener")
    const mockPagina = {
      getViewport: jest.fn(() => ({ width: 800, height: 600 })),
      render: jest.fn(() => {
        throw Object.assign(new Error("Cancelled synchronously"), { name: "RenderingCancelledException" })
      }),
    }

    await expect(recortarMapa(mockPagina, mockGeo, 1, { signal: controller.signal })).rejects.toThrow(
      expect.objectContaining({ name: "AbortError" }),
    )
    expect(removeListenerSpy).toHaveBeenCalledWith("abort", expect.any(Function))
    const mapaCanvas = createdCanvases[createdCanvases.length - 1]
    expect(mapaCanvas.width).toBe(1)
    expect(mapaCanvas.height).toBe(1)
  })

  test("recortarMapa: ante rechazo del render reduce el lienzo a 1x1", async () => {
    const mockPagina = {
      getViewport: jest.fn(() => ({ width: 800, height: 600 })),
      render: jest.fn(() => ({
        promise: Promise.reject(new Error("Error GPU renderTask")),
        cancel: jest.fn(),
      })),
    }

    await expect(recortarMapa(mockPagina, mockGeo, 1)).rejects.toThrow("Error GPU renderTask")
    const mapaCanvas = createdCanvases[createdCanvases.length - 1]
    expect(mapaCanvas.width).toBe(1)
    expect(mapaCanvas.height).toBe(1)
  })

  test("recortarMapa: ante aborto durante el render cancela tarea, retira listener y reduce lienzo a 1x1", async () => {
    const controller = new AbortController()
    const addListenerSpy = jest.spyOn(controller.signal, "addEventListener")
    const removeListenerSpy = jest.spyOn(controller.signal, "removeEventListener")

    const mockCancel = jest.fn()
    let rejectRender
    const mockPagina = {
      getViewport: jest.fn(() => ({ width: 800, height: 600 })),
      render: jest.fn(() => ({
        promise: new Promise((_, reject) => {
          rejectRender = reject
        }),
        cancel: mockCancel,
      })),
    }

    const promesa = recortarMapa(mockPagina, mockGeo, 1, { signal: controller.signal })
    expect(addListenerSpy).toHaveBeenCalledWith("abort", expect.any(Function), { once: true })

    // Disparar aborto durante el render
    controller.abort()
    expect(mockCancel).toHaveBeenCalled()
    rejectRender(new Error("Rendering cancelled"))

    await expect(promesa).rejects.toThrow(expect.objectContaining({ name: "AbortError" }))
    expect(removeListenerSpy).toHaveBeenCalledWith("abort", expect.any(Function))
    const mapaCanvas = createdCanvases[createdCanvases.length - 1]
    expect(mapaCanvas.width).toBe(1)
    expect(mapaCanvas.height).toBe(1)
  })

  test("recortarMapa: en render exitoso retira listener de aborto y preserva dimensiones", async () => {
    const controller = new AbortController()
    const removeListenerSpy = jest.spyOn(controller.signal, "removeEventListener")

    const mockPagina = {
      getViewport: jest.fn(() => ({ width: 800, height: 600 })),
      render: jest.fn(() => ({
        promise: Promise.resolve(),
        cancel: jest.fn(),
      })),
    }

    const res = await recortarMapa(mockPagina, mockGeo, 1, { signal: controller.signal })
    expect(removeListenerSpy).toHaveBeenCalledWith("abort", expect.any(Function))
    expect(res.canvas.width).toBeGreaterThan(1)
    expect(res.canvas.height).toBeGreaterThan(1)
  })

  test("rasterizarParaMedir: rechaza escala no válida antes de tocar lienzo", async () => {
    const mockPagina = { getViewport: jest.fn() }
    await expect(rasterizarParaMedir(mockPagina, 0)).rejects.toThrow("Escala de rasterización no válida.")
    await expect(rasterizarParaMedir(mockPagina, -1)).rejects.toThrow("Escala de rasterización no válida.")
    await expect(rasterizarParaMedir(mockPagina, NaN)).rejects.toThrow("Escala de rasterización no válida.")
    expect(createdCanvases.length).toBe(0)
  })

  test("rasterizarParaMedir: ante inicio síncrono con RenderingCancelledException lanza AbortError y retira listener", async () => {
    const controller = new AbortController()
    const removeListenerSpy = jest.spyOn(controller.signal, "removeEventListener")
    const mockPagina = {
      getViewport: jest.fn(() => ({ width: 400, height: 300 })),
      render: jest.fn(() => {
        throw Object.assign(new Error("Cancelled synchronously"), { name: "RenderingCancelledException" })
      }),
    }

    await expect(rasterizarParaMedir(mockPagina, 1, controller.signal)).rejects.toThrow(
      expect.objectContaining({ name: "AbortError" }),
    )
    expect(removeListenerSpy).toHaveBeenCalledWith("abort", expect.any(Function))
    expect(createdCanvases.length).toBe(1)
    expect(createdCanvases[0].width).toBe(1)
    expect(createdCanvases[0].height).toBe(1)
  })

  test("rasterizarParaMedir: ante aborto en vuelo cancela tarea, retira listener y reduce lienzo a 1x1", async () => {
    const controller = new AbortController()
    const addListenerSpy = jest.spyOn(controller.signal, "addEventListener")
    const removeListenerSpy = jest.spyOn(controller.signal, "removeEventListener")

    const mockCancel = jest.fn()
    let rejectRender
    const mockPagina = {
      getViewport: jest.fn(() => ({ width: 400, height: 300 })),
      render: jest.fn(() => ({
        promise: new Promise((_, reject) => {
          rejectRender = reject
        }),
        cancel: mockCancel,
      })),
    }

    const promesa = rasterizarParaMedir(mockPagina, 1, controller.signal)
    expect(addListenerSpy).toHaveBeenCalledWith("abort", expect.any(Function), { once: true })

    controller.abort()
    expect(mockCancel).toHaveBeenCalled()
    rejectRender(new Error("Rendering cancelled"))

    await expect(promesa).rejects.toThrow(expect.objectContaining({ name: "AbortError" }))
    expect(removeListenerSpy).toHaveBeenCalledWith("abort", expect.any(Function))
    expect(createdCanvases.length).toBe(1)
    expect(createdCanvases[0].width).toBe(1)
    expect(createdCanvases[0].height).toBe(1)
  })

  test("rasterizarParaMedir: ante fallo asíncrono en render siempre reduce lienzo a 1x1 y retira listener", async () => {
    const controller = new AbortController()
    const removeListenerSpy = jest.spyOn(controller.signal, "removeEventListener")

    const mockPagina = {
      getViewport: jest.fn(() => ({ width: 400, height: 300 })),
      render: jest.fn(() => ({
        promise: Promise.reject(new Error("Fallo de rasterizado")),
        cancel: jest.fn(),
      })),
    }

    await expect(rasterizarParaMedir(mockPagina, 1, controller.signal)).rejects.toThrow("Fallo de rasterizado")
    expect(removeListenerSpy).toHaveBeenCalledWith("abort", expect.any(Function))
    expect(createdCanvases.length).toBe(1)
    expect(createdCanvases[0].width).toBe(1)
    expect(createdCanvases[0].height).toBe(1)
  })

  test("rasterizarParaMedir: en render exitoso retira listener y preserva canvas para recorte", async () => {
    const controller = new AbortController()
    const removeListenerSpy = jest.spyOn(controller.signal, "removeEventListener")

    const mockPagina = {
      getViewport: jest.fn(() => ({
        width: 400,
        height: 300,
        convertToViewportPoint: jest.fn((x, y) => [x, y]),
      })),
      render: jest.fn(() => ({
        promise: Promise.resolve(),
        cancel: jest.fn(),
      })),
    }

    const resultado = await rasterizarParaMedir(mockPagina, 1, controller.signal)
    expect(resultado.ancho).toBe(400)
    expect(resultado.alto).toBe(300)
    expect(resultado.canvas).toBeDefined()
    expect(removeListenerSpy).toHaveBeenCalledWith("abort", expect.any(Function))
    expect(createdCanvases.length).toBe(1)
    expect(createdCanvases[0].width).toBe(400)
    expect(createdCanvases[0].height).toBe(300)
  })

  test("recortarMapa: en móvil con canvasMedida realiza recorte directo 2D sin llamar a pagina.render", async () => {
    window.innerWidth = 390
    const mockPagina = {
      getViewport: jest.fn(),
      render: jest.fn(),
    }
    const mockCanvas = { width: 1000, height: 800 }
    const geo = {
      frame: { left: 100, right: 600, top: 150, bottom: 550 },
    }
    const res = await recortarMapa(mockPagina, geo, 0.5, { canvasMedida: mockCanvas })
    expect(mockPagina.render).not.toHaveBeenCalled()
    expect(res.canvas.width).toBe(500)
    expect(res.canvas.height).toBe(400)
    expect(res.escala).toBe(0.5)
  })
})

describe("prepararPlancha ciclo de vida y validación", () => {
  test("aborta de inmediato sin colgar si la señal ya estaba cancelada", async () => {
    const control = new AbortController()
    control.abort()
    await expect(prepararPlancha(new ArrayBuffer(10), [0, 0], { signal: control.signal })).rejects.toThrow(
      expect.objectContaining({ name: "AbortError" }),
    )
  })

  test("si las dimensiones del PDF son inválidas, devuelve lienzo-fallido de inmediato sin rasterizar ni crear lienzos", async () => {
    let created = 0
    const origCreate = document.createElement.bind(document)
    jest.spyOn(document, "createElement").mockImplementation((tag) => {
      if (tag === "canvas") created++
      return origCreate(tag)
    })

    const mockDestroy = jest.fn().mockResolvedValue()
    const mockRender = jest.fn()
    const mockGetPage = jest.fn().mockResolvedValue({
      getViewport: () => ({ width: 0, height: 0 }),
      render: mockRender,
    })

    pdfjs.getDocument.mockReturnValueOnce({
      promise: Promise.resolve({
        getPage: mockGetPage,
        destroy: mockDestroy,
      }),
    })

    const resultado = await prepararPlancha(new ArrayBuffer(10), [0, 0])
    expect(resultado.ok).toBe(false)
    expect(resultado.reason).toBe("lienzo-fallido")
    expect(resultado.detail).toMatch(/dimensiones/i)
    expect(mockRender).not.toHaveBeenCalled()
    expect(mockDestroy).toHaveBeenCalled()
    expect(created).toBe(0)
    document.createElement.mockRestore()
  })
})

describe("anchoMaximoDeTextura", () => {
  let getContextSpy

  beforeEach(() => {
    getContextSpy = jest.spyOn(HTMLCanvasElement.prototype, "getContext")
  })

  afterEach(() => {
    getContextSpy.mockRestore()
  })

  test("en móvil limita a 2048 px independientemente del tope de GPU", () => {
    window.innerWidth = 412
    const mockGl = {
      MAX_TEXTURE_SIZE: 3379,
      getParameter: jest.fn(() => 8192),
      getExtension: jest.fn(() => ({ loseContext: jest.fn() })),
    }
    getContextSpy.mockImplementation((tipo) => (tipo === "webgl2" ? mockGl : null))

    expect(anchoMaximoDeTextura(4096)).toBe(2048)
  })

  test("en escritorio consulta el límite WebGL real de la GPU", () => {
    window.innerWidth = 1280
    const mockLoseContext = jest.fn()
    const mockGl = {
      MAX_TEXTURE_SIZE: 3379,
      getParameter: jest.fn(() => 8192),
      getExtension: jest.fn((ext) => (ext === "WEBGL_lose_context" ? { loseContext: mockLoseContext } : null)),
    }
    getContextSpy.mockImplementation((tipo) => (tipo === "webgl2" ? mockGl : null))

    expect(anchoMaximoDeTextura(4096)).toBe(4096)
    expect(anchoMaximoDeTextura(16384)).toBe(8192)
    expect(mockGl.getParameter).toHaveBeenCalledWith(3379)
    expect(mockLoseContext).toHaveBeenCalled()
  })

  test("si WebGL falla o no está disponible, usa el tope por defecto", () => {
    window.innerWidth = 1280
    getContextSpy.mockImplementation(() => null)
    expect(anchoMaximoDeTextura(4096)).toBe(4096)
  })
})
