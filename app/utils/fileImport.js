import { describeSkipped, dxfToFeatures } from "./dxfGeojson"

/**
 * Leer los archivos que trae el usuario y convertirlos en GeoJSON.
 *
 * Cuatro familias de archivos, que son las que llegan de verdad en este oficio:
 *
 * | Lo que llega            | De dónde sale                                   |
 * |-------------------------|-------------------------------------------------|
 * | `.zip` / `.shp`         | shapefile: el formato en que se intercambia todo |
 * | `.kml` / `.kmz`         | Google Earth: lo que manda quien no usa un SIG   |
 * | `.dxf`                  | AutoCAD: el plano de topografía                  |
 * | `.geojson` / `.gpx`     | un servicio web, o el GPS de campo               |
 *
 * **Todo se lee en el navegador, y eso es una decisión, no una limitación.** Un
 * plano de un lindero en trámite o el levantamiento de una labor son datos de
 * alguien: mandarlos a nuestro servidor para convertirlos ahí sería pedir una
 * confianza que no hace falta pedir. Ninguno de estos archivos sale de la
 * máquina de quien lo abre. De paso se ahorra el tope de duración de una función
 * de Vercel, que es el que ya rompió la descarga de las planchas (ver la nota de
 * `maxDuration` en CLAUDE.md).
 *
 * **Las tres librerías de lectura se cargan solo cuando alguien abre un
 * archivo**, con `import()`, igual que `pdfjs-dist`. Entre las tres pesan cerca
 * de 200 kB y la inmensa mayoría de las visitas no carga ningún archivo: en el
 * paquete inicial serían peso muerto para todo el mundo.
 */

/**
 * Hasta dónde se lee un archivo.
 *
 * El tope no es del formato sino del navegador: un shapefile de 200 MB son
 * millones de vértices que MapLibre tiene que teselar en un hilo y React
 * mantener en memoria, y en un teléfono eso es la pestaña muerta sin ningún
 * mensaje. Es mejor decir que no con una frase que lo explique.
 *
 * El aviso a los 20 MB existe porque ahí ya se nota la espera y conviene que no
 * parezca que se colgó.
 */
export const MAX_FILE_BYTES = 80 * 1024 * 1024
export const BIG_FILE_BYTES = 20 * 1024 * 1024

/** Las extensiones que se reconocen, y a qué lector va cada una. */
const FORMATS = {
  zip: "shapefile-zip",
  shp: "shapefile",
  kml: "kml",
  kmz: "kmz",
  dxf: "dxf",
  dwg: "dwg",
  geojson: "geojson",
  json: "geojson",
  gpx: "gpx",
}

/** Los acompañantes de un shapefile: no son capas, son partes de una. */
const SIDECARS = new Set(["dbf", "prj", "cpg", "shx", "sbn", "sbx", "qpj", "xml"])

export const extensionOf = (fileName = "") => {
  const base = String(fileName).split(/[\\/]/).pop() || ""
  const punto = base.lastIndexOf(".")
  return punto === -1 ? "" : base.slice(punto + 1).toLowerCase()
}

export const baseNameOf = (fileName = "") => {
  const base = String(fileName).split(/[\\/]/).pop() || ""
  return base.replace(/\.[^.]+$/, "")
}

/**
 * Qué formato es, por la extensión.
 *
 * Por la extensión y no por el contenido a propósito: un shapefile y un DXF son
 * los dos «un archivo binario que empieza por algo», y el usuario sí sabe qué
 * exportó. Lo que no se hace es *fingir* que se reconoce lo que no: un `.dwg`
 * —el formato propio de AutoCAD, cerrado y sin lector libre— se detecta para
 * poder decir por qué no se puede abrir y qué hacer, que es exportarlo a DXF.
 */
export const detectFormat = (fileName) => FORMATS[extensionOf(fileName)] ?? null

export const ACCEPTED_EXTENSIONS = ".zip,.shp,.dbf,.prj,.cpg,.kml,.kmz,.dxf,.geojson,.json,.gpx"

/**
 * Agrupa una selección de archivos en capas por cargar.
 *
 * Existe por el shapefile, que **no es un archivo sino cuatro**: la geometría
 * (`.shp`), los atributos (`.dbf`), el sistema de coordenadas (`.prj`) y la
 * codificación del texto (`.cpg`). Quien lo manda comprimido en un `.zip` no
 * tiene que saberlo; quien selecciona los cuatro a mano en el diálogo tampoco
 * debería, y por eso se juntan por nombre en vez de cargarse como cuatro capas
 * —tres de ellas ilegibles—.
 *
 * Un acompañante que llega **solo**, sin su `.shp`, se reporta como problema y no
 * se ignora en silencio: es el error más común al cargar un shapefile a mano
 * (seleccionar solo el `.dbf` porque es el que tiene «los datos») y merece la
 * frase que lo explica.
 *
 * @param {Array<{name: string, size?: number}>} files
 */
export const groupFiles = (files = []) => {
  const grupos = []
  const problemas = []
  const porNombre = new Map()

  Array.from(files).forEach((file) => {
    const ext = extensionOf(file.name)
    if (SIDECARS.has(ext)) {
      const base = baseNameOf(file.name)
      const acompañantes = porNombre.get(base) ?? {}
      acompañantes[ext] = file
      porNombre.set(base, acompañantes)
      return
    }

    const format = detectFormat(file.name)
    if (!format) {
      problemas.push({
        name: file.name,
        message: `No se reconoce la extensión «.${ext || "?"}». Se pueden cargar shapefile (.zip o .shp), KML/KMZ, DXF, GeoJSON y GPX.`,
      })
      return
    }

    grupos.push({ format, file, sidecars: {} })
  })

  // Los acompañantes se reparten al final: en un `FileList` el `.dbf` puede
  // venir antes que su `.shp`, y al revés.
  grupos.forEach((grupo) => {
    if (grupo.format !== "shapefile") return
    grupo.sidecars = porNombre.get(baseNameOf(grupo.file.name)) ?? {}
    porNombre.delete(baseNameOf(grupo.file.name))
  })

  porNombre.forEach((acompañantes, base) => {
    const nombres = Object.keys(acompañantes)
      .map((ext) => `.${ext}`)
      .join(", ")
    problemas.push({
      name: `${base} (${nombres})`,
      message:
        "Falta el archivo .shp, que es el que lleva la geometría. Selecciona los cuatro archivos del shapefile a la vez, o comprímelos en un .zip.",
    })
  })

  return { grupos, problemas }
}

/**
 * Texto de un archivo, decidiendo la codificación.
 *
 * **Se intenta UTF-8 en modo estricto y se cae a Windows-1252 si falla.** No es
 * una precaución teórica: AutoCAD y las herramientas viejas de Windows escriben
 * en la codificación local, así que un DXF con una capa llamada «LINDERO
 * QUEBRADA LA CEIBA — SEÑALES» leído como UTF-8 sale con rombos negros donde van
 * las tildes y la ñ. Con `fatal: true`, UTF-8 **lanza** ante un byte imposible,
 * que es justo la señal que hace falta; sin esa opción, `TextDecoder` sustituye
 * el byte por un signo de interrogación y no hay forma de saber que se eligió
 * mal.
 */
export const decodeText = (buffer) => {
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(buffer)
  } catch {
    return new TextDecoder("windows-1252").decode(buffer)
  }
}

/**
 * Cualquier cosa que se parezca a GeoJSON, convertida en una colección.
 *
 * Los servicios y los programas entregan las cinco variantes que admite el
 * formato —una colección, una figura sola, una geometría pelada, una colección de
 * geometrías— y todas son GeoJSON válido. Sin esto, un archivo con una sola
 * geometría se cargaba «sin figuras», que es indistinguible de un archivo vacío.
 *
 * Las figuras sin geometría se descartan: son válidas en el formato (una fila de
 * atributos sin ubicación) y no hay nada que dibujar con ellas.
 */
export const normalizeFeatureCollection = (raw) => {
  if (!raw || typeof raw !== "object") return null

  const envolver = (features) => ({
    type: "FeatureCollection",
    features: features.filter((f) => f?.geometry?.type),
  })

  if (raw.type === "FeatureCollection" && Array.isArray(raw.features)) {
    return envolver(
      raw.features.map((f) => ({
        type: "Feature",
        geometry: f?.geometry ?? null,
        properties: f?.properties ?? {},
      })),
    )
  }

  if (raw.type === "Feature") {
    return envolver([{ type: "Feature", geometry: raw.geometry ?? null, properties: raw.properties ?? {} }])
  }

  if (raw.type === "GeometryCollection" && Array.isArray(raw.geometries)) {
    return envolver(raw.geometries.map((g) => ({ type: "Feature", geometry: g, properties: {} })))
  }

  if (typeof raw.type === "string" && Array.isArray(raw.coordinates)) {
    return envolver([{ type: "Feature", geometry: raw, properties: {} }])
  }

  return null
}

/** Los lectores que se traen a demanda. Uno por librería, para no pedir tres. */
const cargarShpjs = () => import("shpjs")
const cargarToGeoJson = () => import("@tmcw/togeojson")
const cargarDxfParser = () => import("dxf-parser")
const cargarJsZip = () => import("jszip")

const leerTexto = async (file) => decodeText(await file.arrayBuffer())

/**
 * El XML de un KML o un GPX, ya en árbol.
 *
 * Con el `DOMParser` del navegador y no con una librería de XML: el navegador ya
 * trae un intérprete de XML probado contra todo lo que hay en internet, y
 * `@tmcw/togeojson` está escrito para recibir precisamente eso.
 *
 * **Un XML mal formado no lanza**: `DOMParser` devuelve un documento con un
 * `<parsererror>` dentro. Sin mirarlo, un KML cortado a la mitad se cargaba como
 * una capa vacía y sin explicación.
 */
const parsearXml = (texto, queEs) => {
  const doc = new DOMParser().parseFromString(texto, "application/xml")
  if (doc.getElementsByTagName("parsererror").length > 0) {
    throw new Error(`El ${queEs} está mal formado y no se pudo interpretar.`)
  }
  return doc
}

/**
 * De un `.kmz` al `.kml` que lleva dentro.
 *
 * Un KMZ es un zip con un KML y sus adornos —iconos, imágenes de fondo—. Se busca
 * `doc.kml`, que es el nombre que pone Google Earth, y si no está, el primer
 * `.kml` que aparezca: los que salen de otros programas se llaman de cualquier
 * manera.
 */
const kmlDentroDelKmz = async (file) => {
  const { default: JSZip } = await cargarJsZip()
  const zip = await JSZip.loadAsync(await file.arrayBuffer())
  const nombres = Object.keys(zip.files).filter((n) => n.toLowerCase().endsWith(".kml"))
  const elegido = nombres.find((n) => n.toLowerCase().endsWith("doc.kml")) ?? nombres[0]
  if (!elegido) throw new Error("El KMZ no lleva ningún archivo .kml dentro.")
  return zip.files[elegido].async("string")
}

/**
 * Lee un grupo de archivos y devuelve las capas que salen de él.
 *
 * Devuelve una lista y no una capa porque un `.zip` puede traer varios
 * shapefiles —es la forma normal de mandar «las capas del proyecto»— y cada uno
 * es una capa distinta con su propio nombre.
 *
 * `crs` en la respuesta es el sistema que el propio archivo declara: `"4686"`
 * cuando se sabe que salieron coordenadas geográficas —un KML lo es por
 * definición, y un shapefile con `.prj` lo reproyecta la librería— y `null`
 * cuando el archivo no dice nada, que es el caso del DXF. Quien resuelve ese
 * `null` es `userLayers.guessSourceCrs`.
 */
const leerGrupo = async (grupo) => {
  const { file, format, sidecars } = grupo
  const avisos = []

  if (file.size > MAX_FILE_BYTES) {
    throw new Error(
      `El archivo pesa ${Math.round(file.size / 1024 / 1024)} MB y el tope es ${Math.round(
        MAX_FILE_BYTES / 1024 / 1024,
      )} MB. Recorta el área en tu SIG y vuelve a exportarlo.`,
    )
  }
  if (file.size > BIG_FILE_BYTES) {
    avisos.push("Es un archivo grande: dibujarlo puede tardar unos segundos y va a ir lento al navegar.")
  }

  if (format === "dwg") {
    throw new Error(
      "El .dwg es el formato propio de AutoCAD y no hay forma de abrirlo en un navegador. " +
        "Ábrelo en tu CAD y guárdalo como DXF (Archivo → Guardar como → DXF); ese sí se carga.",
    )
  }

  if (format === "geojson") {
    const coleccion = normalizeFeatureCollection(JSON.parse(await leerTexto(file)))
    if (!coleccion) throw new Error("El archivo no tiene la forma de un GeoJSON.")
    return [{ name: file.name, featureCollection: coleccion, crs: "4686", warnings: avisos }]
  }

  if (format === "kml" || format === "kmz") {
    const texto = format === "kmz" ? await kmlDentroDelKmz(file) : await leerTexto(file)
    const { kml } = await cargarToGeoJson()
    const coleccion = normalizeFeatureCollection(kml(parsearXml(texto, "KML")))
    if (!coleccion) throw new Error("No se pudo interpretar el KML.")
    // Un KML puede llevar dentro superposiciones de imagen (GroundOverlay) y
    // modelos 3D, que no son figuras y se quedan fuera. Decirlo evita que alguien
    // busque en el mapa la imagen que acaba de cargar.
    if (texto.includes("<GroundOverlay")) {
      avisos.push("El KML lleva imágenes superpuestas (GroundOverlay): solo se cargan sus figuras, no las imágenes.")
    }
    return [{ name: file.name, featureCollection: coleccion, crs: "4686", warnings: avisos }]
  }

  if (format === "gpx") {
    const { gpx } = await cargarToGeoJson()
    const coleccion = normalizeFeatureCollection(gpx(parsearXml(await leerTexto(file), "GPX")))
    if (!coleccion) throw new Error("No se pudo interpretar el GPX.")
    return [{ name: file.name, featureCollection: coleccion, crs: "4686", warnings: avisos }]
  }

  if (format === "dxf") {
    const { default: DxfParser } = await cargarDxfParser()
    const parsed = new DxfParser().parseSync(await leerTexto(file))
    const { features, skipped } = dxfToFeatures(parsed)
    const noLeido = describeSkipped(skipped)
    if (noLeido) avisos.push(noLeido)
    if (features.length === 0) {
      throw new Error(
        `No salió ninguna figura del CAD. ${noLeido ?? "El archivo no trae líneas, polilíneas ni puntos."}`,
      )
    }
    return [
      {
        name: file.name,
        featureCollection: { type: "FeatureCollection", features },
        // Un DXF no dice en qué sistema está. Ni uno.
        crs: null,
        warnings: avisos,
      },
    ]
  }

  // Shapefile comprimido: se descomprime aquí y se le entregan a la librería las
  // cuatro partes de cada capa.
  //
  // **Y no se le da el zip entero, que es lo que sabe hacer por sí sola.** Su
  // descompresor usa `DecompressionStream`, que es reciente: en un navegador de
  // hace unos años, y en las pruebas de este proyecto, no existe. Ahí la librería
  // no falla con un mensaje, falla intentando llamar a algo que es `undefined`.
  // `jszip` ya está en el proyecto —lo usa la descarga por área—, trae su propio
  // inflado y funciona en todas partes. De paso se gana lo que aquella no da: un
  // `.zip` con tres shapefiles dentro entra como tres capas **con su nombre**, en
  // vez de tres llamadas igual que el zip.
  if (format === "shapefile-zip") {
    const { default: JSZip } = await cargarJsZip()
    const zip = await JSZip.loadAsync(await file.arrayBuffer())

    const nombres = Object.keys(zip.files).filter(
      (nombre) => /\.shp$/i.test(nombre) && !nombre.includes("__MACOSX"),
    )
    if (nombres.length === 0) {
      throw new Error(
        "El .zip no lleva ningún archivo .shp dentro. Comprueba que comprimiste el shapefile y no otra cosa.",
      )
    }

    const shp = (await cargarShpjs()).default
    const capas = []

    for (const nombre of nombres) {
      const base = nombre.replace(/\.shp$/i, "").toLowerCase()
      const parte = async (ext) => {
        const clave = Object.keys(zip.files).find((n) => n.toLowerCase() === `${base}.${ext}`)
        return clave ? zip.files[clave].async("arraybuffer") : undefined
      }

      const prj = await parte("prj")
      const propios = [...avisos]
      if (!prj) {
        propios.push("El shapefile no trae .prj, así que no dice en qué sistema de coordenadas está.")
      }

      const coleccion = normalizeFeatureCollection(
        await shp({
          shp: await zip.files[nombre].async("arraybuffer"),
          dbf: await parte("dbf"),
          cpg: await parte("cpg"),
          prj,
        }),
      )
      if (!coleccion) continue

      capas.push({
        name: nombre.split("/").pop(),
        featureCollection: coleccion,
        // Con `.prj`, la librería ya reproyectó a geográficas. Sin él, los
        // números son los del archivo. Ojo: cuando proj4 no entiende el `.prj`
        // que hay, la librería **deja las coordenadas como estaban sin avisar**,
        // y eso no se puede saber desde aquí — lo detecta después
        // `looksGeographic` mirando los números.
        crs: prj ? "4686" : null,
        warnings: propios,
      })
    }

    return capas
  }

  // Shapefile con sus acompañantes al lado, seleccionados a mano.
  const shp = (await cargarShpjs()).default

  if (!sidecars.dbf) {
    avisos.push("Sin el archivo .dbf al lado, la capa entra sin atributos: solo la geometría.")
  }
  if (!sidecars.prj) {
    avisos.push("Sin el archivo .prj, el shapefile no dice en qué sistema de coordenadas está.")
  }

  const coleccion = normalizeFeatureCollection(
    await shp({
      shp: await file.arrayBuffer(),
      dbf: sidecars.dbf ? await sidecars.dbf.arrayBuffer() : undefined,
      prj: sidecars.prj ? await sidecars.prj.arrayBuffer() : undefined,
      cpg: sidecars.cpg ? await sidecars.cpg.arrayBuffer() : undefined,
    }),
  )
  if (!coleccion) throw new Error("No se pudo interpretar el shapefile.")

  return [
    {
      name: file.name,
      featureCollection: coleccion,
      crs: sidecars.prj ? "4686" : null,
      warnings: avisos,
    },
  ]
}

/**
 * Lee todo lo que el usuario seleccionó.
 *
 * Nunca lanza: un archivo que falla no puede impedir que entren los otros tres
 * que sí se leyeron. Cada fallo vuelve como un problema con su nombre y su frase,
 * que es lo que el panel enseña.
 *
 * @param {Array<{name: string, size?: number}>} files lo que entrega el diálogo o el arrastre
 * @returns {Promise<{layers: object[], problems: {name: string, message: string}[]}>}
 */
export const readGeoFiles = async (files) => {
  const { grupos, problemas } = groupFiles(files)
  const layers = []
  const problems = [...problemas]

  for (const grupo of grupos) {
    try {
      const leidas = await leerGrupo(grupo)
      if (leidas.length === 0) {
        problems.push({ name: grupo.file.name, message: "El archivo no trae ninguna capa." })
        continue
      }
      leidas.forEach((capa) => {
        if (capa.featureCollection.features.length === 0) {
          problems.push({ name: capa.name, message: "La capa está vacía: no trae ninguna figura." })
          return
        }
        layers.push(capa)
      })
    } catch (error) {
      problems.push({
        name: grupo.file.name,
        message: error?.message || "No se pudo leer el archivo.",
      })
    }
  }

  return { layers, problems }
}
