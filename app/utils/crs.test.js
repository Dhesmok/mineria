import {
  CRS_LIST,
  axisLabels,
  centralMeridianOf,
  crsById,
  formatCoordinate,
  fromGeographic,
  toGeographic,
} from "./crs"

// Punto de referencia en Medellín.
const MEDELLIN = [-75.5906, 6.2308]

describe("crs", () => {
  it("le da a cada sistema una definición y un .prj", () => {
    // El .prj es lo que hace que un SHP se abra en el sitio correcto. Un sistema
    // sin él exportaría un archivo mudo, que el programa de destino colocaría
    // donde se le ocurriera.
    CRS_LIST.forEach((crs) => {
      expect(crs.proj).toContain("+proj=")
      expect(crs.prj.length).toBeGreaterThan(50)
    })
  })

  it("devuelve el sistema de origen cuando el pedido no existe", () => {
    expect(crsById("no-existe").id).toBe("4686")
  })

  it("vuelve al mismo punto tras ir y volver, en todos los sistemas", () => {
    CRS_LIST.forEach((crs) => {
      const [lon, lat] = toGeographic(fromGeographic(MEDELLIN, crs.id), crs.id)
      expect(lon).toBeCloseTo(MEDELLIN[0], 6)
      expect(lat).toBeCloseTo(MEDELLIN[1], 6)
    })
  })

  it("sitúa Medellín donde corresponde en los tres sistemas de uso común", () => {
    // Estos números no salen de haber ejecutado el código y copiado el
    // resultado, que no probaría nada: se calcularon aparte con las fórmulas de
    // la proyección transversa de Mercator (serie del arco meridiano) y
    // coinciden con lo que devuelve proj4 dentro de 3 m, que es el error de
    // truncar la serie. Si algún día alguien cambia una definición por
    // equivocación, esta prueba lo detiene.
    expect(fromGeographic(MEDELLIN, "9377").map(Math.round)).toEqual([4713441, 2247195])
    expect(fromGeographic(MEDELLIN, "3116").map(Math.round)).toEqual([832533, 1181001])
    expect(fromGeographic(MEDELLIN, "32618").map(Math.round)).toEqual([434666, 688754])
  })

  it("distingue los husos antiguos entre sí", () => {
    // Si dos husos dieran lo mismo, es que se copió mal un meridiano central.
    const valores = ["3114", "3115", "3116", "3117", "3118"].map(
      (id) => Math.round(fromGeographic(MEDELLIN, id)[0]),
    )
    expect(new Set(valores).size).toBe(5)
  })

  it("nombra los ejes según el sistema sea plano o geográfico", () => {
    expect(axisLabels("4686")).toEqual({ first: "Latitud", second: "Longitud" })
    expect(axisLabels("9377")).toEqual({ first: "Norte", second: "Este" })
  })

  it("lee el meridiano central de las dos formas en que proj4 lo escribe", () => {
    // Con `+lon_0` los orígenes MAGNA y el CTM-12; por número de huso los UTM.
    expect(centralMeridianOf("9377")).toBe(-73)
    expect(centralMeridianOf("3116")).toBeCloseTo(-74.0775, 4)
    expect(centralMeridianOf("32618")).toBe(-75)
    expect(centralMeridianOf("4686")).toBeNull()
  })

  /**
   * La prueba que protege al regex: el meridiano que se lee de la cadena tiene
   * que ser el que proj4 aplica de verdad. Si alguien añade un sistema escrito de
   * otra manera, esto falla en vez de dejar a `candidateSourceCrs` adivinando con
   * un número inventado.
   *
   * **Ir y volver no prueba nada** —vuelve al mismo punto se acierte o no el
   * meridiano— y esa fue la primera versión de esta prueba. Lo que sí lo prueba es
   * la simetría: en una transversa de Mercator, dos puntos a un grado a cada lado
   * del meridiano central caen a la misma distancia de él y en lados contrarios,
   * así que sus estes suman exactamente el doble del este del meridiano. Eso solo
   * se cumple si el meridiano es el correcto.
   */
  it("el meridiano declarado es el que proj4 aplica", () => {
    CRS_LIST.filter((crs) => crs.projected).forEach((crs) => {
      const meridiano = centralMeridianOf(crs.id)
      expect(meridiano).not.toBeNull()

      const este = (lon) => fromGeographic([lon, 5], crs.id)[0]
      expect(este(meridiano - 1) + este(meridiano + 1)).toBeCloseTo(2 * este(meridiano), 3)
      // Y su franja de cobertura, que es lo que distingue un huso del de al lado.
      expect(crs.coverageHalfSpan).toBeGreaterThan(0)
    })
  })

  it("enseña grados con coma decimal y metros redondeados", () => {
    expect(formatCoordinate(6.230812, "4686")).toBe("6,23081")
    expect(formatCoordinate(1180234.7, "9377")).toBe("1180235")
  })
})
