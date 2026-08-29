import {
  PANEL_HEIGHT_DEFAULT,
  PANEL_HEIGHT_MAX,
  PANEL_HEIGHT_MIN,
  PANEL_WIDTH_DEFAULT,
  PANEL_WIDTH_MAX,
  PANEL_WIDTH_MIN,
  clampPanelHeight,
  clampPanelWidth,
  heightFromPointer,
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
    // El panel existe para operar sobre el mapa: sin mapa no hay sobre qué.
    expect(clampPanelWidth(4000)).toBe(PANEL_WIDTH_MAX)
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
    expect(widthFromPointer(700, 300)).toBe(400)
    expect(widthFromPointer(1200, 300)).toBe(PANEL_WIDTH_MAX)
    expect(widthFromPointer(310, 300)).toBe(PANEL_WIDTH_MIN)
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
