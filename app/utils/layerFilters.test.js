import {
  buildMapFilter,
  buildWhereClause,
  collectFilterOptions,
  countMatching,
  hasActiveFilters,
  matchesFilters,
  NO_MATCHES,
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

  // Los nombres de campo que lee una expresión, en orden. Se comprueba esto y
  // no la forma literal: cada campo va envuelto en un `case` que trata la
  // cadena vacía como ausente (ver `readExpression`), y escribir ese anidamiento
  // en cada expectativa haría la prueba ilegible sin comprobar nada más.
  const camposLeidos = (expresion) => {
    const encontrados = []
    const recorrer = (nodo) => {
      if (!Array.isArray(nodo)) return
      if (nodo[0] === "get" && typeof nodo[1] === "string") {
        if (!encontrados.includes(nodo[1])) encontrados.push(nodo[1])
        return
      }
      nodo.forEach(recorrer)
    }
    recorrer(expresion)
    return encontrados
  }

  it("arma una condición por un solo campo", () => {
    const filtro = buildMapFilter({ etapa: ["Explotación"] })
    expect(filtro[0]).toBe("match")
    expect(camposLeidos(filtro[1])).toEqual(["ETAPA"])
    expect(filtro.slice(2)).toEqual([["Explotación"], true, false])
  })

  it("lee el estado con sus respaldos, en orden", () => {
    const filtro = buildMapFilter({ estado: ["Vigente"] })
    expect(filtro[1][0]).toBe("coalesce")
    expect(camposLeidos(filtro[1])).toEqual(["TITULO_ESTADO", "STATUS", "ESTADO"])
  })

  it("trata la cadena vacía como campo ausente, igual que el conteo", () => {
    // ArcGIS devuelve "" —no null— en un campo de texto sin dato, y `coalesce`
    // solo se salta null. Sin el envoltorio, un título con TITULO_ESTADO vacío y
    // ESTADO con valor lo escondía el mapa mientras `matchesFilters` lo contaba:
    // el panel decía un número y el mapa enseñaba otro.
    const props = { TITULO_ESTADO: "", ESTADO: "Vigente" }
    expect(matchesFilters(props, { estado: ["Vigente"] })).toBe(true)

    const lectura = buildMapFilter({ estado: ["Vigente"] })[1]
    // El respaldo del final impide que `match` reciba null, que sí revienta la
    // expresión entera en vez de limitarse a no coincidir.
    expect(lectura[lectura.length - 1]).toBe("")
    expect(JSON.stringify(lectura)).toContain('"case"')
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

  // La razón de ser del tercer parámetro: nombrar un campo que la capa no tiene
  // hace que ArcGIS responda HTTP 200 con un cuerpo de error —la trampa nº 2—, y
  // el visor sacaba el banner rojo al filtrar por estado en "toda la capa".
  describe("con los campos que la capa declara", () => {
    it("pregunta solo por los que existen", () => {
      expect(buildWhereClause({ estado: ["Vigente"] }, null, new Set(["ESTADO", "AREA_HA"]))).toBe(
        "ESTADO IN ('Vigente')",
      )
    })

    it("mantiene el OR cuando la capa tiene varios de los nombres", () => {
      expect(
        buildWhereClause({ estado: ["Vigente"] }, null, new Set(["TITULO_ESTADO", "STATUS"])),
      ).toBe("(TITULO_ESTADO IN ('Vigente') OR STATUS IN ('Vigente'))")
    })

    it("no distingue mayúsculas al comparar nombres de campo", () => {
      // ArcGIS no las distingue, ni al declarar ni al consultar: una capa que
      // publique `Estado` no debe quedarse fuera del filtro por una letra, y
      // preguntarle por `ESTADO` le sirve igual.
      expect(buildWhereClause({ estado: ["Vigente"] }, null, new Set(["Estado"]))).toBe(
        "ESTADO IN ('Vigente')",
      )
    })

    it("pide cero resultados si la capa no puede cumplir el filtro", () => {
      // Callar la condición devolvería la capa entera: enseñar como resultado
      // filtrado lo que no se ha filtrado es peor que no devolver nada.
      expect(buildWhereClause({ estado: ["Vigente"] }, null, new Set(["OBJECTID"]))).toBe(NO_MATCHES)
      expect(buildWhereClause({}, { min: 10, max: 20 }, new Set(["OBJECTID"]))).toBe(NO_MATCHES)
    })

    it("sin filtro no pide nada, aunque a la capa le falten campos", () => {
      expect(buildWhereClause({}, null, new Set(["OBJECTID"]))).toBeNull()
    })

    it("sin campos conocidos se comporta como antes", () => {
      // Si la petición de metadatos no llega, el peor caso es el de siempre; no
      // se deja de filtrar por no haber podido preguntar.
      expect(buildWhereClause({ etapa: ["Explotación"] }, null, null)).toBe(
        "ETAPA IN ('Explotación')",
      )
    })
  })
})
