import { permite, planchaPdfFrom } from "./planchaUrl"

/**
 * Esta ruta es la única del proyecto que acepta una dirección del cliente, y por
 * eso su lista de permitidos es lo que hay que probar: si se abre, el visor pasa
 * a ser un proxy con el que cualquiera puede pedir lo que quiera desde nuestro
 * dominio. Ver la cabecera de `route.js` para el porqué de que no pueda ser un
 * catálogo de claves, como sí lo es `/api/sgc`.
 */

describe("permite", () => {
  test("deja pasar el PDF de una plancha del SGC", () => {
    expect(permite("https://recordcenter.sgc.gov.co/B3/12011010024612/mapa/0101.pdf")).toBe(
      "https://recordcenter.sgc.gov.co/B3/12011010024612/mapa/0101.pdf",
    )
    expect(permite("https://www2.sgc.gov.co/publicaciones/planchas/146.PDF")).toBe(
      "https://www2.sgc.gov.co/publicaciones/planchas/146.PDF",
    )
  })

  test("no deja pasar otro dominio", () => {
    expect(permite("https://ejemplo.com/plancha.pdf")).toBeNull()
    // El caso que motiva comparar con el punto delante y no con `includes`.
    expect(permite("https://sgc.gov.co.atacante.com/plancha.pdf")).toBeNull()
  })

  test("no deja pasar lo que no es un PDF", () => {
    expect(permite("https://recordcenter.sgc.gov.co/algo")).toBeNull()
    expect(permite("https://recordcenter.sgc.gov.co/algo.exe")).toBeNull()
  })

  test("no deja pasar http ni otros esquemas", () => {
    expect(permite("http://recordcenter.sgc.gov.co/plancha.pdf")).toBeNull()
    expect(permite("file:///etc/passwd.pdf")).toBeNull()
    expect(permite("javascript:alert(1)")).toBeNull()
  })

  test("no deja pasar basura", () => {
    expect(permite("")).toBeNull()
    expect(permite(null)).toBeNull()
    expect(permite("no es una dirección")).toBeNull()
  })

  test("se lleva las credenciales y el fragmento", () => {
    // Lo que sale de nuestro servidor tiene que ser lo que aquí se validó, no la
    // cadena que llegó: un `usuario:clave@` en la dirección se iría con la
    // petición y quedaría en los registros del SGC a nombre nuestro.
    expect(permite("https://u:c@recordcenter.sgc.gov.co/a.pdf#x")).toBe(
      "https://recordcenter.sgc.gov.co/a.pdf",
    )
  })

  test("un dominio .gov.co que no sea del SGC vale solo si es un PDF", () => {
    expect(permite("https://www.igac.gov.co/mapa.pdf")).toBe("https://www.igac.gov.co/mapa.pdf")
    expect(permite("https://www.igac.gov.co/interno")).toBeNull()
  })
})

describe("planchaPdfFrom", () => {
  /** La ficha real de la plancha 132 en «Estado cartográfico», recortada. */
  const ficha = [
    { field: "ECG_NUMR_P", value: "132" },
    { field: "ECG_VECTOR", value: "https://miig.sgc.gov.co/Paginas/Resultados.aspx?id=132" },
    { field: "ECG_URL_PL", value: "https://recordcenter.sgc.gov.co/B3/1201/0101242461300002.pdf" },
    { field: "ECG_URL_ME", value: "https://recordcenter.sgc.gov.co/B3/1201/memoria132.pdf" },
  ]

  test("elige el mapa y no la memoria explicativa", () => {
    expect(planchaPdfFrom(ficha)).toBe(
      "https://recordcenter.sgc.gov.co/B3/1201/0101242461300002.pdf",
    )
  })

  test("no ofrece nada si la plancha no tiene cartografía publicada", () => {
    expect(planchaPdfFrom([{ field: "ECG_NUMR_P", value: "999" }])).toBeNull()
    expect(planchaPdfFrom([])).toBeNull()
    expect(planchaPdfFrom(null)).toBeNull()
  })

  test("una página del visor no es una plancha", () => {
    expect(planchaPdfFrom([ficha[1]])).toBeNull()
  })

  test("la memoria sola tampoco se ofrece", () => {
    // Es un informe de doscientas páginas: no hay nada que colocar sobre el mapa.
    expect(planchaPdfFrom([ficha[3]])).toBeNull()
  })

  test("un PDF en un campo de nombre desconocido sí sirve", () => {
    // Los campos del SGC cambian, y quedarse solo con `ECG_URL_PL` sería la
    // trampa nº 1. Un PDF en un campo que no dice nada se ofrece igual.
    expect(planchaPdfFrom([{ field: "OTRO", value: "https://x.sgc.gov.co/a.pdf" }])).toBe(
      "https://x.sgc.gov.co/a.pdf",
    )
  })
})
