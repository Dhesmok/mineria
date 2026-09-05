"use client"

import {
  Box,
  Compass,
  Crosshair,
  Download,
  ImageDown,
  Layers,
  Loader2,
  Mountain,
  PencilRuler,
} from "lucide-react"

/**
 * MapBottomDock: Centro de mando ergonómico inferior flotante (estilo macOS Dock).
 *
 * Agrupa las herramientas espaciales en una sola isla interactiva, eliminando
 * la torre vertical de 10 botones desordenados que antes invadía el margen derecho.
 */
export const MapBottomDock = ({
  onToggleDraw,
  isDrawActive = false,
  drawBadge = null,
  onOpenMenu,
  activeMenu = null,
  terrenoActivo = null,
  is3D = false,
  onToggle3D,
  onLocateUser,
  isLocating = false,
  hasLocated = false,
  isCompassActive = false,
  onToggleCompass,
  hasArea = false,
  isDownloadingArea = false,
  onDownloadArea,
  onExportImage,
}) => {
  return (
    <nav
      aria-label="Herramientas del mapa"
      className="pointer-events-none absolute inset-x-0 bottom-6 z-20 flex justify-center px-4"
    >
      <div className="pointer-events-auto flex items-center gap-1.5 rounded-full border border-slate-700/80 bg-slate-900/90 p-1.5 text-slate-200 shadow-[0_12px_35px_-5px_rgba(0,0,0,0.4),0_4px_12px_rgba(0,0,0,0.2)] backdrop-blur-md">
        
        {/* Acción Contextual Dinámica: Descargar Área */}
        {hasArea && (
          <>
            <button
              type="button"
              onClick={onDownloadArea}
              disabled={isDownloadingArea}
              className="flex items-center gap-1.5 rounded-full bg-emerald-600 px-3.5 py-1.5 text-xs font-bold text-white shadow-md transition-all hover:bg-emerald-500 disabled:opacity-60 active:scale-95 animate-in fade-in zoom-in duration-200"
              title="Descargar en un archivo ZIP todas las capas encendidas dentro del polígono dibujado"
            >
              {isDownloadingArea ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Download className="h-4 w-4" />
              )}
              <span className="hidden sm:inline">
                {isDownloadingArea ? "Preparando…" : "Descargar área"}
              </span>
            </button>
            <span className="h-4 w-px bg-slate-700 mx-0.5" />
          </>
        )}

        {/* Herramientas de Dibujo y Medición */}
        <button
          type="button"
          onClick={onToggleDraw}
          aria-pressed={isDrawActive}
          className={`flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium transition-colors ${
            isDrawActive
              ? "bg-amber-500/20 text-amber-300 font-semibold shadow-inner"
              : "text-slate-300 hover:bg-slate-800 hover:text-white"
          }`}
          title="Dibujar polígonos, líneas, puntos y medir distancias o áreas"
        >
          <PencilRuler className="h-4 w-4 text-amber-400" />
          <span className="hidden md:inline">Dibujo</span>
          {drawBadge && (
            <span className="rounded-full bg-amber-400/30 px-1.5 py-0.2 text-[10px] font-mono font-bold text-amber-200">
              {drawBadge}
            </span>
          )}
        </button>

        {/* Menú de Terreno y Modelo de Elevación */}
        <button
          type="button"
          onClick={(e) => onOpenMenu?.("terreno", e)}
          aria-pressed={activeMenu === "terreno" || Boolean(terrenoActivo)}
          className={`flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium transition-colors ${
            activeMenu === "terreno" || terrenoActivo
              ? "bg-emerald-500/20 text-emerald-300 font-semibold shadow-inner"
              : "text-slate-300 hover:bg-slate-800 hover:text-white"
          }`}
          title="Relieve sombreado (Horn), mapa de pendientes, orientación y consulta de cota"
        >
          <Mountain className="h-4 w-4 text-emerald-400" />
          <span className="hidden md:inline">Terreno</span>
          {terrenoActivo && (
            <span className="rounded-full bg-emerald-400/30 px-1.5 py-0.2 text-[10px] font-bold text-emerald-200 uppercase">
              {terrenoActivo}
            </span>
          )}
        </button>

        {/* Toggle 3D (Elevación real con Copernicus DEM) */}
        <button
          type="button"
          onClick={onToggle3D}
          aria-pressed={is3D}
          className={`flex items-center gap-1.5 rounded-full px-3.5 py-1.5 text-xs font-bold transition-all ${
            is3D
              ? "bg-emerald-600 text-white shadow-md shadow-emerald-900/40 hover:bg-emerald-500"
              : "bg-slate-800 text-slate-300 hover:bg-slate-700 hover:text-white"
          }`}
          title={is3D ? "Volver a vista plana 2D" : "Activar relieve 3D real con inclinación de cámara"}
        >
          <Box className="h-4 w-4" />
          <span>{is3D ? "3D" : "2D"}</span>
        </button>

        <span className="h-4 w-px bg-slate-700 mx-0.5" />

        {/* Selector de Mapas Base */}
        <button
          type="button"
          onClick={(e) => onOpenMenu?.("fondo", e)}
          aria-pressed={activeMenu === "fondo"}
          className={`flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium transition-colors ${
            activeMenu === "fondo"
              ? "bg-sky-500/20 text-sky-300 font-semibold shadow-inner"
              : "text-slate-300 hover:bg-slate-800 hover:text-white"
          }`}
          title="Cambiar mapa base (Satélite, OpenStreetMap, Topográfico, etc.)"
        >
          <Layers className="h-4 w-4 text-sky-400" />
          <span className="hidden lg:inline">Fondo</span>
        </button>

        {/* Localización GPS */}
        <button
          type="button"
          onClick={onLocateUser}
          className={`flex items-center justify-center rounded-full p-2 transition-colors ${
            hasLocated
              ? "bg-rose-500/20 text-rose-300 font-semibold"
              : "text-slate-300 hover:bg-slate-800 hover:text-white"
          } ${isLocating ? "animate-pulse" : ""}`}
          title={isLocating ? "Obteniendo ubicación GPS…" : hasLocated ? "Ubicación GPS activa" : "Activar ubicación GPS"}
        >
          <Crosshair className={`h-4 w-4 text-rose-400 ${isLocating ? "animate-spin" : ""}`} />
        </button>

        {/* Brújula 360° (aparece cuando hay GPS activo) */}
        {hasLocated && (
          <button
            type="button"
            onClick={onToggleCompass}
            aria-pressed={isCompassActive}
            className={`flex items-center justify-center rounded-full p-2 transition-colors ${
              isCompassActive
                ? "bg-purple-500/20 text-purple-300 font-semibold"
                : "text-slate-300 hover:bg-slate-800 hover:text-white"
            }`}
            title="Rosa de los vientos 360° según la orientación del dispositivo"
          >
            <Compass className="h-4 w-4 text-purple-400" />
          </button>
        )}

        {/* Exportar Captura de Imagen */}
        {onExportImage && (
          <button
            type="button"
            onClick={onExportImage}
            className="flex items-center justify-center rounded-full p-2 text-slate-300 hover:bg-slate-800 hover:text-white transition-colors"
            title="Guardar imagen limpia del mapa en alta resolución"
          >
            <ImageDown className="h-4 w-4 text-slate-400 hover:text-slate-200" />
          </button>
        )}

      </div>
    </nav>
  )
}
