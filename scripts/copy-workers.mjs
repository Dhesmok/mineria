import { copyFile, mkdir, readFile, writeFile } from "node:fs/promises"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"

/**
 * Copia a `public/` los workers de las librerías que los usan.
 *
 * Por qué hace falta: tanto MapLibre como pdf.js localizan su propio worker con
 * `import.meta.url`, dando por hecho que el paquete se sirve tal cual está en
 * disco. Al empaquetar con webpack —que es lo que hace Next— ese valor pasa a
 * apuntar al bundle, no a la carpeta del paquete, y el worker nunca arranca. El
 * síntoma es de los peores: ni un error en consola, simplemente las capas
 * GeoJSON se quedan cargando para siempre, porque teselarlas es precisamente
 * el trabajo del worker.
 *
 * De MapLibre se copian dos archivos, no uno: el worker importa
 * `maplibre-gl-shared.mjs` por ruta relativa, así que tienen que quedar en la
 * misma carpeta.
 *
 * Se generan en cada `npm run dev` y cada `npm run build` en vez de estar
 * versionados, para que no puedan quedar desfasados respecto a la versión que
 * haya instalada.
 */

const here = dirname(fileURLToPath(import.meta.url))
const root = join(here, "..")

/** Cada librería, con su carpeta de origen, su destino y sus archivos. */
const WORKERS = [
  {
    nombre: "MapLibre",
    from: join(root, "node_modules", "maplibre-gl", "dist"),
    to: join(root, "public", "maplibre"),
    files: ["maplibre-gl-worker.mjs", "maplibre-gl-shared.mjs"],
  },
  {
    nombre: "pdf.js",
    from: join(root, "node_modules", "pdfjs-dist", "build"),
    to: join(root, "public", "pdfjs"),
    files: ["pdf.worker.min.mjs"],
  },
]

for (const { nombre, from, to, files } of WORKERS) {
  await mkdir(to, { recursive: true })

  for (const file of files) {
    const source = join(from, file)
    const contents = await readFile(source, "utf8")
    // Se le quita la referencia al sourcemap: esos archivos no se copian —pesan
    // varios megas— y sin quitarla el navegador pide un 404 en cada carga.
    const limpio = contents.replace(/^\/\/# sourceMappingURL=.*$/m, "")
    if (limpio === contents) await copyFile(source, join(to, file))
    else await writeFile(join(to, file), limpio)
  }

  console.log(`Worker de ${nombre} copiado a ${to.replace(root, ".")} (${files.join(", ")})`)
}
