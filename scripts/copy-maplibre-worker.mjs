import { copyFile, mkdir, readFile, writeFile } from "node:fs/promises"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"

/**
 * Copia el worker de MapLibre a `public/` para poder servirlo desde una
 * dirección conocida.
 *
 * Por qué hace falta: MapLibre 6 localiza su propio worker con
 * `import.meta.url`, dando por hecho que el paquete se sirve tal cual está en
 * disco. Al empaquetar con webpack —que es lo que hace Next— ese valor pasa a
 * apuntar al bundle, no a la carpeta del paquete, y el worker nunca arranca. El
 * síntoma es de los peores: ni un error en consola, simplemente las capas
 * GeoJSON se quedan cargando para siempre, porque teselarlas es precisamente
 * el trabajo del worker.
 *
 * Se copian dos archivos, no uno: el worker importa `maplibre-gl-shared.mjs`
 * por ruta relativa, así que tienen que quedar en la misma carpeta.
 *
 * Se generan en cada `npm run dev` y cada `npm run build` en vez de estar
 * versionados, para que no puedan quedar desfasados respecto a la versión de
 * maplibre-gl que haya instalada.
 */

const here = dirname(fileURLToPath(import.meta.url))
const root = join(here, "..")
const from = join(root, "node_modules", "maplibre-gl", "dist")
const to = join(root, "public", "maplibre")

const FILES = ["maplibre-gl-worker.mjs", "maplibre-gl-shared.mjs"]

await mkdir(to, { recursive: true })

for (const file of FILES) {
  const source = join(from, file)

  if (file.endsWith("-shared.mjs")) {
    // Se le quita la referencia al sourcemap: ese archivo no se copia (pesa
    // varios megas) y sin quitarla el navegador pide un 404 en cada carga.
    const contents = await readFile(source, "utf8")
    await writeFile(join(to, file), contents.replace(/^\/\/# sourceMappingURL=.*$/m, ""))
  } else {
    await copyFile(source, join(to, file))
  }
}

console.log(`Worker de MapLibre copiado a public/maplibre (${FILES.join(", ")})`)
