import { indexForPointer, moveItem, moveWithinSubset } from "./reorder"

describe("moveWithinSubset", () => {
  // "a", "c" y "e" están encendidas; "b" y "d", apagadas.
  const todas = ["a", "b", "c", "d", "e"]
  const activas = ["a", "c", "e"]

  it("mueve dentro del subconjunto sin tocar a los demás", () => {
    // "e" pasa a ser la primera activa: el resultado deja e, c, a en los huecos
    // que ocupaban las activas, y "b" y "d" siguen en el suyo.
    expect(moveWithinSubset(todas, activas, 2, 0)).toEqual(["e", "b", "a", "d", "c"])
  })

  it("las apagadas conservan su posición exacta", () => {
    const resultado = moveWithinSubset(todas, activas, 0, 2)
    expect(resultado[1]).toBe("b")
    expect(resultado[3]).toBe("d")
  })

  it("no cambia nada si no hay movimiento", () => {
    expect(moveWithinSubset(todas, activas, 1, 1)).toEqual(todas)
  })

  it("aguanta un subconjunto vacío", () => {
    expect(moveWithinSubset(todas, [], 0, 1)).toEqual(todas)
  })
})

describe("moveItem", () => {
  const lista = ["a", "b", "c", "d"]

  it("sube un elemento", () => {
    expect(moveItem(lista, 2, 0)).toEqual(["c", "a", "b", "d"])
  })

  it("baja un elemento", () => {
    // El caso donde es fácil equivocarse por uno: al quitar "a" primero, los
    // índices de lo que queda se corren.
    expect(moveItem(lista, 0, 2)).toEqual(["b", "c", "a", "d"])
  })

  it("lleva un elemento al final", () => {
    expect(moveItem(lista, 0, 3)).toEqual(["b", "c", "d", "a"])
  })

  it("no cambia nada si el destino es el origen", () => {
    expect(moveItem(lista, 1, 1)).toEqual(lista)
  })

  it("no modifica la lista original", () => {
    const original = [...lista]
    moveItem(lista, 0, 3)
    expect(lista).toEqual(original)
  })

  it("recorta un destino fuera de rango en vez de dejar huecos", () => {
    expect(moveItem(lista, 0, 99)).toEqual(["b", "c", "d", "a"])
    expect(moveItem(lista, 3, -5)).toEqual(["d", "a", "b", "c"])
  })

  it("ignora un origen que no existe", () => {
    expect(moveItem(lista, 9, 0)).toEqual(lista)
    expect(moveItem([], 0, 0)).toEqual([])
  })
})

describe("indexForPointer", () => {
  // Cuatro filas de 40 px, empezando en y = 100.
  const cajas = [
    { top: 100, height: 40 },
    { top: 140, height: 40 },
    { top: 180, height: 40 },
    { top: 220, height: 40 },
  ]

  it("da la primera posición por encima de todo", () => {
    expect(indexForPointer(0, cajas)).toBe(0)
    expect(indexForPointer(110, cajas)).toBe(0)
  })

  it("cambia de fila al pasar de la mitad, no del borde", () => {
    // 139 está en la primera fila pero ya pasada su mitad (120), así que el
    // destino es la segunda. Comparando contra el borde se quedaría en la
    // primera y el elemento nunca llegaría a moverse un solo puesto.
    expect(indexForPointer(139, cajas)).toBe(1)
    expect(indexForPointer(141, cajas)).toBe(1)
    expect(indexForPointer(161, cajas)).toBe(2)
  })

  it("da la última posición por debajo de todo", () => {
    expect(indexForPointer(9999, cajas)).toBe(3)
  })

  it("no revienta sin filas", () => {
    expect(indexForPointer(50, [])).toBe(0)
    expect(indexForPointer(50, null)).toBe(0)
  })
})
