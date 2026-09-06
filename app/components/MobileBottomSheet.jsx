"use client"

import { useEffect } from "react"
import { X } from "lucide-react"

/**
 * Panel modal inferior deslizable (Bottom Sheet) para móviles.
 * Ocupa como máximo 75vh/75dvh, dejando ver parte del mapa arriba.
 * Solo se renderiza en viewport móvil (< 768px).
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
      {/* Fondo oscuro translúcido con desenfoque */}
      <div
        onClick={onClose}
        aria-hidden="true"
        className="fixed inset-0 z-40 bg-black/60 backdrop-blur-sm md:hidden animate-in fade-in duration-200"
      />

      {/* Contenedor del Sheet */}
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className="fixed bottom-0 left-0 right-0 z-50 flex max-h-[75dvh] max-h-[75vh] flex-col rounded-t-3xl border-t border-zinc-800 bg-[#09090b]/98 text-zinc-100 shadow-2xl backdrop-blur-2xl md:hidden animate-in slide-in-from-bottom-6 duration-200"
        style={{ paddingBottom: "max(1rem, env(safe-area-inset-bottom, 16px))" }}
      >
        {/* Píldora cosmética superior */}
        <div className="mx-auto my-2.5 h-1 w-12 rounded-full bg-zinc-700/60 shrink-0" />

        {/* Cabecera del Sheet */}
        <div className="flex h-12 shrink-0 items-center justify-between border-b border-zinc-800/80 px-4">
          <div className="flex items-center gap-2">
            {Icon && <Icon className="h-4 w-4 text-zinc-300" />}
            <span className="text-sm font-semibold tracking-tight text-white">{title}</span>
            {badge && (
              <span className="rounded-full bg-zinc-800 px-2 py-0.5 text-[10px] font-bold text-zinc-300 border border-zinc-700">
                {badge}
              </span>
            )}
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Cerrar panel inferior"
            className="flex h-8 w-8 items-center justify-center rounded-lg text-zinc-400 hover:bg-zinc-800 hover:text-white transition-colors"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Contenido con scroll táctil suave */}
        <div className="flex-1 overflow-y-auto overscroll-contain p-4 space-y-4">
          {children}
        </div>
      </div>
    </>
  )
}
