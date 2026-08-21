import {
  buildMapFilter,
  collectFilterOptions,
  countMatching,
  hasActiveFilters,
} from "./layerFilters"

// Atributos con la forma que devuelven los servicios de la ANM, incluida la
// diferencia de nombres entre capas: unas dicen TITULO_ESTADO y otras ESTADO.
const FIGURAS = [
  { TITULO_ESTADO: "Vigente", MODALIDAD: "Contrato de concesión", ETAPA: "Explotación", CLASIFICACION_MINERIA: "Mediana", AREA_HA: 120 },
  { TITULO_ESTADO: "Vigente", MODALIDAD: "Contrato de concesión", ETAPA: "Exploración", CLASIFICACION_MINERIA: "Pequeña", AREA_HA: 45.5 },
  { ESTADO: "Terminado", MODALIDAD: "Licencia de explotación", ETAPA: "Explotación", CLASIFICACION_MINERIA: "Pequeña", AREA_HA: 900 },
  { STATUS: "Vigente", MODALIDAD: "Aporte", AREA_HA: "300" },
]

describe("collectFilterOptions", () => {
  it("saca las opciones de los datos y no de una lista escrita a mano", () => {
    const { values } = collectFilterOptions(FIGURAS)
    expect(values.modalidad).toEqual(["Aporte", "Contrato de concesión", "Licencia de explotación"])
    expect(values.etapa).toEqual(["Exploración", "Explotación"])
  })

  it("reúne el estado aunque cada capa lo llame distinto", () => {
    // TITULO_ESTADO, ESTADO y STATUS son el mismo dato con tres nombres. Sin los
    // respaldos, el desplegable ofrecería tres listas incompletas.
    const { values } = collectFilterOptions(FIGURAS)
    expect(values.estado).toEqual(["Terminado", "Vigente"])
  })

  it("ignora los campos que faltan en vez de meter huecos en la lista", () => {
    const { values } = collectFilterOptions(FIGURAS)
    expect(values.clasificacion).toEqual(["Mediana", "Pequeña"])
    expect(values.clasificacion).not.toContain(null)
  })

  it("mide el rango de áreas, leyendo también las que vienen como texto", () => {
    expect(collectFilterOptions(FIGURAS).area).toEqual({ min: 45.5, max: 900 })
  })

  it("no revienta sin datos", () => {
    expect(collectFilterOptions([]).area).toBeNull()
    expect(collectFilterOptions(null).values.etapa).toEqual([])
  })
})

describe("buildMapFilter", () => {
  it("no filtra nada cuando no hay nada elegido", () => {
    expect(buildMapFilter({}, null)).toBeNull()
    expect(buildMapFilter({ etapa: [] }, null)).toBeNull()
    expect(hasActiveFilters({}, null)).toBe(false)
  })

  it("arma una condición por un solo campo", () => {
    expect(buildMapFilter({ etapa: ["Explotación"] })).toEqual([
      "match",
      ["get", "ETAPA"],
      ["Explotación"],
      true,
      false,
    ])
  })

  it("lee el estado con sus respaldos", () => {
    expect(buildMapFilter({ estado: ["Vigente"] })).toEqual([
      "match",
      ["coalesce", ["get", "TITULO_ESTADO"], ["get", "STATUS"], ["get", "ESTADO"]],
      ["Vigente"],
      true,
      false,
    ])
  })

  it("junta varios campos con un all", () => {
    const filtro = buildMapFilter({ etapa: ["Explotación"], modalidad: ["Aporte"] })
    expect(filtro[0]).toBe("all")
    expect(filtro).toHaveLength(3)
  })

  it("convierte el área a número antes de comparar", () => {
    // Hay capas que devuelven el área como texto; comparar "300" con 100 da
    // siempre falso y el filtro escondería figuras que sí cumplen.
    const filtro = buildMapFilter({}, { min: 100, max: 500 })
    expect(filtro).toEqual([
      "all",
      [">=", ["to-number", ["get", "AREA_HA"]], 100],
      ["<=", ["to-number", ["get", "AREA_HA"]], 500],
    ])
  })
})

describe("countMatching", () => {
  it("cuenta lo que pasa un filtro de un campo", () => {
    expect(countMatching(FIGURAS, { estado: ["Vigente"] })).toBe(3)
  })

  it("acumula condiciones", () => {
    expect(countMatching(FIGURAS, { estado: ["Vigente"], etapa: ["Explotación"] })).toBe(1)
  })

  it("cuenta por área, con el texto convertido", () => {
    expect(countMatching(FIGURAS, {}, { min: 100, max: 1000 })).toBe(3)
  })

  it("descarta las que no traen el área cuando se filtra por ella", () => {
    const sinArea = [...FIGURAS, { TITULO_ESTADO: "Vigente" }]
    expect(countMatching(sinArea, {}, { min: 0, max: 10000 })).toBe(4)
  })

  it("sin filtros las cuenta todas", () => {
    expect(countMatching(FIGURAS, {}, null)).toBe(FIGURAS.length)
  })
})

describe("buildWhereClause", () => {
  it("no pide nada cuando no hay filtros", () => {
    const { buildWhereClause } = require("./layerFilters")
    expect(buildWhereClause({}, null)).toBeNull()
    expect(buildWhereClause({ etapa: [] }, null)).toBeNull()
  })

  it("traduce un campo a un IN", () => {
    const { buildWhereClause } = require("./layerFilters")
    expect(buildWhereClause({ etapa: ["Explotación", "Exploración"] })).toBe(
      "ETAPA IN ('Explotación', 'Exploración')",
    )
  })

  it("convierte el respaldo entre nombres en un OR", () => {
    // Una capa que no tenga TITULO_ESTADO puede tener ESTADO: preguntar solo por
    // el primero devolvería cero en esa capa sin decir por qué.
    const { buildWhereClause } = require("./layerFilters")
    expect(buildWhereClause({ estado: ["Vigente"] })).toBe(
      "(TITULO_ESTADO IN ('Vigente') OR STATUS IN ('Vigente') OR ESTADO IN ('Vigente'))",
    )
  })

  it("escapa las comillas del valor", () => {
    // Un valor con apóstrofo cerraría la cadena y rompería la consulta.
    const { buildWhereClause } = require("./layerFilters")
    expect(buildWhereClause({ modalidad: ["O'Brien"] })).toBe("MODALIDAD IN ('O''Brien')")
  })

  it("junta campos y área con AND", () => {
    const { buildWhereClause } = require("./layerFilters")
    expect(buildWhereClause({ etapa: ["Explotación"] }, { min: 100, max: 500 })).toBe(
      "ETAPA IN ('Explotación') AND AREA_HA >= 100 AND AREA_HA <= 500",
    )
  })
})
