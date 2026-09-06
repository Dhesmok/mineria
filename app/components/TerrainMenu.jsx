"use client"

import {
  Check,
  Compass,
  Crosshair,
  LineChart,
  Mountain,
  TrendingUp,
} from "lucide-react"

/**
 * Menú de Análisis y Herramientas del Terreno (DEM).
 *
 * Reúne de forma integrada y moderna:
 * 1. Pendiente del terreno (grados/porcentaje por algoritmo Horn)
 * 2. Orientación / Aspecto de laderas (N, E, S, O)
 * 3. Corte topográfico / Perfil longitudinal en tiempo real
 * 4. Sombreado de relieve (Hillshade) sobre el mapa plano
 * 5. Consulta puntual de cota, pendiente y orientación
 */
export const TerrainMenu = ({
  terrainMode,
  onChooseTerrainMode,
  profileActive,
  onToggleProfile,
  queryingTerrain,
  onToggleQuery,
  _onClose,
}) => {
  const anyActive =
    Boolean(terrainMode) || profileActive || queryingTerrain

  const handleResetAll = () => {
    if (terrainMode) onChooseTerrainMode(null)
    if (profileActive) onToggleProfile()
    if (queryingTerrain) onToggleQuery()
  }

  const items = [
    {
      id: "slope",
      title: "Pendiente del terreno",
      desc: "Mapa de calor con inclinación en grados Horn",
      icon: TrendingUp,
      active: terrainMode === "slope",
      onClick: () =>
        onChooseTerrainMode(terrainMode === "slope" ? null : "slope"),
      badge: "Horn DEM",
    },
    {
      id: "aspect",
      title: "Aspecto y orientación",
      desc: "Dirección azimutal hacia donde miran las laderas",
      icon: Compass,
      active: terrainMode === "aspect",
      onClick: () =>
        onChooseTerrainMode(terrainMode === "aspect" ? null : "aspect"),
      badge: "Azimut",
    },
    {
      id: "profile",
      title: "Corte topográfico",
      desc: "Traza una línea y genera el perfil de elevación",
      icon: LineChart,
      active: profileActive,
      onClick: onToggleProfile,
      badge: "Perfil",
    },
    {
      id: "query",
      title: "Consulta de cota",
      desc: "Clic en el mapa para leer cota, pendiente y azimut",
      icon: Crosshair,
      active: queryingTerrain,
      onClick: onToggleQuery,
      badge: "Inspector",
    },
  ]

  return (
    <div
      role="dialog"
      aria-label="Herramientas y análisis del terreno"
      className="w-[305px] max-h-[calc(100vh-5rem)] overflow-y-auto overscroll-contain rounded-2xl border border-zinc-800/90 bg-[#09090b]/95 p-2.5 text-zinc-100 shadow-2xl backdrop-blur-2xl select-none"
    >
      {/* Cabecera */}
      <div className="mb-2 flex items-center justify-between border-b border-zinc-800/80 px-1 pb-2">
        <div className="flex items-center gap-1.5">
          <Mountain className="h-4 w-4 text-emerald-400" />
          <span className="text-[11.5px] font-semibold uppercase tracking-wider text-zinc-200">
            Análisis de Terreno
          </span>
        </div>
        {anyActive && (
          <button
            type="button"
            onClick={handleResetAll}
            title="Desactivar todos los análisis de terreno activos"
            className="rounded bg-zinc-800/80 px-1.5 py-0.5 text-[9.5px] font-medium text-zinc-400 hover:bg-zinc-700 hover:text-white transition-colors"
          >
            Limpiar
          </button>
        )}
      </div>

      {/* Lista de herramientas */}
      <div className="space-y-1">
        {items.map((item) => {
          const Icon = item.icon
          return (
            <button
              key={item.id}
              type="button"
              onClick={item.onClick}
              aria-pressed={item.active}
              className={`flex w-full items-start gap-2.5 rounded-xl px-2.5 py-2 text-left transition-all ${
                item.active
                  ? "border border-zinc-700 bg-zinc-800 text-white shadow-sm"
                  : "border border-transparent text-zinc-300 hover:bg-zinc-800/60 hover:text-white"
              }`}
            >
              <span
                className={`mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg border transition-colors ${
                  item.active
                    ? "border-emerald-500/40 bg-emerald-950/60 text-emerald-300 shadow-sm"
                    : "border-zinc-800 bg-zinc-900/80 text-zinc-400"
                }`}
              >
                <Icon className="h-3.5 w-3.5" />
              </span>

              <span className="min-w-0 flex-1">
                <span className="flex items-center justify-between gap-1">
                  <span className="text-[12.5px] font-medium text-zinc-100">
                    {item.title}
                  </span>
                  {item.active && (
                    <span className="flex h-3.5 w-3.5 items-center justify-center rounded-full bg-emerald-500 text-zinc-950">
                      <Check className="h-2.5 w-2.5 stroke-[3]" />
                    </span>
                  )}
                </span>
                <span className="mt-0.5 block text-[10.5px] leading-tight text-zinc-400">
                  {item.desc}
                </span>
              </span>
            </button>
          )
        })}
      </div>
    </div>
  )
}
