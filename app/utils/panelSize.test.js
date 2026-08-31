import {
  PANEL_HEIGHT_DEFAULT,
  PANEL_HEIGHT_MAX,
  PANEL_HEIGHT_MIN,
  PANEL_WIDTH_CEILING,
  PANEL_WIDTH_DEFAULT,
  PANEL_WIDTH_MIN,
  clampPanelHeight,
  clampPanelWidth,
  fitPanelToViewport,
  heightFromPointer,
  panelWidthMax,
  widthFromPointer,
} from "./panelSize"

/**
 * El panel se puede agrandar arrastrando el borde porque con un departamento
 * desplegado la lista no cabe en los 350 px de fábrica y los nombres se cortan.
 * Lo que se prueba aquí son los topes, que es lo único que puede dejar el visor
 * inservible: un panel de 40 px no se puede usar, y uno de 2000 no deja mapa.
 */

describe("los topes del ancho", () => {
  it("no baja de lo que necesita una fila para no pisarse", () => {
    // Nombre, barra de opacidad e interruptor en la misma línea.
    expect(clampPanelWidth(10)).toBe(PANEL_WIDTH_MIN)
    expect(clampPanelWidth(-500)).toBe(PANEL_WIDTH_MIN)
  })

  it("ni se come el mapa entero", () => {
    // El panel existe para operar sobre el mapa: sin mapa no hay sobre qué. Como
    // mucho, la mitad de lo que haya.
    expect(clampPanelWidth(4000, 1440)).toBe(720)
    expect(clampPanelWidth(4000, 2560)).toBe(1100)
  })

  it("el tope se mide contra la pantalla, no con un número escrito a mano", () => {
    // Estaba fijo en 620 px: bastante en un portátil y un tercio de pantalla en
    // un monitor grande, donde la lista seguía cortando los nombres y no había
    // forma de ensancharla más.
    expect(panelWidthMax(1366)).toBe(683)
    expect(panelWidthMax(2560)).toBe(PANEL_WIDTH_CEILING)
  })

  it("en una pantalla estrecha manda el mínimo", () => {
    // La mitad de un teléfono se queda por debajo de lo que necesita una fila
    // para no pisarse. Antes que un panel inservible, uno que asome.
    expect(panelWidthMax(390)).toBe(PANEL_WIDTH_MIN)
  })

  it("sin ventana que medir se usa el techo absoluto", () => {
    // Es el caso del servidor de Next generando la página: acotar contra una
    // ventana inventada guardaría un valor falso.
    expect(panelWidthMax(undefined)).toBe(PANEL_WIDTH_CEILING)
    expect(panelWidthMax(0)).toBe(PANEL_WIDTH_CEILING)
  })

  it("un valor sin sentido cae en el de fábrica, no en cero", () => {
    // Esto llega de lo guardado en el navegador, que puede ser cualquier cosa.
    expect(clampPanelWidth(undefined)).toBe(PANEL_WIDTH_DEFAULT)
    expect(clampPanelWidth("ancho")).toBe(PANEL_WIDTH_DEFAULT)
    expect(clampPanelWidth(NaN)).toBe(PANEL_WIDTH_DEFAULT)
  })
})

describe("los topes del alto", () => {
  it("van en fracción de pantalla y no en píxeles", () => {
    // Un panel de 700 px cabe en un monitor y se sale de un portátil. Guardando
    // la fracción, el mismo ajuste vale en las dos.
    expect(clampPanelHeight(2)).toBe(PANEL_HEIGHT_MAX)
    expect(clampPanelHeight(0.01)).toBe(PANEL_HEIGHT_MIN)
    expect(clampPanelHeight(null)).toBe(PANEL_HEIGHT_DEFAULT)
  })
})

describe("arrastrar el borde", () => {
  it("el ancho sale de dónde está el ratón, no de cuánto se ha movido", () => {
    // Con el desplazamiento acumulado, salirse de los topes y volver deja el
    // borde a medio camino del ratón y hay que soltar y volver a agarrar.
    expect(widthFromPointer(700, 300, 1440)).toBe(400)
    expect(widthFromPointer(4000, 300, 1440)).toBe(panelWidthMax(1440))
    expect(widthFromPointer(310, 300, 1440)).toBe(PANEL_WIDTH_MIN)
  })

  it("y el alto igual, medido contra la altura de la ventana", () => {
    expect(heightFromPointer(500, 100, 1000)).toBeCloseTo(0.4, 5)
    expect(heightFromPointer(990, 0, 1000)).toBe(PANEL_HEIGHT_MAX)
  })

  it("sin ventana que medir, el alto de fábrica", () => {
    // Pasa en el primer render del servidor, donde no hay `window`.
    expect(heightFromPointer(500, 0, 0)).toBe(PANEL_HEIGHT_DEFAULT)
  })
})

describe("el tamaño guardado, contra la pantalla de hoy", () => {
  it("encoge lo que no cabe en esta ventana", () => {
    // Un panel ajustado a gusto en un monitor de 2.560 px se abría igual de
    // ancho en el portátil de 1.366 y tapaba el mapa entero. El tamaño se
    // recuerda entre visitas, pero la pantalla no tiene por qué ser la misma.
    expect(fitPanelToViewport({ width: 1000, height: 0.9 }, 1366).width).toBe(683)
  })

  it("y deja en paz lo que sí cabe", () => {
    expect(fitPanelToViewport({ width: 400, height: 0.9 }, 1440)).toEqual({
      width: 400,
      height: 0.9,
    })
  })

  it("un tamaño corrupto cae en el de fábrica", () => {
    expect(fitPanelToViewport({ width: null, height: "alto" }, 1440)).toEqual({
      width: PANEL_WIDTH_DEFAULT,
      height: PANEL_HEIGHT_DEFAULT,
    })
  })
})
