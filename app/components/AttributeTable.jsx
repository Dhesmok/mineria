"use client"

import { useEffect, useMemo, useState } from "react"
import { ArrowUpDown, ChevronLeft, ChevronRight, Crosshair, X } from "lucide-react"

import { layerByKey } from "../utils/themeAreas"
import { formatDate } from "../utils/mapUtils"

export const PAGE_SIZE = 50

/**
 * La tabla de resultados, como la tabla de atributos de un SIG de escritorio.
 *
 * Sirve para lo que un mapa no sirve: leer de corrido lo que hay, ordenarlo por
 * una columna y encontrar un expediente entre doscientos. **Al pulsar una fila
 * la tabla se cierra y el mapa vuela hasta ese polígono**, que es el gesto que
 * une las dos vistas: se busca en la lista y se mira en el mapa.
 *
 * Enseña exactamente lo que el filtro dejó pasar, ni más ni menos. Si el filtro
 * está en "toda la capa", eso incluye polígonos que ni siquiera están en
 * pantalla, y llegar a ellos por la tabla es justamente la gracia.
 */

/** Las columnas, con el respaldo entre nombres que usa cada capa de la ANM. */
const COLUMNS = [
  {
    key: "expediente",
    label: "Expediente",
    width: "w-28",
    read: (p) => p.CODIGO_EXPEDIENTE || p.TENURE_ID || "—",
  },
  {
    key: "estado",
    label: "Estado",
    width: "w-24",
    read: (p) => p.TITULO_ESTADO || p.STATUS || p.ESTADO || "—",
  },
  { key: "modalidad", label: "Modalidad", width: "w-40", read: (p) => p.MODALIDAD || "—" },
  { key: "etapa", label: "Etapa", width: "w-32", read: (p) => p.ETAPA || "—" },
  {
    key: "area",
    label: "Área (ha)",
    width: "w-24",
    numeric: true,
    read: (p) => (Number.isFinite(Number(p.AREA_HA)) ? Number(p.AREA_HA) : null),
    show: (v) => (v === null ? "—" : v.toLocaleString("es", { maximumFractionDigits: 2 })),
  },
  {
    key: "titular",
    label: "Titular",
    width: "w-48",
    read: (p) => p.SOLICITANTES_O_TITULARES || p.NOMBRE_DE_TITULAR || "—",
  },
  {
    key: "expedicion",
    label: "Expedición",
    width: "w-28",
    // `formatDate` devuelve "N/A" cuando no hay fecha, y en una tabla donde
    // todas las demás columnas ponen una raya, ese "N/A" suelto parecía un dato.
    read: (p) => {
      const fecha = formatDate(p.FECHA_DE_EXPEDICION)
      return fecha === "N/A" ? "—" : fecha
    },
  },
]

export const AttributeTable = ({ features, onPick, onClose }) => {
  const [sort, setSort] = useState({ column: "expediente", asc: true })
  const [page, setPage] = useState(1)

  useEffect(() => {
    const escape = (event) => {
      if (event.key === "Escape") onClose()
    }
    document.addEventListener("keydown", escape)
    return () => document.removeEventListener("keydown", escape)
  }, [onClose])

  // Al ordenar o cambiar el conjunto de datos volvemos a la primera página
  useEffect(() => {
    setPage(1)
  }, [features, sort])

  const rows = useMemo(() => {
    const columna = COLUMNS.find((c) => c.key === sort.column) ?? COLUMNS[0]

    return [...features]
      .map((feature, index) => ({ ...feature, index }))
      .sort((a, b) => {
        const va = columna.read(a.properties)
        const vb = columna.read(b.properties)

        // Los números se comparan como números; el resto, respetando acentos y
        // eñes, que es lo que hace `localeCompare` con "es".
        const cmp = columna.numeric
          ? (va ?? -Infinity) - (vb ?? -Infinity)
          : String(va).localeCompare(String(vb), "es")
        return sort.asc ? cmp : -cmp
      })
  }, [features, sort])

  const totalPages = Math.max(1, Math.ceil(rows.length / PAGE_SIZE))
  const currentPage = Math.min(page, totalPages)

  const visibleRows = useMemo(() => {
    const start = (currentPage - 1) * PAGE_SIZE
    return rows.slice(start, start + PAGE_SIZE)
  }, [rows, currentPage])

  const ordenarPor = (key) =>
    setSort((current) => ({ column: key, asc: current.column === key ? !current.asc : true }))

  return (
    <div className="fixed inset-0 z-40 flex items-end justify-center bg-slate-900/30 backdrop-blur-[2px]">
      <div className="flex h-[70vh] w-full max-w-5xl flex-col overflow-hidden rounded-t-xl border border-slate-200 bg-white shadow-2xl">
        <div className="flex items-center gap-3 border-b border-slate-200 px-4 py-3">
          <h2 className="text-[15px] font-semibold text-slate-900">Resultados</h2>
          <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-medium text-slate-600">
            {features.length === 1 ? "1 registro" : `${features.length} registros`}
          </span>
          <span className="flex-1" />
          <span className="hidden text-[11px] text-slate-500 sm:block">
            Pulsa una fila para verla en el mapa
          </span>
          <button
            type="button"
            onClick={onClose}
            aria-label="Cerrar la tabla"
            className="rounded-md p-1.5 text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-900"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="flex-1 overflow-auto">
          {features.length === 0 ? (
            <p className="px-4 py-10 text-center text-[13px] text-slate-500">
              El filtro no dejó pasar ningún registro.
            </p>
          ) : (
            <table className="w-full border-collapse text-[13px]">
              <thead className="sticky top-0 z-10 bg-slate-50">
                <tr>
                  {COLUMNS.map((columna) => (
                    <th
                      key={columna.key}
                      scope="col"
                      className={`${columna.width} border-b border-slate-200 px-3 py-2 text-left font-medium text-slate-600`}
                    >
                      <button
                        type="button"
                        onClick={() => ordenarPor(columna.key)}
                        className="flex items-center gap-1 transition-colors hover:text-slate-900"
                      >
                        {columna.label}
                        <ArrowUpDown
                          className={`h-3 w-3 ${
                            sort.column === columna.key ? "text-slate-900" : "text-slate-300"
                          }`}
                        />
                      </button>
                    </th>
                  ))}
                  <th scope="col" className="w-10 border-b border-slate-200" />
                </tr>
              </thead>
              <tbody>
                {visibleRows.map((row) => {
                  const capa = layerByKey(row.layerKey)
                  return (
                    <tr
                      key={`${row.layerKey}-${row.index}`}
                      onClick={() => onPick(row)}
                      title="Ver este polígono en el mapa"
                      className="cursor-pointer border-b border-slate-100 transition-colors hover:bg-blue-50"
                    >
                      {COLUMNS.map((columna) => {
                        const valor = columna.read(row.properties)
                        return (
                          <td
                            key={columna.key}
                            className={`truncate px-3 py-2 ${
                              columna.numeric ? "text-right tabular-nums" : ""
                            } text-slate-700`}
                          >
                            {columna.key === "expediente" ? (
                              <span className="flex items-center gap-2">
                                <span
                                  className="h-2.5 w-2.5 shrink-0 rounded-[2px]"
                                  style={{
                                    backgroundColor: capa?.fillColor,
                                    border: `1px solid ${capa?.lineColor}`,
                                  }}
                                />
                                <span className="font-medium text-slate-900">
                                  {columna.show ? columna.show(valor) : valor}
                                </span>
                              </span>
                            ) : columna.show ? (
                              columna.show(valor)
                            ) : (
                              valor
                            )}
                          </td>
                        )
                      })}
                      <td className="px-2 text-slate-300">
                        <Crosshair className="h-3.5 w-3.5" />
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          )}
        </div>

        {features.length > PAGE_SIZE && (
          <div className="flex items-center justify-between border-t border-slate-200 bg-slate-50 px-4 py-2 text-xs text-slate-600">
            <span>
              Mostrando{" "}
              <strong className="font-medium text-slate-900">
                {(currentPage - 1) * PAGE_SIZE + 1}
              </strong>
              –
              <strong className="font-medium text-slate-900">
                {Math.min(currentPage * PAGE_SIZE, rows.length)}
              </strong>{" "}
              de{" "}
              <strong className="font-medium text-slate-900">
                {rows.length.toLocaleString("es")}
              </strong>{" "}
              registros
            </span>
            <div className="flex items-center gap-1.5">
              <button
                type="button"
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={currentPage <= 1}
                aria-label="Página anterior"
                className="flex items-center gap-1 rounded border border-slate-200 bg-white px-2.5 py-1 font-medium transition-colors hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-40"
              >
                <ChevronLeft className="h-3.5 w-3.5" />
                <span>Anterior</span>
              </button>
              <span className="px-2 font-medium text-slate-700">
                {currentPage} / {totalPages}
              </span>
              <button
                type="button"
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                disabled={currentPage >= totalPages}
                aria-label="Página siguiente"
                className="flex items-center gap-1 rounded border border-slate-200 bg-white px-2.5 py-1 font-medium transition-colors hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-40"
              >
                <span>Siguiente</span>
                <ChevronRight className="h-3.5 w-3.5" />
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
