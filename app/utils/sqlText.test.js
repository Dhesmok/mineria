import { escapeSqlText, likePrefixPattern, stripLikeWildcards } from "./sqlText"

describe("escapeSqlText", () => {
  it("dobla las comillas simples, que es como SQL las escribe", () => {
    expect(escapeSqlText("O'Brien")).toBe("O''Brien")
  })

  it("aguanta lo que no es texto", () => {
    expect(escapeSqlText(null)).toBe("")
    expect(escapeSqlText(undefined)).toBe("")
    expect(escapeSqlText(123)).toBe("123")
  })
})

describe("stripLikeWildcards", () => {
  it("quita los dos comodines de LIKE", () => {
    // En SQL, dentro de un LIKE, `%` es «lo que sea» y `_` es «un carácter
    // cualquiera». Un código de expediente no lleva ninguno de los dos.
    expect(stripLikeWildcards("A%B_C")).toBe("ABC")
  })

  it("no toca los guiones, que sí llevan los expedientes", () => {
    expect(stripLikeWildcards("TIT-104")).toBe("TIT-104")
  })
})

describe("likePrefixPattern", () => {
  it("arma el patrón de «empieza por» en mayúsculas", () => {
    expect(likePrefixPattern("abc", 3)).toBe("ABC%")
  })

  it("no consulta si el usuario solo escribió comodines", () => {
    // Este es el caso que motiva el módulo entero. «%%%» tiene tres caracteres,
    // así que pasaba el mínimo del buscador, y producía LIKE '%%%%': el barrido
    // del dataset nacional que ese mínimo existía para evitar.
    expect(likePrefixPattern("%%%", 3)).toBeNull()
    expect(likePrefixPattern("___", 3)).toBeNull()
    expect(likePrefixPattern("%_%", 3)).toBeNull()
  })

  it("tampoco si los comodines dejan el texto por debajo del mínimo", () => {
    // «AB%» son tres caracteres, pero solo dos de búsqueda.
    expect(likePrefixPattern("AB%", 3)).toBeNull()
  })

  it("con comodines de sobra, busca por lo que queda", () => {
    expect(likePrefixPattern("A%BC%D", 3)).toBe("ABCD%")
  })

  it("respeta el mínimo que se le pida", () => {
    expect(likePrefixPattern("AB", 3)).toBeNull()
    expect(likePrefixPattern("AB", 2)).toBe("AB%")
  })

  it("ignora los espacios de los extremos", () => {
    expect(likePrefixPattern("  tit-1  ", 3)).toBe("TIT-1%")
  })

  it("y sigue escapando las comillas", () => {
    // Quitar comodines no sustituye a escapar: son dos cosas distintas.
    expect(likePrefixPattern("O'BR", 3)).toBe("O''BR%")
  })

  it("no revienta con texto vacío", () => {
    expect(likePrefixPattern("", 3)).toBeNull()
    expect(likePrefixPattern(null, 3)).toBeNull()
  })
})
