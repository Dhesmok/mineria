"use client"

import { useState, useRef, useEffect } from "react"
import {
  Globe2,
  ChevronDown,
  Layers,
  Search,
  Blend,
  Download,
  FileArchive,
  ImageDown,
  FileSpreadsheet,
  Check,
  Command,
} from "lucide-react"
import { crsById, CRS_LIST } from "../utils/crs"

/**
 * TopOmniBar: Barra superior flotante unificada para el visor.
 * 
 * Centraliza:
 * 1. Acceso y estado de capas temáticas (con indicador de capas activas).
 * 2. Búsqueda rápida (expediente / municipios / coordenadas con atajo ⌘K).
 * 3. Selector ergonómico de sistema de coordenadas (CRS).
 * 4. Conmutador de modo de fusión (Multiplicar / Normal).
 * 5. Menú unificado de exportaciones (ZIP por área, SHP, Imagen PNG, Coordenadas).
 */
export const TopOmniBar = ({
  selectedCoordinateSystem = 9377,
  onSelectCrs,
  blendMode = "multiply",
  onBlendModeChange,
  activeLayerCount = 0,
  sidebarOpen = false,
  onToggleSidebar,
  onOpenSearch,
  onExportShp,
  onExportZip,
  onExportImage,
  onOpenCoordinates,
  hasArea = false,
  isDownloadingZip = false,
}) => {
  const [crsMenuOpen, setCrsMenuOpen] = useState(false)
  const [exportMenuOpen, setExportMenuOpen] = useState(false)
  const crsRef = useRef(null)
  const exportRef = useRef(null)

  // Cerrar menús al hacer clic fuera
  useEffect(() => {
    const handleClickOutside = (e) => {
      if (crsRef.current && !crsRef.current.contains(e.target)) {
        setCrsMenuOpen(false)
      }
      if (exportRef.current && !exportRef.current.contains(e.target)) {
        setExportMenuOpen(false)
      }
    }
    document.addEventListener("pointerdown", handleClickOutside)
    return () => document.removeEventListener("pointerdown", handleClickOutside)
  }, [])

  // Atajo de teclado global ⌘K o Ctrl+K para abrir búsqueda
  useEffect(() => {
    const handleKeyDown = (e) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault()
        onOpenSearch?.()
      }
    }
    window.addEventListener("keydown", handleKeyDown)
    return () => window.removeEventListener("keydown", handleKeyDown)
  }, [onOpenSearch])

  const currentCrs = crsById(selectedCoordinateSystem)

  return (
    <header className="pointer-events-none absolute inset-x-0 top-3 z-30 flex justify-center px-4 md:px-6">
      <div className="pointer-events-auto flex w-full max-w-7xl items-center justify-between gap-2 rounded-2xl border border-slate-200/85 bg-white/90 p-1.5 shadow-[0_10px_25px_-5px_rgba(15,23,42,0.08),0_4px_10px_-2px_rgba(15,23,42,0.03)] backdrop-blur-md">
        
        {/* Izquierda: Logo / Título y botón de panel de capas */}
        <div className="flex items-center gap-2 min-w-0">
          <button
            type="button"
            onClick={onToggleSidebar}
            aria-label={sidebarOpen ? "Cerrar panel de capas" : "Abrir panel de capas"}
            className={`flex items-center gap-2 rounded-xl px-3 py-1.5 text-xs font-semibold transition-all ${
              sidebarOpen
                ? "bg-slate-900 text-white shadow-sm"
                : "bg-slate-100/90 text-slate-700 hover:bg-slate-200/80 hover:text-slate-900"
            }`}
          >
            <Layers className="h-4 w-4" />
            <span className="hidden sm:inline">Capas</span>
            {activeLayerCount > 0 && (
              <span
                className={`rounded-full px-1.5 py-0.2 text-[10px] font-bold ${
                  sidebarOpen
                    ? "bg-emerald-500 text-white"
                    : "bg-emerald-100 text-emerald-800"
                }`}
              >
                {activeLayerCount}
              </span>
            )}
          </button>

          {/* Buscador Rápido (Omnibox Trigger) */}
          <button
            type="button"
            onClick={onOpenSearch}
            className="flex items-center gap-2 rounded-xl border border-slate-200/80 bg-slate-50/90 px-3 py-1.5 text-left text-xs text-slate-500 transition-colors hover:border-slate-300 hover:bg-white hover:text-slate-800"
            title="Buscar expediente minero de la ANM (Atajo: ⌘K / Ctrl+K)"
          >
            <Search className="h-3.5 w-3.5 text-slate-400" />
            <span className="hidden md:inline">Buscar expediente ANM…</span>
            <span className="inline md:hidden">Buscar…</span>
            <kbd className="hidden lg:inline-flex items-center gap-0.5 rounded border border-slate-200 bg-white px-1.5 py-0.5 text-[9px] font-medium text-slate-400">
              <Command className="h-2.5 w-2.5" />K
            </kbd>
          </button>

          {/* Selector de CRS (Sistema de Coordenadas) */}
          <div className="relative" ref={crsRef}>
            <button
              type="button"
              onClick={() => setCrsMenuOpen((v) => !v)}
              className="flex items-center gap-1.5 rounded-xl border border-slate-200/80 bg-slate-50/90 px-2.5 py-1.5 text-xs font-medium text-slate-700 transition-colors hover:border-slate-300 hover:bg-white"
              title={`Sistema de coordenadas actual: ${currentCrs.label} (EPSG:${selectedCoordinateSystem})`}
            >
              <Globe2 className="h-3.5 w-3.5 text-emerald-600" />
              <span className="max-w-[110px] truncate sm:max-w-[180px]">
                {currentCrs.label}
              </span>
              <ChevronDown className="h-3 w-3 text-slate-400" />
            </button>

            {/* Menú Desplegable de CRS */}
            {crsMenuOpen && (
              <div className="absolute left-0 top-full mt-2 w-72 rounded-xl border border-slate-200 bg-white p-1.5 shadow-xl z-50">
                <div className="px-2.5 py-1.5 text-[10px] font-bold uppercase tracking-wider text-slate-400">
                  Sistemas Oficiales de Colombia
                </div>
                <div className="max-h-60 overflow-y-auto space-y-0.5">
                  {CRS_LIST.map((crs) => {
                    const active = crs.id === selectedCoordinateSystem
                    return (
                      <button
                        key={crs.id}
                        type="button"
                        onClick={() => {
                          onSelectCrs?.(crs.id)
                          setCrsMenuOpen(false)
                        }}
                        className={`flex w-full items-center justify-between rounded-lg px-2.5 py-1.5 text-left text-xs transition-colors ${
                          active
                            ? "bg-emerald-50 font-semibold text-emerald-900"
                            : "text-slate-700 hover:bg-slate-100 hover:text-slate-900"
                        }`}
                      >
                        <div className="min-w-0 flex-1 pr-2">
                          <div className="truncate">{crs.label}</div>
                          <div className="text-[10px] text-slate-400 font-mono">
                            EPSG:{crs.id} {crs.hint ? `· ${crs.hint}` : ""}
                          </div>
                        </div>
                        {active && <Check className="h-3.5 w-3.5 text-emerald-600 shrink-0" />}
                      </button>
                    )
                  })}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Derecha: Conmutador de Fusión y Botón Unificado de Exportación */}
        <div className="flex items-center gap-2">
          {/* Conmutador de Fusión (Multiplicar vs Normal) */}
          <div className="hidden sm:flex items-center rounded-xl border border-slate-200/90 bg-slate-100/80 p-0.5 text-[11px] font-medium text-slate-600">
            <span className="px-2 text-[10px] font-semibold uppercase tracking-wider text-slate-400 hidden xl:inline">
              Fusión:
            </span>
            <button
              type="button"
              onClick={() => onBlendModeChange?.("multiply")}
              className={`flex items-center gap-1 rounded-lg px-2 py-1 transition-all ${
                blendMode === "multiply"
                  ? "bg-slate-900 text-white shadow-xs font-semibold"
                  : "text-slate-600 hover:text-slate-900"
              }`}
              title="Multiplicar: funde la geología y temáticas con el sombreado del relieve"
            >
              <Blend className="h-3 w-3" />
              <span>Multiplicar</span>
            </button>
            <button
              type="button"
              onClick={() => onBlendModeChange?.("normal")}
              className={`rounded-lg px-2 py-1 transition-all ${
                blendMode === "normal"
                  ? "bg-white text-slate-900 shadow-xs font-semibold"
                  : "text-slate-600 hover:text-slate-900"
              }`}
              title="Normal: transparencia simple sobre el mapa base"
            >
              Normal
            </button>
          </div>

          {/* Menú Unificado de Exportación */}
          <div className="relative" ref={exportRef}>
            <button
              type="button"
              onClick={() => setExportMenuOpen((v) => !v)}
              className="flex items-center gap-1.5 rounded-xl bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white shadow-sm transition-all hover:bg-emerald-700 active:scale-98"
              title="Exportar datos y mapas"
            >
              <Download className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">Exportar</span>
              <ChevronDown className="h-3 w-3 text-emerald-200" />
            </button>

            {/* Menú Desplegable de Exportación */}
            {exportMenuOpen && (
              <div className="absolute right-0 top-full mt-2 w-64 rounded-xl border border-slate-200 bg-white p-1.5 shadow-xl z-50">
                <div className="px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider text-slate-400">
                  Formatos de Descarga
                </div>

                {/* Descargar Área Dibujada (ZIP) */}
                <button
                  type="button"
                  onClick={() => {
                    setExportMenuOpen(false)
                    onExportZip?.()
                  }}
                  disabled={!hasArea || isDownloadingZip}
                  className={`flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-xs transition-colors ${
                    hasArea
                      ? "text-emerald-950 hover:bg-emerald-50 font-medium"
                      : "text-slate-400 cursor-not-allowed opacity-60"
                  }`}
                  title={
                    hasArea
                      ? "Descarga en un ZIP todas las capas encendidas dentro del polígono dibujado + DEM"
                      : "Dibuja un área en el mapa primero para activar esta descarga"
                  }
                >
                  <FileArchive className="h-4 w-4 text-emerald-600 shrink-0" />
                  <div>
                    <div className="font-semibold">Descargar área (ZIP)</div>
                    <div className="text-[10px] text-slate-500">
                      {hasArea ? "GeoJSON, SHP, KML y DEM" : "Requiere dibujar un área"}
                    </div>
                  </div>
                </button>

                {/* Exportar Capas a SHP */}
                <button
                  type="button"
                  onClick={() => {
                    setExportMenuOpen(false)
                    onExportShp?.()
                  }}
                  className="flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-xs text-slate-700 hover:bg-slate-100 transition-colors"
                >
                  <Download className="h-4 w-4 text-sky-600 shrink-0" />
                  <div>
                    <div className="font-medium">Exportar Shapefile (SHP)</div>
                    <div className="text-[10px] text-slate-400">Títulos y geometrías visibles</div>
                  </div>
                </button>

                {/* Exportar Imagen PNG de Alta Resolución */}
                <button
                  type="button"
                  onClick={() => {
                    setExportMenuOpen(false)
                    onExportImage?.()
                  }}
                  className="flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-xs text-slate-700 hover:bg-slate-100 transition-colors"
                >
                  <ImageDown className="h-4 w-4 text-amber-600 shrink-0" />
                  <div>
                    <div className="font-medium">Captura de Mapa (PNG)</div>
                    <div className="text-[10px] text-slate-400">Imagen limpia en alta resolución</div>
                  </div>
                </button>

                {/* Ver Tabla de Coordenadas */}
                {onOpenCoordinates && (
                  <button
                    type="button"
                    onClick={() => {
                      setExportMenuOpen(false)
                      onOpenCoordinates()
                    }}
                    className="flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-xs text-slate-700 hover:bg-slate-100 transition-colors border-t border-slate-100 mt-1 pt-2"
                  >
                    <FileSpreadsheet className="h-4 w-4 text-purple-600 shrink-0" />
                    <div>
                      <div className="font-medium">Tabla de Coordenadas</div>
                      <div className="text-[10px] text-slate-400">Ver listado de vértices del polígono</div>
                    </div>
                  </button>
                )}
              </div>
            )}
          </div>
        </div>

      </div>
    </header>
  )
}
