"use client"

import { useRef, useState } from "react"
import { AlertTriangle, Crosshair, FolderOpen, Loader2, Trash2, X } from "lucide-react"

import { ACCEPTED_EXTENSIONS } from "../utils/fileImport"
import { crsById } from "../utils/crs"
import { CrsPicker } from "./CrsPicker"

/**
 * Cargar archivos propios al visor, y la ficha de cada uno ya cargado.
 *
 * Es la parte del panel donde entran los datos que no son de ningún servicio del
 * Estado: el shapefile del plano de topografía, el KML que mandó el geólogo de
 * campo, el DXF del lindero. Ver `utils/fileImport.js` para lo que se lee y
 * `utils/userLayers.js` para cómo se decide dónde va.
 *
 * Dos cosas que no son adorno:
 *
 * - **Se puede arrastrar el archivo encima.** Es el gesto que espera cualquiera
 *   que venga de un SIG de escritorio, y el diálogo de archivos sigue estando
 *   para quien prefiera pulsar. Arrastrar sin más sobre el navegador **abre el
 *   archivo en una pestaña nueva** y se pierde el visor entero con lo que hubiera
 *   dibujado: de ahí el `preventDefault` en los dos eventos, no solo en el de
 *   soltar.
 *
 * - **El sistema de coordenadas se enseña siempre**, y en ámbar cuando es una
 *   suposición. Un plano colocado en el sitio equivocado es peor que un plano sin
 *   colocar: se ve verosímil, se compara con los títulos y la conclusión sale mal.
 *   Es la trampa nº 34 de CLAUDE.md, y aquí la única defensa es que se vea de qué
 *   se está dudando.
 */

/** El texto que explica qué se puede cargar. Se repite en dos sitios, va una vez. */
const QUE_SE_PUEDE = "Shapefile (.zip o .shp+.dbf+.prj), KML, KMZ, DXF, GeoJSON o GPX"

export const UserLayerImport = ({ loading, problems = [], onFiles, onDismissProblems, hasLayers }) => {
  const inputRef = useRef(null)
  const [encima, setEncima] = useState(false)

  const elegir = () => inputRef.current?.click()

  const soltar = (event) => {
    event.preventDefault()
    setEncima(false)
    const archivos = event.dataTransfer?.files
    if (archivos?.length) onFiles(archivos)
  }

  return (
    <div
      onDragOver={(event) => {
        // Sin esto, el navegador se queda el archivo y abre el DXF en una
        // pestaña: el visor desaparece con todo lo que hubiera encendido.
        event.preventDefault()
        setEncima(true)
      }}
      onDragLeave={() => setEncima(false)}
      onDrop={soltar}
      className={`border-b border-zinc-800/50 px-3 py-2.5 transition-colors ${
        encima ? "bg-sky-950/40 ring-1 ring-inset ring-sky-500/60" : "bg-zinc-950/40"
      }`}
    >
      <input
        ref={inputRef}
        type="file"
        multiple
        accept={ACCEPTED_EXTENSIONS}
        className="hidden"
        aria-label="Elegir archivos para cargar en el mapa"
        onChange={(event) => {
          const archivos = event.target.files
          if (archivos?.length) onFiles(archivos)
          // Se vacía para que volver a elegir el mismo archivo dispare el evento:
          // un `input` de archivos no avisa si el valor no cambió, y recargar el
          // plano que se acaba de corregir es justo lo que uno hace.
          event.target.value = ""
        }}
      />

      <button
        type="button"
        onClick={elegir}
        disabled={loading}
        className="flex w-full items-center justify-center gap-2 rounded-lg border border-dashed border-zinc-700 bg-zinc-900/60 px-3 py-2 text-[12px] font-medium text-zinc-200 transition-colors hover:border-zinc-500 hover:bg-zinc-800/80 disabled:cursor-wait disabled:opacity-60"
      >
        {loading ? (
          <>
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
            Leyendo archivos…
          </>
        ) : (
          <>
            <FolderOpen className="h-3.5 w-3.5" />
            {hasLayers ? "Cargar otro archivo" : "Cargar un archivo"}
          </>
        )}
      </button>

      <p className="mt-1.5 text-[10.5px] leading-tight text-zinc-500">
        {QUE_SE_PUEDE}. También se pueden arrastrar aquí. Los archivos se leen en tu navegador y no
        se suben a ningún servidor.
      </p>

      {problems.length > 0 && (
        <div className="mt-2 rounded-lg border border-rose-900/60 bg-rose-950/30 p-2">
          <div className="flex items-start justify-between gap-2">
            <p className="text-[11px] font-semibold text-rose-200">
              {problems.length === 1 ? "Un archivo no se pudo cargar" : `${problems.length} archivos no se pudieron cargar`}
            </p>
            <button
              type="button"
              onClick={onDismissProblems}
              aria-label="Descartar los avisos"
              className="shrink-0 rounded p-0.5 text-rose-300/80 transition-colors hover:bg-rose-900/40 hover:text-rose-100"
            >
              <X className="h-3 w-3" />
            </button>
          </div>
          <ul className="mt-1 space-y-1">
            {problems.map((problema, i) => (
              <li key={`${problema.name}-${i}`} className="text-[10.5px] leading-tight text-rose-100/90">
                <span className="font-mono text-rose-200">{problema.name}</span>: {problema.message}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  )
}

/**
 * La tira que va debajo de la fila de una capa cargada.
 *
 * Lleva lo que no cabe en la fila y hace falta de todas formas: qué trae el
 * archivo, en qué sistema se está dibujando, los avisos de la lectura, y los dos
 * botones que solo tienen sentido en una capa propia —llevar el mapa hasta ella y
 * quitarla—.
 *
 * **«Encuadrar» no es una comodidad.** Un archivo puede estar en cualquier parte
 * del país, y el visor abre en el centro de Colombia a zoom 5: una capa cargada
 * correctamente puede quedar a dos pantallas de distancia, y sin un botón que
 * lleve hasta ella lo que se ve es que «no cargó».
 */
export const UserLayerDetails = ({ layer, onRemove, onFocus, onChooseCrs }) => {
  const [crsAnchor, setCrsAnchor] = useState(null)
  const crs = crsById(layer.crsId)
  const avisos = [
    ...(layer.warnings ?? []),
    ...(layer.farFromColombia
      ? ["La capa queda fuera de Colombia. Si no es un plano de otro país, el sistema de coordenadas no es el que se está usando."]
      : []),
  ]

  return (
    <div className="border-b border-zinc-800/40 bg-zinc-950/60 px-3 pb-2 pl-11">
      <div className="flex items-center gap-2">
        <span className="min-w-0 flex-1 truncate text-[10.5px] text-zinc-400" title={layer.source}>
          {layer.hint} · <span className="font-mono">{layer.source}</span>
        </span>

        <button
          type="button"
          onClick={() => onFocus(layer)}
          disabled={!layer.bbox}
          title="Llevar el mapa hasta esta capa"
          aria-label={`Encuadrar ${layer.label}`}
          className="shrink-0 rounded p-1 text-zinc-400 transition-colors hover:bg-zinc-800 hover:text-zinc-100 disabled:opacity-30"
        >
          <Crosshair className="h-3.5 w-3.5" />
        </button>
        <button
          type="button"
          onClick={() => onRemove(layer.key)}
          title="Quitar esta capa del visor"
          aria-label={`Quitar ${layer.label}`}
          className="shrink-0 rounded p-1 text-zinc-400 transition-colors hover:bg-rose-950/50 hover:text-rose-300"
        >
          <Trash2 className="h-3.5 w-3.5" />
        </button>
      </div>

      <button
        type="button"
        onClick={(event) => setCrsAnchor(event.currentTarget)}
        title="Cambiar el sistema de coordenadas en que se leyó el archivo"
        className={`mt-1 flex w-full items-center gap-1.5 rounded border px-1.5 py-1 text-left text-[10.5px] transition-colors ${
          layer.crsGuessed
            ? "border-amber-700/70 bg-amber-950/40 text-amber-100 hover:bg-amber-900/40"
            : "border-zinc-800 bg-zinc-900/60 text-zinc-300 hover:bg-zinc-800/80"
        }`}
      >
        {layer.crsGuessed && <AlertTriangle className="h-3 w-3 shrink-0 text-amber-400" />}
        <span className="min-w-0 flex-1 truncate">
          {crs.label}
          {layer.crsGuessed ? " (supuesto)" : ""}
        </span>
        <span className="shrink-0 font-mono text-[9.5px] opacity-70">EPSG:{layer.crsId}</span>
      </button>

      {avisos.map((aviso, i) => (
        <p key={i} className="mt-1 text-[10px] leading-tight text-amber-200/80">
          {aviso}
        </p>
      ))}

      {crsAnchor && (
        <CrsPicker
          current={layer.crsId}
          anchorRect={crsAnchor.getBoundingClientRect()}
          anchorEl={crsAnchor}
          onChoose={(crsId) => onChooseCrs(layer.key, crsId)}
          onClose={() => setCrsAnchor(null)}
        />
      )}
    </div>
  )
}
