"use client"

import { useEffect } from "react"
import { X } from "lucide-react"

/**
 * Hoja inferior para móviles, como las de iOS.
 * Ocupa como máximo 75vh/75dvh, dejando ver parte del mapa arriba.
 * Solo se renderiza en viewport móvil (< 768px).
 *
 * El título va en la serif editorial, igual que el del panel de escritorio: es
 * lo que hace que las dos versiones se lean como la misma aplicación.
 */
export function MobileBottomSheet({
  open,
  isOpen,
  title,
  icon: Icon,
  badge,
  onClose,
  children,
}) {
  const isVisible = open ?? isOpen ?? false

  useEffect(() => {
    if (!isVisible) return
    const handleKeyDown = (e) => {
      if (e.key === "Escape") onClose?.()
    }
    document.addEventListener("keydown", handleKeyDown)
    return () => document.removeEventListener("keydown", handleKeyDown)
  }, [isVisible, onClose])

  if (!isVisible) return null

  return (
    <>
      {/* Velo ligero: oscurece lo justo para separar la hoja del mapa */}
      <div
        onClick={onClose}
        aria-hidden="true"
        className="fixed inset-0 z-40 bg-black/15 md:hidden animate-in fade-in duration-200"
      />

      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className="glass-strong fixed bottom-0 left-0 right-0 z-50 flex max-h-[75dvh] max-h-[75vh] flex-col rounded-t-[22px] border-b-0 text-foreground md:hidden animate-in slide-in-from-bottom-6 duration-200"
        style={{ paddingBottom: "max(1rem, env(safe-area-inset-bottom, 16px))" }}
      >
        {/* Asa */}
        <div className="mx-auto mt-2 h-[5px] w-9 shrink-0 rounded-full bg-label-5/60" />

        <div className="flex shrink-0 items-center justify-between px-5 pb-3 pt-3">
          <div className="flex items-center gap-2">
            {Icon && <Icon className="h-4 w-4 text-label-3" />}
            <span className="panel-title text-[22px]">{title}</span>
            {badge && (
              <span className="rounded-full bg-fill-strong px-2 py-0.5 text-[11px] font-medium text-label-2">
                {badge}
              </span>
            )}
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Cerrar panel inferior"
            className="flex h-[30px] w-[30px] items-center justify-center rounded-full bg-fill-strong text-label-3 transition-colors active:bg-label-5/50"
          >
            <X className="h-4 w-4" strokeWidth={2.5} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto overscroll-contain px-4 pb-2 space-y-4">
          {children}
        </div>
      </div>
    </>
  )
}
