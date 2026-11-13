"use client"

import { Layers, Search, SlidersHorizontal } from "lucide-react"

/**
 * Barra de pestañas para celulares, como la de las apps de iPhone.
 * Visible únicamente en pantallas móviles (< 768px).
 *
 * Son tres y no cuatro. Había una cuarta, «3D / GPS», que repetía dos botones
 * que ya están sobre el mapa —el de perspectiva y el de ubicación—, y una barra
 * con cuatro pestañas en un teléfono deja cada rótulo en «Herramie…». Lo que se
 * hace con el pulgar mientras se mira el mapa va en el mapa; aquí va lo que
 * necesita una hoja entera: la lista de capas, el buscador y las herramientas.
 *
 * La pestaña elegida se marca con el azul de acento y nada más, igual que en
 * iOS: un recuadro alrededor competía con el propio mapa.
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
    { id: "layers", label: "Capas", icon: Layers, badge: count > 0 ? count : null },
    { id: "expediente", label: "Buscar", icon: Search },
    { id: "tools", label: "Herramientas", icon: SlidersHorizontal },
  ]

  return (
    <nav
      role="navigation"
      aria-label="Controles principales para móvil"
      className="glass fixed bottom-0 left-0 right-0 z-30 flex md:hidden items-stretch justify-around rounded-none border-x-0 border-b-0 px-2 pt-1"
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
            className={`relative flex min-h-[50px] flex-1 flex-col items-center justify-center gap-1 text-[10.5px] font-medium transition-colors active:opacity-60 ${
              isActive ? "text-primary" : "text-label-4"
            }`}
          >
            <span className="relative">
              <Icon className="h-[22px] w-[22px]" strokeWidth={isActive ? 2.2 : 1.8} />
              {badge != null && (
                <span className="absolute -top-1.5 -right-2.5 flex h-4 min-w-[16px] items-center justify-center rounded-full bg-primary px-1 text-[9.5px] font-semibold text-white ring-2 ring-white">
                  {badge}
                </span>
              )}
            </span>
            <span className="truncate">{label}</span>
          </button>
        )
      })}
    </nav>
  )
}
