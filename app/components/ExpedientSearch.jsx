"use client"

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { Loader2, Search, X } from "lucide-react"

import { fetchArcgisJson } from "../utils/arcgis"
import {
  findTenureLayerNumbers,
  REQUEST_LAYER_NAME,
  TITLE_LAYER_NAME,
  tenureLayerUrl,
} from "../utils/tenureLayers"
import { anchorToViewport, popoverWidth } from "../utils/popoverPosition"
import { debounce } from "@/lib/utils"
import { likePrefixPattern } from "../utils/sqlText"

/**
 * Buscar un expediente de la ANM.
 *
 * Vivía suelto en lo alto del panel, ocupando sitio fijo. Ahora sale de la lupa
 * del área de Minería, porque **solo sirve para esa área**: busca por
 * TENURE_ID y CODIGO_EXPEDIENTE, que son campos de la ANM. Las demás áreas
 * tienen su lupa deshabilitada hasta que sus servicios estén conectados y se
 * sepa por qué se busca en cada una.
 *
 * Toda la lógica de sugerencias se mudó aquí desde `components.jsx`, que tenía
 * ciento cincuenta líneas dedicadas a esto y era donde peor se leían.
 */

const MIN_SUGGESTION_LENGTH = 3
const MAX_SUGGESTIONS = 10

export async function queryExpedientSuggestions(query, signal) {
  const patron = likePrefixPattern(query, MIN_SUGGESTION_LENGTH)
  if (!patron) return []
  const where = `(UPPER(TENURE_ID) LIKE '${patron}' OR UPPER(CODIGO_EXPEDIENTE) LIKE '${patron}')`
  const consulta = `query?where=${encodeURIComponent(where)}&outFields=CODIGO_EXPEDIENTE,TENURE_ID&returnGeometry=false&f=json`

  const layerNumbers = await findTenureLayerNumbers()
  if (signal?.aborted) return []

  const urls = [
    ...[TITLE_LAYER_NAME, REQUEST_LAYER_NAME]
      .map((name) => layerNumbers[name])
      .filter((layerNumber) => layerNumber !== undefined)
      .map((layerNumber) => `${tenureLayerUrl(layerNumber)}/${consulta}`),
    `https://geo.anm.gov.co/webgis/rest/services/ANM/ServiciosANM/MapServer/3/${consulta}`,
    `https://annamineria.anm.gov.co/annageo/rest/services/SIGM/VisorInterno/MapServer/87/${consulta}`,
  ]

  const settled = await Promise.allSettled(
    urls.map((url) => fetchArcgisJson(url, { signal })),
  )
  if (signal?.aborted) return []

  const data = settled.filter((r) => r.status === "fulfilled").map((r) => r.value)
  const encontrados = data.flatMap((d) =>
    (d.features || [])
      .map((f) => f.attributes?.CODIGO_EXPEDIENTE || f.attributes?.TENURE_ID)
      .filter(Boolean),
  )
  if (data.length === 0) throw new Error("No fue posible consultar las capas de sugerencias.")
  return [...new Set(encontrados)].slice(0, MAX_SUGGESTIONS)
}

export const ExpedientSearch = ({
  initialCode = "",
  areaColor = "#8B4A3C",
  onSearch,
  onClose,
  anchorRect,
}) => {
  const [code, setCode] = useState(initialCode)
  const [suggestions, setSuggestions] = useState([])
  const [active, setActive] = useState(-1)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)

  const panelRef = useRef(null)
  const inputRef = useRef(null)
  const abortRef = useRef(null)
  // Elegir una sugerencia cambia el texto, lo que volvía a disparar la consulta
  // y reabría la lista 300 ms después de haberla cerrado.
  //
  // Arranca encendido cuando ya se venía de una búsqueda: al reabrir el buscador
  // el texto es justo el expediente que el usuario acaba de elegir, así que
  // sugerírselo otra vez solo sirve para taparle el botón de buscar.
  const skipNextFetchRef = useRef(Boolean(initialCode))

  useEffect(() => {
    inputRef.current?.focus()
  }, [])

  useEffect(() => {
    const fuera = (event) => {
      if (!panelRef.current?.contains(event.target)) onClose()
    }
    document.addEventListener("mousedown", fuera, true)
    return () => document.removeEventListener("mousedown", fuera, true)
  }, [onClose])

  useEffect(() => () => abortRef.current?.abort(), [])

  const fetchSuggestions = useCallback(async (query) => {
    abortRef.current?.abort()
    const controller = new AbortController()
    abortRef.current = controller

    setLoading(true)
    setError(null)
    try {
      const results = await queryExpedientSuggestions(query, controller.signal)
      if (!controller.signal.aborted) {
        setSuggestions(results)
      }
    } catch (err) {
      if (err?.name === "AbortError" || controller.signal.aborted) return
      console.error("Error al buscar expedientes:", err)
      setError("Error al cargar los expedientes. Inténtalo de nuevo.")
    } finally {
      if (!controller.signal.aborted) setLoading(false)
    }
  }, [])

  // useMemo y no useCallback: lo que se guarda es la función aplazada que
  // devuelve `debounce`, no una función escrita aquí. Y se cancela al
  // desmontar, o una consulta ya programada llegaría a un panel que ya no está.
  const debounced = useMemo(() => debounce((query) => fetchSuggestions(query), 300), [fetchSuggestions])
  useEffect(() => () => debounced.cancel(), [debounced])

  useEffect(() => {
    if (skipNextFetchRef.current) {
      skipNextFetchRef.current = false
      return
    }

    // Con una sola letra, `LIKE 'A%'` barre el dataset nacional entero sin dar
    // nada útil.
    if (code.trim().length < MIN_SUGGESTION_LENGTH) {
      abortRef.current?.abort()
      setSuggestions([])
      setLoading(false)
      return
    }

    debounced(code)
  }, [code, debounced])

  useEffect(() => setActive(-1), [suggestions])

  const buscar = (valor) => {
    const limpio = (valor ?? code).trim()
    if (!limpio) return
    onSearch(limpio.toUpperCase())
    onClose()
  }

  const elegir = (sugerencia) => {
    skipNextFetchRef.current = true
    setCode(sugerencia)
    setSuggestions([])
    buscar(sugerencia)
  }

  const alTeclear = (event) => {
    if (event.key === "Escape") {
      if (suggestions.length > 0) setSuggestions([])
      else onClose()
      return
    }

    if (suggestions.length === 0) {
      if (event.key === "Enter") buscar()
      return
    }

    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault()
      const paso = event.key === "ArrowDown" ? 1 : -1
      setActive((current) => {
        const siguiente = current + paso
        if (siguiente < 0) return suggestions.length - 1
        if (siguiente >= suggestions.length) return 0
        return siguiente
      })
      return
    }

    if (event.key === "Enter") {
      event.preventDefault()
      if (active >= 0) elegir(suggestions[active])
      else buscar()
    }
  }

  const { top, left } = anchorToViewport(
    anchorRect,
    { width: popoverWidth(304, window.innerWidth), height: 320 },
    { width: window.innerWidth, height: window.innerHeight },
  )

  return (
    <div
      ref={panelRef}
      role="dialog"
      aria-label="Buscar expediente"
      style={{ top, left }}
      className="fixed z-50 w-[min(19rem,calc(100vw-1.5rem))] rounded-xl border border-slate-750/80 bg-[#0b1329]/95 text-slate-100 shadow-2xl backdrop-blur-2xl"
    >
      {/* Misma cabecera que la ventana de filtros —punto del color del área,
          título en negrita, X a la derecha—: las dos salen del mismo encabezado
          y verlas distintas hacía pensar que eran cosas de sitios distintos. */}
      <div className="flex items-center gap-2 border-b border-slate-800/80 px-3 py-2.5">
        <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: areaColor }} />
        <span className="text-[13px] font-semibold text-slate-100">Buscar expediente</span>
        <span className="flex-1" />
        <button
          type="button"
          onClick={onClose}
          aria-label="Cerrar la búsqueda"
          className="rounded p-1 text-slate-400 transition-colors hover:bg-slate-800 hover:text-slate-200"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </div>

      <div className="p-3">
        <div className="relative">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <input
            ref={inputRef}
            value={code}
            onChange={(event) => setCode(event.target.value.toUpperCase())}
            onKeyDown={alTeclear}
            placeholder="Ingrese el expediente"
            aria-label="Código del expediente"
            role="combobox"
            autoComplete="off"
            aria-autocomplete="list"
            aria-expanded={suggestions.length > 0}
            aria-controls="sugerencias-expediente"
            className="h-9 w-full rounded-md border border-slate-700/80 bg-slate-900/90 pl-8 pr-8 text-[13px] text-slate-100 outline-none focus:border-sky-500 placeholder:text-slate-500"
          />
          {loading && (
            <Loader2 className="absolute right-2.5 top-1/2 h-4 w-4 -translate-y-1/2 animate-spin text-sky-400" />
          )}
        </div>

        {suggestions.length > 0 && (
          <ul
            id="sugerencias-expediente"
            role="listbox"
            aria-label="Expedientes sugeridos"
            className="mt-1.5 max-h-52 overflow-auto rounded-lg border border-slate-800 bg-slate-950/80"
          >
            {suggestions.map((sugerencia, index) => (
              <li
                key={sugerencia}
                role="option"
                aria-selected={index === active}
                // onMouseDown, no onClick: el clic fuera cierra la lista antes de
                // que llegue el onClick del elemento.
                onMouseDown={(event) => {
                  event.preventDefault()
                  elegir(sugerencia)
                }}
                onMouseEnter={() => setActive(index)}
                className={`cursor-pointer px-3 py-2 text-[13px] ${
                  index === active ? "bg-blue-600/30 text-sky-300 font-medium" : "text-slate-200 hover:bg-slate-800/50"
                }`}
              >
                {sugerencia}
              </li>
            ))}
          </ul>
        )}

        {error && <p className="mt-1.5 text-[11px] text-red-400">{error}</p>}

        <button
          type="button"
          onClick={() => buscar()}
          className="mt-2.5 h-9 w-full rounded-md bg-blue-600 text-[13px] font-medium text-white transition-colors hover:bg-blue-500 shadow-sm"
        >
          Buscar
        </button>
      </div>
    </div>
  )
}
