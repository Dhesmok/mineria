"use client"

import { Layers, Wrench, Search, Compass } from "lucide-react"

/**
 * Barra inferior fija para celulares (Thumb-Zone ergonomics).
 * Visible únicamente en pantallas móviles (< 768px).
 * Proporciona blancos táctiles de al menos 44x44 px y respeta las safe areas.
 */
export function MobileBottomBar({
  activePanel,
  activeLayerCount = 0,
  activeLayersCount,
  onTogglePanel,
  onSelectPanel,
}) {
  const handleToggle = onTogglePanel || onSelectPanel
  const count = activeLayersCount !== undefined ? activeLayersCount : activeLayerCount

  const actions = [
    {
      id: "layers",
      label: "Capas",
      icon: Layers,
      badge: count > 0 ? count : null,
    },
    {
      id: "tools",
      label: "Herramientas",
      icon: Wrench,
    },
    {
      id: "expediente",
      label: "Expediente",
      icon: Search,
    },
    {
      id: "view-location",
      label: "3D / GPS",
      icon: Compass,
    },
  ]

  return (
    <nav
      role="navigation"
      aria-label="Controles principales para móvil"
      className="fixed bottom-0 left-0 right-0 z-30 flex md:hidden items-center justify-around border-t border-zinc-800/90 bg-[#09090b]/95 px-2 py-1 shadow-2xl backdrop-blur-2xl"
      style={{ paddingBottom: "max(0.35rem, env(safe-area-inset-bottom, 0px))" }}
    >
      {actions.map(({ id, label, icon: Icon, badge }) => {
        const isActive = activePanel === id
        return (
          <button
            key={id}
            type="button"
            onClick={() => handleToggle?.(id)}
            aria-label={badge ? `${label} (${badge} activas)` : label}
            aria-pressed={isActive}
            className={`relative flex min-h-[48px] min-w-[56px] flex-1 flex-col items-center justify-center gap-0.5 rounded-xl py-1 text-[11px] font-medium transition-all active:scale-95 ${
              isActive
                ? "bg-zinc-800/90 text-white font-semibold shadow-sm border border-zinc-700/60"
                : "text-zinc-400 hover:text-zinc-200"
            }`}
          >
            <div className="relative">
              <Icon className={`h-5 w-5 ${isActive ? "text-white" : "text-zinc-400"}`} />
              {badge !== null && (
                <span className="absolute -top-1 -right-2 flex h-4 min-w-[16px] items-center justify-center rounded-full bg-emerald-500 px-1 text-[9px] font-bold text-black shadow-sm">
                  {badge}
                </span>
              )}
            </div>
            <span className="truncate max-w-[64px]">{label}</span>
          </button>
        )
      })}
    </nav>
  )
}
