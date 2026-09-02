import { CRS_LIST, toGeographic } from "./crs"

/**
 * Colocar sobre el mapa la plancha geológica que el SGC publica en PDF.
 *
 * ## El problema
 *
 * La capa «Estado cartográfico» trae, en el campo `ECG_URL_PL`, el enlace al PDF
 * de la plancha 1:100.000 más actualizada. Es el mejor dato geológico que
 * publica el SGC —mejor que el servicio de teselas, que va por detrás— y hasta
 * ahora lo único que se podía hacer con él era abrirlo en otra pestaña.
 *
 * **Ese PDF no está georreferenciado.** Se comprobó sobre dos hojas muy
 * distintas: ninguna lleva `/Measure`, ni `/VP`, ni `/LGIDict` —los tres
 * diccionarios con los que un PDF puede declarar dónde cae en el mundo—. La 132
 * (Yolombó) delata por qué en sus metadatos: `PDFCreator 0.9.8` sobre
 * `Ghostscript 8.64`, o sea una impresión a PDF, y un controlador de impresora no
 * sabe nada de coordenadas. La 21 (Fonseca) salió de `ESRI ArcMap 9.3.1`, que sí
 * sabría escribirlas, y tampoco las trae.
 *
 * **Y las hojas no se parecen entre sí.** Son casi mil, levantadas a lo largo de
 * cincuenta años y exportadas con el programa que hubiera en cada época. Nada de
 * lo que hay aquí puede depender de cómo es una: cada regla se comprueba contra
 * el papel o se cruza con otra.
 *
 * ## Pero el papel sí lo dice
 *
 * Lo que un PDF impreso no lleva en sus diccionarios lo lleva dibujado, porque el
 * mapa está hecho para leerse: **la cuadrícula plana está rotulada en los
 * márgenes** —`880.`, `885.`, … `935.` abajo, `1.200.` … `1.240.` al costado— y
 * **sus líneas están dibujadas sobre el mapa**. Eso es exactamente un juego de
 * puntos de control, y viene con el archivo. No hay que pinchar nada a mano.
 *
 * El módulo hace tres cosas y las cruza:
 *
 * 1. **Lee los rótulos** de la capa de texto del PDF: qué valor y dónde.
 * 2. **Encuentra las líneas** de la cuadrícula en la imagen del mapa.
 * 3. **Empareja cada línea con su rótulo** y ajusta una recta por mínimos
 *    cuadrados.
 *
 * Y una cuarta que es la que hace que funcione en hojas distintas: **se comparan
 * las dos direcciones antes de creerse ninguna**. Un margen de plancha está lleno
 * de números en fila que no son coordenadas —el índice de localización `1 2 3 …
 * 12`, la escala gráfica del corte— y por separado son indistinguibles de unos
 * estes. Juntos no: las dos series de verdad miden el mismo mapa, así que su
 * escala coincide, y las falsas no se acercan. Ver `pairSeries`.
 *
 * Por qué las tres y no solo la primera: **un rótulo no está donde está su
 * línea**. Va centrado debajo de ella, así que su posición de anclaje queda
 * corrida media palabra —unos 7 pt, que a 1:100.000 son 250 m—. La separación
 * entre rótulos sí es exacta (todos miden lo mismo), o sea que los rótulos solos
 * dan bien la **escala** y mal el **origen**. Las líneas dan las dos, y los
 * rótulos les ponen el valor. Con la plancha 132 el residuo del ajuste queda en
 * 0,1 píxeles.
 *
 * ## Qué NO se usa, y es lo contrario de lo que parece
 *
 * La misma hoja lleva **también** una retícula geográfica rotulada —`74°40'W`,
 * `6°41'N`—, que parece el camino corto: son grados, no hay que saber en qué
 * origen está la cuadrícula plana. **No cuadra con la cuadrícula plana**: sale
 * unos 300 m corrida en longitud y unos 50 m en latitud. La explicación está
 * impresa en la propia carátula —«Transformada a datum MAGNA SIRGAS, 2013»—: la
 * hoja es de 1975, en el datum Bogotá de entonces, y en 2013 le transformaron la
 * cuadrícula plana pero le dejaron la retícula geográfica vieja. Los 300 m son el
 * salto de datum.
 *
 * Así que se usa la cuadrícula plana, que es la que lleva fecha de revisión, y la
 * geográfica se ignora. Es un buen recordatorio de que en una hoja vieja las dos
 * retículas pueden no ser el mismo mapa.
 *
 * ## En qué origen está la cuadrícula
 *
 * No se da por supuesto: **se prueban todos** los sistemas planos que el visor
 * conoce y gana el que deje la plancha más cerca del sitio donde el usuario la
 * tocó. Los orígenes de MAGNA-SIRGAS están a tres grados unos de otros —cientos
 * de kilómetros— así que no hay empate posible, y es la trampa nº 1 otra vez: la
 * carátula dice «ORIGEN EN LA ZONA BOGOTÁ», pero eso vale para esta hoja y no
 * para las 900 que faltan.
 *
 * Módulo puro: recibe texto y píxeles, devuelve números. No sabe de PDF ni de
 * MapLibre.
 */

/**
 * Un número escrito a la colombiana, con el punto como separador de miles.
 *
 * El punto final es el que marca «y tres ceros más»: en los márgenes de una
 * plancha el rótulo completo aparece una vez —`880.000 m.E`— y los demás van
 * abreviados —`885.`, `890.`—, que es lo que cabe entre línea y línea.
 */
const NUMERO = /^(\d{1,4}(?:\.\d{3})*)\.?(?:\s*m?\.?\s*[EN])?$/i

/**
 * El valor en metros de un rótulo de cuadrícula, o `null` si no lo es.
 *
 * `880.` y `880.000` son el mismo sitio: el primero tiene los miles omitidos.
 * Se distinguen por magnitud y no por la presencia del punto final, porque hay
 * hojas que lo escriben sin él. Ningún origen colombiano tiene coordenadas de
 * menos de cinco cifras —el más pequeño ronda los 400.000 m—, así que cualquier
 * cosa por debajo de 10.000 son kilómetros.
 */
export const parseGridValue = (texto) => {
  const limpio = String(texto ?? "").trim()
  const encontrado = limpio.match(NUMERO)
  if (!encontrado) return null

  const numero = Number(encontrado[1].replace(/\./g, ""))
  if (!Number.isFinite(numero) || numero <= 0) return null
  return numero < 10000 ? numero * 1000 : numero
}

/**
 * Los rótulos numéricos de una página, con su sitio.
 *
 * @param {Array<{text:string, x:number, y:number}>} items texto del PDF, en
 *   píxeles del lienzo y con la `y` hacia abajo
 */
export const gridLabelsFrom = (items) =>
  (items ?? [])
    .map((item) => ({ value: parseGridValue(item?.text), x: item?.x, y: item?.y }))
    .filter((e) => e.value !== null && Number.isFinite(e.x) && Number.isFinite(e.y))

/**
 * Cuántos rótulos como mínimo para fiarse de una serie.
 *
 * Con tres, tres números cualesquiera de una leyenda pueden alinearse por
 * casualidad. Con cinco, la casualidad tendría que ser que además crecieran en
 * progresión aritmética y en el orden correcto.
 */
const MINIMO_ROTULOS = 5

/**
 * La fila (o la columna) de rótulos de cuadrícula que hay en la página.
 *
 * Se agrupan los rótulos por la coordenada que **no** varía —la `y` en la fila de
 * abajo, la `x` en la columna del costado— y de cada grupo se saca el subconjunto
 * que de verdad forma una progresión.
 *
 * **Y hace falta sacar un subconjunto, no comprobar el grupo entero.** En la
 * plancha 132 la fila de los estes trae, exactamente a la misma altura, el rótulo
 * de la esquina que es un norte (`1.240.000 m.N`) y un `74` suelto que se le cayó
 * a la retícula geográfica de al lado. Pedir que *todos* los números de la fila
 * encajen deja la hoja sin colocar por dos intrusos entre trece.
 *
 * Se buscan por consenso: se prueba la recta que pasa por **cada par** de rótulos
 * y gana la que deje más rótulos cerca. Con quince números por fila son un
 * centenar de rectas, o sea nada de trabajo, y a cambio da igual cuántos intrusos
 * haya mientras la cuadrícula sea el grupo más numeroso — que lo es siempre,
 * porque un margen rotula diez o doce líneas y los intrusos son dos o tres.
 *
 * Se probó antes con la mediana de las pendientes de todos los pares
 * (Theil-Sen), que es más corta de escribir. Aguanta hasta un tercio de intrusos
 * **contados por puntos**, pero lo que cuenta son los pares: dos intrusos entre
 * siete puntos ya son la mitad de los pares, y ahí la mediana se va con ellos.
 *
 * Un mapa geológico está lleno de números que no son coordenadas: buzamientos,
 * cotas, la escala gráfica del corte, el número de las planchas vecinas. Ninguno
 * forma una progresión aritmética de cinco términos alineados, y por eso el
 * filtro es este y no una lista de sitios donde mirar.
 *
 * **Devuelve todas las candidatas, no la más grande.** Quedarse con la mayor
 * parecía razonable y es justo lo que rompió la plancha 21 (Fonseca): el índice
 * de localización que va por el borde —`1 2 3 … 12`, para decir «la mina está en
 * el D-7»— son doce números en progresión perfecta, separados exactamente el
 * paso de la cuadrícula, y ganaban a los estes de verdad. Ninguna regla que mire
 * una sola serie los distingue: son indistinguibles **hasta que se comparan las
 * dos direcciones**, y ahí se cae solo, porque su escala aparente no cuadra con
 * la de los nortes. De eso se encarga `pairSeries`.
 *
 * Cada candidata trae su escala —píxeles por metro— ya ajustada por mínimos
 * cuadrados sobre los rótulos que acuerdan.
 *
 * @param {number} sentido `+1` si el valor crece con la coordenada (los estes,
 *   hacia la derecha), `-1` si decrece (los nortes, porque la `y` del lienzo va
 *   hacia abajo)
 * @returns {Array<{labels:Array, scale:number}>} de más a menos rótulos
 */
export const gridSeries = (labels, { fijo, movil, sentido, tolerancia }) => {
  const grupos = []
  for (const rotulo of [...labels].sort((a, b) => a[fijo] - b[fijo])) {
    const ultimo = grupos[grupos.length - 1]
    if (ultimo && Math.abs(rotulo[fijo] - ultimo[0][fijo]) <= tolerancia) ultimo.push(rotulo)
    else grupos.push([rotulo])
  }

  return grupos
    .map((grupo) => serieDe(grupo, { movil, sentido }))
    .filter(Boolean)
    .sort((a, b) => b.labels.length - a.labels.length)
}

/**
 * Empareja la serie de estes con la de nortes.
 *
 * **Este es el filtro que separa una cuadrícula de un número cualquiera puesto
 * en fila.** Las dos series miden el mismo mapa, así que su escala —píxeles por
 * metro— tiene que ser la misma; y las cosas que se le parecen no la cumplen ni
 * de lejos:
 *
 * - El índice de localización del borde (`1 2 3 … 12`) sale a un paso de
 *   cuadrícula por «kilómetro», o sea cinco veces la escala real.
 * - La escala gráfica del corte geológico (`1.000 2.000 3.000` metros) sale a
 *   tres órdenes de magnitud de distancia.
 *
 * Ninguna regla sobre una serie aislada los descarta sin descartar también hojas
 * legítimas. Comparadas, se van solas.
 *
 * Gana la pareja con más rótulos entre las dos. El margen es del 2 % y no del
 * medio por ciento que se exige al final: aquí las posiciones son anclas de
 * texto, que llevan el corrimiento del rótulo; la comprobación fina se hace
 * después, ya sobre las líneas.
 */
export const pairSeries = (estes, nortes, margen = 0.02) => {
  let mejor = null
  for (const e of estes) {
    for (const n of nortes) {
      const desvio = Math.abs(Math.abs(e.scale) - Math.abs(n.scale)) / Math.abs(e.scale)
      if (!(desvio < margen)) continue
      const rotulos = e.labels.length + n.labels.length
      if (!mejor || rotulos > mejor.rotulos) mejor = { estes: e, nortes: n, rotulos }
    }
  }
  return mejor
}

/**
 * Hasta dónde llegan las coordenadas planas colombianas.
 *
 * Los cinco husos de MAGNA-SIRGAS ponen su origen en 1.000.000 / 1.000.000 y el
 * país cabe holgadamente entre los 700.000 y los 1.300.000 m al este; el CTM-12
 * arranca en 5.000.000 / 2.000.000. Fuera de esta horquilla no hay coordenada
 * posible, y sirve para tirar de entrada las series de números pequeños —índices
 * de localización, números de plancha vecina— antes de comparar nada.
 */
const COORDENADA_MINIMA = 200000
const COORDENADA_MAXIMA = 6000000

/** El subconjunto de un grupo de rótulos que forma una progresión, o `null`. */
const serieDe = (grupo, { movil, sentido }) => {
  // Un mismo valor rotulado dos veces —pasa: el rótulo largo de la esquina
  // repite el valor del corto de al lado— pondría dos puntos en la misma
  // vertical. Se queda uno.
  const porValor = new Map()
  for (const rotulo of grupo) {
    if (rotulo.value < COORDENADA_MINIMA || rotulo.value > COORDENADA_MAXIMA) continue
    if (!porValor.has(rotulo.value)) porValor.set(rotulo.value, rotulo)
  }
  const unicos = [...porValor.values()].sort((a, b) => a.value - b.value)
  if (unicos.length < MINIMO_ROTULOS) return null

  // La tolerancia, en fracción de lo que ocupa el grupo y no en píxeles: un
  // rótulo va centrado bajo su línea, así que su ancla se corre media palabra, y
  // media palabra es una proporción de la página, no un número de píxeles.
  const posiciones = unicos.map((r) => r[movil])
  const extension = Math.max(...posiciones) - Math.min(...posiciones)
  const tolerancia = Math.max(3, extension * 0.02)

  let dentro = null
  for (let i = 0; i < unicos.length; i += 1) {
    for (let j = i + 1; j < unicos.length; j += 1) {
      const dv = unicos[j].value - unicos[i].value
      if (dv <= 0) continue
      const pendiente = (unicos[j][movil] - unicos[i][movil]) / dv
      if (pendiente === 0 || Math.sign(pendiente) !== Math.sign(sentido)) continue

      const origen = unicos[i][movil] - pendiente * unicos[i].value
      const acuerdan = unicos.filter(
        (r) => Math.abs(pendiente * r.value + origen - r[movil]) <= tolerancia,
      )
      if (!dentro || acuerdan.length > dentro.length) dentro = acuerdan
    }
  }
  if (!dentro || dentro.length < MINIMO_ROTULOS) return null

  // Y que los valores vayan de tanto en tanto. Una cuadrícula rotula cada
  // kilómetro redondo; que falte alguno es normal —no siempre cabe— y por eso se
  // admite un salto doble o triple, pero no uno cualquiera.
  const saltos = dentro.slice(1).map((r, i) => r.value - dentro[i].value)
  const minimo = Math.min(...saltos)
  if (!(minimo > 0)) return null
  const regulares = saltos.every((s) => Math.abs(s / minimo - Math.round(s / minimo)) < 0.01)
  if (!regulares) return null

  // La escala se recalcula por mínimos cuadrados sobre los que acuerdan, y no se
  // hereda del par que sembró la búsqueda: ese par puede ser dos rótulos de
  // formatos distintos —el largo de la esquina y uno abreviado— y traer el
  // corrimiento de los dos anclas metido dentro.
  const ajuste = minimosCuadrados(dentro.map((r) => ({ value: r.value, pos: r[movil] })))
  return ajuste ? { labels: dentro, scale: ajuste.scale } : null
}

/**
 * Las líneas finas de la cuadrícula dentro del mapa.
 *
 * **Por qué no vale buscar píxeles oscuros.** Las líneas de la cuadrícula son
 * grises y finas, y encima de un mapa geológico compiten con contactos, fallas,
 * curvas de nivel y drenajes, que son mucho más negros. Un umbral de oscuridad
 * las pierde y encuentra fallas.
 *
 * Lo que sí las distingue es que **son más oscuras que lo que tienen a los
 * lados** —eso es una línea— y que **lo son a lo largo de toda la altura del
 * mapa**, cosa que ninguna falla hace. Se mide entonces, columna a columna, qué
 * fracción de sus píxeles gana en oscuridad a sus dos vecinas a cierta
 * distancia; las columnas que pasan de la mitad son la cuadrícula.
 *
 * @param {Uint8Array|Uint8ClampedArray} gray luminancia, 0 negro … 255 blanco
 * @param {boolean} vertical líneas verticales (`true`) u horizontales
 * @returns {number[]} posiciones, en píxeles, en el eje que corresponde
 */
export const detectGridLines = (
  gray,
  { width, height, left, top, right, bottom, vertical, separacion = 4, contraste = 12, cobertura = 0.45 },
) => {
  const x0 = Math.max(0, Math.round(left))
  const x1 = Math.min(width, Math.round(right))
  const y0 = Math.max(0, Math.round(top))
  const y1 = Math.min(height, Math.round(bottom))
  if (x1 - x0 < 3 || y1 - y0 < 3) return []

  const d = Math.max(2, Math.round(separacion))
  const largo = vertical ? y1 - y0 : x1 - x0
  const candidatas = []

  const desde = vertical ? x0 + d : y0 + d
  const hasta = vertical ? x1 - d : y1 - d

  for (let i = desde; i < hasta; i += 1) {
    let cuenta = 0
    for (let j = vertical ? y0 : x0; j < (vertical ? y1 : x1); j += 1) {
      const centro = vertical ? gray[j * width + i] : gray[i * width + j]
      const antes = vertical ? gray[j * width + i - d] : gray[(i - d) * width + j]
      const despues = vertical ? gray[j * width + i + d] : gray[(i + d) * width + j]
      if ((antes + despues) / 2 - centro > contraste) cuenta += 1
    }
    if (cuenta / largo > cobertura) candidatas.push(i)
  }

  // Una línea de dos o tres píxeles de ancho da dos o tres columnas seguidas:
  // se juntan y se toma el centro, que es donde está de verdad.
  const juntas = []
  for (const i of candidatas) {
    const ultima = juntas[juntas.length - 1]
    if (ultima && i - ultima[ultima.length - 1] <= Math.max(2, d)) ultima.push(i)
    else juntas.push([i])
  }
  return juntas.map((g) => g.reduce((a, b) => a + b, 0) / g.length)
}

/**
 * Empareja cada línea detectada con el rótulo que le toca y ajusta la recta
 * `posición = escala · valor + origen`.
 *
 * El emparejamiento es por cercanía, y no hay ambigüedad posible: un rótulo cae a
 * lo sumo media palabra de su línea —unos 15 píxeles— y las líneas están a más de
 * cien unas de otras. Por eso la tolerancia se mide en fracción de la separación
 * entre líneas y no en un número fijo de píxeles: así vale igual a cualquier
 * resolución de dibujado.
 *
 * **Con rechazo de aberrantes.** El detector encuentra alguna línea de más —un
 * contacto geológico largo y recto que casualmente cruza todo el mapa—, y una
 * sola basta para torcer el ajuste. Se ajusta, se mira el residuo, se tira lo que
 * se salga y se vuelve a ajustar.
 *
 * @returns {{scale:number, origin:number, residual:number, count:number}|null}
 */
export const fitGridAxis = (lineas, rotulos, { movil }) => {
  if (!lineas?.length || !rotulos?.length) return null

  const paso = medianaDeSeparaciones(rotulos.map((r) => r[movil]))
  if (!(paso > 0)) return null
  const tolerancia = paso * 0.3

  let pares = []
  for (const linea of lineas) {
    let cerca = null
    for (const rotulo of rotulos) {
      const distancia = Math.abs(rotulo[movil] - linea)
      if (!cerca || distancia < cerca.distancia) cerca = { rotulo, distancia }
    }
    if (cerca && cerca.distancia <= tolerancia) pares.push({ value: cerca.rotulo.value, pos: linea })
  }

  // Dos líneas emparejadas con el mismo rótulo significan que una de las dos no
  // es de la cuadrícula. Se queda la más cercana.
  const porValor = new Map()
  for (const par of pares) {
    const previo = porValor.get(par.value)
    const suyo = rotulos.find((r) => r.value === par.value)?.[movil] ?? 0
    if (!previo || Math.abs(par.pos - suyo) < Math.abs(previo.pos - suyo)) porValor.set(par.value, par)
  }
  pares = [...porValor.values()]

  for (let vuelta = 0; vuelta < 5; vuelta += 1) {
    if (pares.length < 3) return null
    const ajuste = minimosCuadrados(pares)
    if (!ajuste) return null

    const residuos = pares.map((p) => Math.abs(ajuste.scale * p.value + ajuste.origin - p.pos))
    const peor = Math.max(...residuos)
    // Medio píxel es lo que se consigue con una cuadrícula limpia; por encima de
    // eso hay algo emparejado de más.
    if (peor <= 0.5 || pares.length <= 3) {
      return { ...ajuste, residual: peor, count: pares.length, lines: pares.map((p) => p.pos) }
    }
    const corte = Math.max(0.5, 3 * mediana(residuos))
    const filtrados = pares.filter((_, i) => residuos[i] < corte)
    if (filtrados.length === pares.length) {
      return { ...ajuste, residual: peor, count: pares.length, lines: pares.map((p) => p.pos) }
    }
    pares = filtrados
  }
  return null
}

const minimosCuadrados = (pares) => {
  const n = pares.length
  const sx = pares.reduce((a, p) => a + p.value, 0)
  const sy = pares.reduce((a, p) => a + p.pos, 0)
  const sxx = pares.reduce((a, p) => a + p.value * p.value, 0)
  const sxy = pares.reduce((a, p) => a + p.value * p.pos, 0)
  const denominador = n * sxx - sx * sx
  if (Math.abs(denominador) < 1e-9) return null
  const scale = (n * sxy - sx * sy) / denominador
  return { scale, origin: (sy - scale * sx) / n }
}

const mediana = (valores) => {
  const orden = [...valores].sort((a, b) => a - b)
  const medio = Math.floor(orden.length / 2)
  return orden.length % 2 ? orden[medio] : (orden[medio - 1] + orden[medio]) / 2
}

const medianaDeSeparaciones = (posiciones) => {
  const orden = [...posiciones].sort((a, b) => a - b)
  const saltos = orden.slice(1).map((v, i) => v - orden[i]).filter((v) => v > 0)
  return saltos.length ? mediana(saltos) : 0
}

/**
 * El marco del mapa: el rectángulo grueso que separa el dibujo de los márgenes.
 *
 * Es lo que hay que recortar. Todo lo demás de la hoja —la leyenda, el corte
 * geológico, el índice de localización, la carátula— está fuera, y meterlo en el
 * mapa sería tapar medio departamento con una tabla de símbolos.
 *
 * Se busca **a partir de la cuadrícula ya ajustada**, no por su cuenta: se sabe
 * dónde caería cada línea siguiente, así que basta con mirar si hay un trazo
 * oscuro y largo cerca de donde tocaría la primera línea fuera de las
 * encontradas. Buscarlo a ciegas encontraría también el borde de la hoja y los
 * recuadros de la leyenda, que son igual de rectos y más largos.
 *
 * Si no aparece, se recorta por las líneas extremas de la cuadrícula: se pierde
 * un cuadro de borde, que es infinitamente mejor que no colocar la plancha.
 */
export const detectFrame = (
  gray,
  { width, height, lineasX, lineasY, oscuro = 110, cobertura = 0.7, alcance = 1.3 },
) => {
  const pasoX = mediaSeparacion(lineasX)
  const pasoY = mediaSeparacion(lineasY)
  if (!(pasoX > 0) || !(pasoY > 0)) return null

  const dentroX = [Math.min(...lineasX), Math.max(...lineasX)]
  const dentroY = [Math.min(...lineasY), Math.max(...lineasY)]

  /**
   * Se busca hacia afuera y se para en **el primer** trazo largo, no en el más
   * oscuro. La diferencia importa: por fuera del marco del mapa está el borde de
   * la hoja, que es igual de recto y más largo todavía —cubre la página
   * entera—, así que quedarse con el más oscuro lo elegía a él y el recorte se
   * llevaba media leyenda. Yendo de dentro hacia afuera, el marco se encuentra
   * primero por construcción.
   */
  const buscar = (desde, hacia, vertical) => {
    const paso = vertical ? pasoX : pasoY
    const limite = (vertical ? width : height) - 1
    const solo = (i) =>
      i >= 0 && i <= limite &&
      esTrazo(gray, { width, height, vertical, i, dentroX, dentroY, oscuro, cobertura })

    /** El centro del trazo que pasa por `i`, midiéndolo a los dos lados. */
    const centro = (i) => {
      let uno = i
      while (solo(uno - 1)) uno -= 1
      let otro = i
      while (solo(otro + 1)) otro += 1
      return (uno + otro) / 2
    }

    // **Primero, si la última línea de la cuadrícula ya es el marco.** Pasa
    // siempre que la hoja está recortada por un valor redondo de la cuadrícula,
    // que es lo normal: entonces el borde del mapa *es* una línea de la
    // cuadrícula y buscar más afuera encuentra el borde de la hoja. Es lo que
    // hacía que la plancha 132 saliera treinta metros corrida hacia el oeste.
    //
    // Se mira con **dos píxeles de holgura** porque la posición que llega es un
    // centroide con decimales y el trazo puede caer a un lado del redondeo: en la
    // plancha 21 (Fonseca) el marco de arriba está en la fila 87, la cuadrícula
    // lo situaba en 88,5 y mirar solo 88 no lo encontraba. Fallando esa
    // comprobación, la búsqueda seguía hacia afuera y se quedaba con el borde de
    // la franja del índice de localización: el recorte salía con los números
    // `1 2 3 … 12` metidos dentro del mapa y la hoja estirada un kilómetro de
    // más por el norte.
    for (let d = 0; d <= 2; d += 1) {
      for (const i of [Math.round(desde) - d, Math.round(desde) + d]) {
        if (solo(i)) return centro(i)
      }
    }

    // Y si no, hacia afuera, parando en el primero. Se arranca tres píxeles más
    // allá de lo ya mirado, lo justo para no volver sobre lo mismo.
    const inicio = Math.round(desde + hacia * 3)
    const fin = Math.round(desde + hacia * paso * alcance)
    for (let i = inicio; hacia > 0 ? i <= fin : i >= fin; i += hacia) {
      if (i < 0 || i > limite) break
      // El marco es un trazo grueso: dos o tres píxeles. Se le mide el ancho y se
      // devuelve su centro, que es donde está la coordenada; quedarse con el
      // primer píxel lo correría medio trazo hacia afuera.
      if (solo(i)) return centro(i)
    }
    return null
  }

  const izquierda = buscar(dentroX[0], -1, true)
  const derecha = buscar(dentroX[1], +1, true)
  const arriba = buscar(dentroY[0], -1, false)
  const abajo = buscar(dentroY[1], +1, false)

  return {
    left: izquierda ?? dentroX[0],
    right: derecha ?? dentroX[1],
    top: arriba ?? dentroY[0],
    bottom: abajo ?? dentroY[1],
    complete: [izquierda, derecha, arriba, abajo].every((v) => v !== null),
  }
}

const mediaSeparacion = (posiciones) => {
  if (!posiciones || posiciones.length < 2) return 0
  const orden = [...posiciones].sort((a, b) => a - b)
  return (orden[orden.length - 1] - orden[0]) / (orden.length - 1)
}

/**
 * Si esa fila o columna exacta es un trazo que cruza el mapa de lado a lado.
 *
 * Quien la llama decide cuánto mirar alrededor: para reconocer un marco cerca de
 * una posición con decimales hace falta holgura, pero para **medir** el grosor
 * del trazo y quedarse con su centro hay que preguntar píxel a píxel.
 */
const esTrazo = (gray, { width, height, vertical, i, dentroX, dentroY, oscuro, cobertura }) => {
  const desdeJ = Math.max(0, Math.round(vertical ? dentroY[0] : dentroX[0]))
  const hastaJ = Math.min((vertical ? height : width) - 1, Math.round(vertical ? dentroY[1] : dentroX[1]))
  const largo = hastaJ - desdeJ
  if (largo < 10) return false

  const k = Math.round(i)
  if (k < 0 || k > (vertical ? width : height) - 1) return false

  let cuenta = 0
  for (let j = desdeJ; j <= hastaJ; j += 1) {
    const valor = vertical ? gray[j * width + k] : gray[k * width + j]
    if (valor < oscuro) cuenta += 1
  }
  return cuenta / largo > cobertura
}

/**
 * En qué sistema plano está la cuadrícula de la hoja.
 *
 * Se prueban todos los que el visor conoce y gana el que deje el centro de la
 * plancha más cerca de donde el usuario la tocó. No se lee de la carátula —donde
 * sí está escrito— porque cada hoja lo escribe a su manera y son casi mil hojas:
 * es la trampa nº 1, no escribir a mano lo que se puede preguntar.
 *
 * El tope de distancia no es un detalle: si **ninguno** deja la plancha cerca, lo
 * que ha fallado es el ajuste, y colocar la hoja a doscientos kilómetros sería
 * peor que decir que no se pudo.
 */
const TOPE_KM = 60

export const chooseOrigin = ([centroE, centroN], cerca) => {
  const candidatos = CRS_LIST.filter((crs) => crs.projected)
  let mejor = null

  for (const crs of candidatos) {
    let lonLat
    try {
      lonLat = toGeographic([centroE, centroN], crs.id)
    } catch {
      continue
    }
    if (!Number.isFinite(lonLat?.[0]) || !Number.isFinite(lonLat?.[1])) continue

    const km = distanciaKm(lonLat, cerca)
    if (!mejor || km < mejor.km) mejor = { crs, km, lonLat }
  }

  return mejor && mejor.km <= TOPE_KM ? mejor : null
}

/** Distancia aproximada entre dos puntos, en kilómetros. Basta para elegir. */
const distanciaKm = ([lon1, lat1], [lon2, lat2]) => {
  const grados = 111.32
  const dx = (lon1 - lon2) * grados * Math.cos(((lat1 + lat2) / 2) * (Math.PI / 180))
  const dy = (lat1 - lat2) * grados
  return Math.hypot(dx, dy)
}

/**
 * Los rótulos que dicen la coordenada entera: `1.080.000 m.N`, `835.000 m.E`.
 *
 * Una plancha rotula su cuadrícula dos veces. En los márgenes van abreviados
 * —`1.079.`, `1.084.`— porque es lo que cabe entre línea y línea, y en las cuatro
 * esquinas va uno completo por eje, que es el que dice de qué números se está
 * hablando.
 */
const ROTULO_COMPLETO = /^([\d.]+)\s*m\.?\s*([EN])$/i

/**
 * Cuánto se corrige el ajuste porque la hoja se contradice a sí misma.
 *
 * ## El caso que lo motiva
 *
 * La plancha 193 (Yopal) rotula sus nortes abreviados `1.079.`, `1.084.`,
 * `1.089.` … y en las esquinas escribe `1.080.000 m.N` y `1.120.000 m.N` sobre
 * **esas mismas dos líneas**. Se contradicen en exactamente mil metros, y como
 * los abreviados son nueve y los completos dos, el ajuste hacía caso a los
 * nueve: la hoja quedaba un kilómetro al sur de donde va, lo bastante para que la
 * geología no cuadrara con el terreno.
 *
 * **Los completos son los que valen.** Lo dice la propia hoja por un tercer
 * camino: su retícula geográfica —`5°36'N`, `5°26'N`, que es un dato
 * independiente de la cuadrícula plana— coincide con los de esquina dentro de 30
 * m y discrepa de los abreviados en 1.000. Un rótulo completo es una coordenada
 * dicha entera; uno abreviado omite tres cifras y lo genera una expresión de
 * etiquetado que puede ir corrida.
 *
 * ## Por qué el umbral es de medio kilómetro
 *
 * Porque un rótulo no está donde está su marca —va centrado, y su ancla queda
 * corrida— y eso mete unos cientos de metros de ruido. Medido en seis hojas, la
 * diferencia entre lo que declara la esquina y lo que dice el ajuste va de −380 a
 * +380 m cuando todo está bien, y sale +1.071 en la que está mal. El sesgo
 * además **se cancela solo** en la mediana, porque los rótulos de esquina vienen
 * por pares —uno arriba del marco y otro abajo— y sus anclas se corren en
 * sentidos opuestos. De ahí que se pidan dos como mínimo.
 *
 * Y se corrige solo por kilómetros enteros: el error de una expresión de
 * etiquetado es una cifra cambiada, no una cantidad cualquiera. Si la diferencia
 * es grande pero no cae cerca de un kilómetro redondo, no se toca nada — eso ya
 * no es una errata, es que algo más está mal y corregirlo a ciegas sería peor.
 *
 * @returns {{este:number, norte:number}} metros que hay que sumarle a cada eje
 */
const DESFASE_MINIMO = 500
const CERCA_DEL_KILOMETRO = 400

export const declaredShift = (items, { aE, aN }) => {
  const enEste = []
  const enNorte = []

  for (const item of items ?? []) {
    const encontrado = String(item?.text ?? "").trim().match(ROTULO_COMPLETO)
    if (!encontrado) continue
    const valor = parseGridValue(encontrado[1])
    if (valor === null || !Number.isFinite(item.x) || !Number.isFinite(item.y)) continue

    // De un rótulo de norte solo interesa su altura, y de uno de este solo su
    // horizontal: la otra coordenada la ponen donde les cabe.
    if (encontrado[2].toUpperCase() === "N") enNorte.push(valor - aN(item.y))
    else enEste.push(valor - aE(item.x))
  }

  return { este: kilometrosDeMas(enEste), norte: kilometrosDeMas(enNorte) }
}

const kilometrosDeMas = (diferencias) => {
  if (diferencias.length < 2) return 0
  const centro = mediana(diferencias)
  if (Math.abs(centro) < DESFASE_MINIMO) return 0
  const kilometros = Math.round(centro / 1000) * 1000
  if (kilometros === 0 || Math.abs(centro - kilometros) > CERCA_DEL_KILOMETRO) return 0
  return kilometros
}

/**
 * Cuánto puede desviarse el ajuste antes de no fiarse.
 *
 * Los dos ejes miden el mismo mapa, así que su escala tiene que salir igual. Si
 * no sale, uno de los dos ha emparejado mal y el resultado sería una hoja
 * estirada. Medio por ciento sobre una hoja de 60 km son 300 m: por debajo de eso
 * la diferencia es del detector, por encima es un error.
 */
const DESVIO_MAXIMO = 0.005

/**
 * Todo junto: de una página de PDF a las cuatro esquinas para MapLibre.
 *
 * @param {Object} entrada
 * @param {Array<{text:string,x:number,y:number}>} entrada.items texto de la
 *   página en píxeles del lienzo
 * @param {Uint8Array} entrada.gray luminancia de la página, `width*height`
 * @param {[number,number]} entrada.cerca dónde tocó el usuario, en `[lon, lat]`
 *
 * **Cuando falla dice por qué y con qué números.** No es adorno: las hojas son
 * casi mil y no se parecen entre sí —la 132 la exportó un controlador de
 * impresora en 1975 y la 21 salió de ArcMap en 2013—, así que la siguiente que no
 * se coloque habrá fallado por algo que aquí no se ha visto. Con «leí 57 rótulos,
 * armé 2 series de estes y 0 de nortes» se sabe dónde mirar sin tener el archivo
 * delante; con «no se pudo», no.
 *
 * @returns {{ok:true, ...}|{ok:false, reason:string, detail:string}}
 */
export const georeferencePlancha = ({ items, gray, width, height, cerca }) => {
  const rotulos = gridLabelsFrom(items)
  if (rotulos.length < MINIMO_ROTULOS * 2) {
    return {
      ok: false,
      reason: "sin-rotulos",
      detail: `${items?.length ?? 0} textos en la página, ${rotulos.length} con forma de coordenada`,
    }
  }

  // La tolerancia con la que dos rótulos se consideran «de la misma fila»: un
  // uno por ciento de la página. Fija en píxeles no valdría, porque la página se
  // dibuja a la resolución que haga falta.
  const tolerancia = Math.max(3, height * 0.01)
  const candidatasEstes = gridSeries(rotulos, { fijo: "y", movil: "x", sentido: +1, tolerancia })
  // Los nortes crecen hacia arriba y la `y` del lienzo hacia abajo: al ordenar
  // por valor, la posición tiene que ir bajando.
  const candidatasNortes = gridSeries(rotulos, { fijo: "x", movil: "y", sentido: -1, tolerancia })

  // Y de todas las series que parecen una cuadrícula, la pareja cuyas dos
  // escalas coinciden. Es lo que descarta el índice de localización del borde y
  // la escala gráfica del corte, que por separado son indistinguibles de unos
  // estes — ver `pairSeries`.
  const pareja = pairSeries(candidatasEstes, candidatasNortes)
  if (!pareja) {
    return {
      ok: false,
      reason: "sin-cuadricula",
      detail:
        `${rotulos.length} rótulos, ${candidatasEstes.length} series de estes y ` +
        `${candidatasNortes.length} de nortes; ninguna pareja con la misma escala`,
    }
  }
  const filaEstes = pareja.estes.labels
  const columnaNortes = pareja.nortes.labels

  // El mapa está donde se cruzan las dos series. Se busca ahí y no en toda la
  // página: fuera del marco hay recuadros de leyenda que también son rectos.
  //
  // **Con dos cuadros de holgura hacia afuera**, y no ceñido a los rótulos. Un
  // margen no siempre rotula su última línea —no cabe, o el rótulo largo de la
  // esquina le quita el sitio—, así que ceñirse a ellos deja fuera de la
  // búsqueda justo las líneas que hacen falta para encontrar el marco.
  const pasoX = medianaDeSeparaciones(filaEstes.map((r) => r.x))
  const pasoY = medianaDeSeparaciones(columnaNortes.map((r) => r.y))
  const holguraX = pasoX * 2
  const holguraY = pasoY * 2
  const banda = {
    left: Math.min(...filaEstes.map((r) => r.x)) - holguraX,
    right: Math.max(...filaEstes.map((r) => r.x)) + holguraX,
    top: Math.min(...columnaNortes.map((r) => r.y)) - holguraY,
    bottom: Math.max(...columnaNortes.map((r) => r.y)) + holguraY,
  }

  const separacion = Math.max(3, Math.round(width / 640))
  const comun = { width, height, separacion }
  // Al buscar verticales se recorta un poco por arriba y por abajo, y al revés
  // con las horizontales: así ninguna de las dos búsquedas encuentra el marco
  // —que está en el borde— en vez de la cuadrícula.
  const lineasX = detectGridLines(gray, {
    ...comun,
    vertical: true,
    left: banda.left,
    right: banda.right,
    top: banda.top + holguraY + pasoY * 0.3,
    bottom: banda.bottom - holguraY - pasoY * 0.3,
  })
  const lineasY = detectGridLines(gray, {
    ...comun,
    vertical: false,
    left: banda.left + holguraX + pasoX * 0.3,
    right: banda.right - holguraX - pasoX * 0.3,
    top: banda.top,
    bottom: banda.bottom,
  })

  const ejeX = fitGridAxis(lineasX, filaEstes, { movil: "x" })
  const ejeY = fitGridAxis(lineasY, columnaNortes, { movil: "y" })
  if (!ejeX || !ejeY) {
    return {
      ok: false,
      reason: "sin-ajuste",
      detail:
        `${filaEstes.length} rótulos de este y ${columnaNortes.length} de norte; ` +
        `${lineasX.length} líneas verticales y ${lineasY.length} horizontales en la imagen`,
    }
  }

  // Las dos escalas son la misma cantidad —píxeles por metro— medida por
  // caminos distintos. Que no coincidan es la señal de que uno de los dos
  // emparejó mal, y es la única forma de enterarse sin mirar el resultado.
  const desvio = Math.abs(Math.abs(ejeX.scale) - Math.abs(ejeY.scale)) / Math.abs(ejeX.scale)
  if (!(desvio < DESVIO_MAXIMO)) {
    return {
      ok: false,
      reason: "ejes-discordantes",
      detail: `los dos ejes difieren un ${(desvio * 100).toFixed(2)} %`,
    }
  }

  // Para buscar el marco se parte de **las líneas que el ajuste emparejó con un
  // rótulo**, y no de todas las que encontró el detector.
  //
  // Hubo una versión que se quedaba con las que caían sobre un múltiplo del paso
  // contado desde cero, para incluir también las líneas sin rótulo. Tenía dos
  // fallos y los dos aparecieron en la plancha 193 (Yopal):
  //
  // 1. **Su cuadrícula no está en múltiplos redondos.** Sus nortes van
  //    1.079.000, 1.084.000, 1.089.000 — cada cinco kilómetros, sí, pero
  //    desfasados mil metros. Ninguna de sus líneas era múltiplo de 5.000, así
  //    que se descartaban **todas**, la búsqueda del marco se quedaba sin nada de
  //    donde partir y el recorte caía en el respaldo: el borde de la hoja.
  // 2. **Y aun arreglando eso**, el filo izquierdo del recuadro de la leyenda
  //    caía a cuatro píxeles de donde tocaría la línea siguiente, o sea dentro de
  //    cualquier tolerancia razonable, y el marco derecho se iba con él.
  //
  // El emparejamiento con rótulos no tiene ninguno de los dos problemas: no
  // supone nada sobre los valores y exige que haya un rótulo cerca, cosa que un
  // recuadro de leyenda no cumple. Se pierden las líneas de más afuera que no
  // llevan rótulo, y no importa: el marco se busca **hacia afuera** desde ahí,
  // con un cuadro largo de alcance.
  const marco = detectFrame(gray, {
    width,
    height,
    lineasX: ejeX.lines,
    lineasY: ejeY.lines,
  }) ?? { left: Math.min(...lineasX), right: Math.max(...lineasX), top: Math.min(...lineasY), bottom: Math.max(...lineasY), complete: false }

  const aE = (x) => (x - ejeX.origin) / ejeX.scale
  const aN = (y) => (y - ejeY.origin) / ejeY.scale

  // Y antes de dar nada por bueno, se le pregunta a la hoja otra vez: los
  // rótulos de las esquinas dicen la coordenada entera, y tienen que coincidir.
  const corrimiento = declaredShift(items, { aE, aN })

  const oeste = aE(marco.left) + corrimiento.este
  const este = aE(marco.right) + corrimiento.este
  // `ejeY.scale` es negativa —la `y` baja mientras el norte sube—, así que el
  // borde de arriba del recorte es el norte mayor.
  const norte = aN(marco.top) + corrimiento.norte
  const sur = aN(marco.bottom) + corrimiento.norte

  const origen = chooseOrigin([(oeste + este) / 2, (norte + sur) / 2], cerca)
  if (!origen) {
    return {
      ok: false,
      reason: "origen-desconocido",
      detail: `la cuadrícula da E ${Math.round(oeste)} N ${Math.round(sur)}, que no cae cerca en ningún huso`,
    }
  }

  const aLonLat = (e, n) => toGeographic([e, n], origen.crs.id)
  return {
    ok: true,
    frame: marco,
    // El orden que pide MapLibre para una fuente de imagen: NO, NE, SE, SO.
    corners: [
      aLonLat(oeste, norte),
      aLonLat(este, norte),
      aLonLat(este, sur),
      aLonLat(oeste, sur),
    ],
    crs: origen.crs,
    bounds: { oeste, este, norte, sur },
    // Cuántos metros de terreno mide la hoja: sirve para el aviso de la ficha y
    // para saber, de un vistazo, si el ajuste tiene sentido.
    size: [este - oeste, norte - sur],
    residual: Math.max(ejeX.residual, ejeY.residual),
    controlPoints: ejeX.count + ejeY.count,
    frameComplete: marco.complete,
    // Cuánto hubo que corregir porque la hoja se contradecía a sí misma. Cero
    // casi siempre; cuando no lo es, quien mire el mapa tiene que enterarse.
    shift: corrimiento,
  }
}
