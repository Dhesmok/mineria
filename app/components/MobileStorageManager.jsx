"use client"

import { useState, useEffect, useCallback } from "react"
import { Download, Trash2, HardDrive, CheckCircle2, AlertCircle, Share } from "lucide-react"
import { usePwaInstall } from "../hooks/usePwaInstall"
import { getStorageStatus, clearManagedTileCache } from "../utils/offlineCache"

function formatBytes(bytes) {
  if (bytes === null || bytes === undefined || isNaN(bytes)) return "No disponible"
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

export function MobileStorageManager() {
  const { canInstall, isInstalled, isIOS, promptInstall } = usePwaInstall()
  const [status, setStatus] = useState(null)
  const [loading, setLoading] = useState(false)
  const [showConfirm, setShowConfirm] = useState(false)
  const [message, setMessage] = useState(null)

  const refreshStatus = useCallback(async () => {
    try {
      const s = await getStorageStatus()
      setStatus(s)
    } catch {
      // Dejar status resiliente
    }
  }, [])

  useEffect(() => {
    refreshStatus()
  }, [refreshStatus])

  const handleClear = async () => {
    setLoading(true)
    setShowConfirm(false)
    try {
      await clearManagedTileCache()
      await refreshStatus()
      setMessage("Memoria de mapas y relieve liberada con éxito.")
      setTimeout(() => setMessage(null), 4000)
    } catch {
      setMessage("Ocurrió un inconveniente al liberar la memoria.")
      setTimeout(() => setMessage(null), 4000)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="space-y-3.5">
      {/* 1. Instalación de la aplicación (PWA) */}
      <div className="rounded-2xl border border-border bg-card/70 p-3.5 backdrop-blur-xl">
        <div className="flex items-center justify-between mb-2">
          <span className="eyebrow">
            Aplicación Móvil
          </span>
          {isInstalled && (
            <span className="inline-flex items-center gap-1 rounded-full bg-success/10 px-2 py-0.5 text-[10px] font-medium text-success border border-success/30">
              <CheckCircle2 className="h-3 w-3" />
              Instalada
            </span>
          )}
        </div>

        {canInstall && (
          <button
            type="button"
            onClick={promptInstall}
            className="flex w-full items-center justify-center gap-2 rounded-xl bg-primary py-2.5 px-3 text-xs font-semibold text-white shadow-sm active:scale-95 transition-all"
          >
            <Download className="h-4 w-4" />
            Instalar visor en el teléfono
          </button>
        )}

        {isIOS && !isInstalled && (
          <div className="flex items-start gap-2.5 rounded-xl border border-border bg-fill/70 p-2.5 text-xs text-label-2">
            <Share className="h-4 w-4 text-primary shrink-0 mt-0.5" />
            <p className="leading-snug">
              Para instalar en iOS: pulsa el botón <strong className="text-foreground">Compartir</strong> y elige <strong className="text-foreground">«Añadir a pantalla de inicio»</strong>.
            </p>
          </div>
        )}

        {isInstalled && (
          <p className="text-xs text-label-3 leading-snug">
            El visor ya está funcionando en modo app sin bordes de navegador.
          </p>
        )}

        {!canInstall && !isIOS && !isInstalled && (
          <p className="text-xs text-label-3 leading-snug">
            Puedes instalar el visor directamente desde el menú de opciones de tu navegador (tres puntos ⋮ → «Instalar aplicación»).
          </p>
        )}
      </div>

      {/* 2. Control y límite de almacenamiento local */}
      <div className="rounded-2xl border border-border bg-card/70 p-3.5 backdrop-blur-xl space-y-2.5">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-1.5">
            <HardDrive className="h-4 w-4 text-label-3" />
            <span className="eyebrow">
              Memoria y Almacenamiento
            </span>
          </div>
          <span className="text-[10px] text-label-4 tabular-nums">
            Tope: 60 MB
          </span>
        </div>

        <div className="grid grid-cols-2 gap-2 text-left">
          <div className="rounded-xl border border-border bg-fill/70 p-2.5">
            <span className="text-[10px] text-label-3 block mb-0.5">Mapas y Relieve</span>
            <span className="tabular-nums text-xs font-semibold text-foreground">
              {formatBytes(status?.managedCacheBytes ?? 0)}
            </span>
            <span className="text-[9px] text-label-4 block">
              {status?.managedCacheEntries ?? 0} teselas
            </span>
          </div>

          <div className="rounded-xl border border-border bg-fill/70 p-2.5">
            <span className="text-[10px] text-label-3 block mb-0.5">Uso en Navegador</span>
            <span className="tabular-nums text-xs font-semibold text-label-2">
              {status?.originUsageBytes !== null ? formatBytes(status?.originUsageBytes) : "Medido"}
            </span>
            <span className="text-[9px] text-label-4 block">
              Protección activa
            </span>
          </div>
        </div>

        {message && (
          <div className="flex items-center gap-2 rounded-xl border border-success/30 bg-success/10 p-2 text-xs text-success">
            <CheckCircle2 className="h-3.5 w-3.5 shrink-0" />
            <span>{message}</span>
          </div>
        )}

        {!showConfirm ? (
          <button
            type="button"
            onClick={() => setShowConfirm(true)}
            disabled={loading}
            className="flex w-full items-center justify-center gap-2 rounded-xl border border-border bg-fill/70 py-2.5 px-3 text-xs font-medium text-label-2 hover:border-input hover:bg-fill-strong active:scale-95 transition-all"
          >
            <Trash2 className="h-3.5 w-3.5 text-label-3" />
            Liberar memoria de mapas
          </button>
        ) : (
          <div className="rounded-xl border border-warning/30 bg-warning/10 p-2.5 space-y-2">
            <div className="flex items-start gap-1.5 text-[11px] text-warning">
              <AlertCircle className="h-4 w-4 text-warning shrink-0 mt-0.5" />
              <span>
                Se borrarán mapas y elevaciones temporales para liberar espacio. Tus datos y preferencias no se tocarán.
              </span>
            </div>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={handleClear}
                disabled={loading}
                className="flex-1 rounded-lg bg-danger py-1.5 text-xs font-semibold text-white active:scale-95 transition-all"
              >
                {loading ? "Liberando..." : "Sí, liberar"}
              </button>
              <button
                type="button"
                onClick={() => setShowConfirm(false)}
                disabled={loading}
                className="flex-1 rounded-lg bg-fill-strong py-1.5 text-xs font-medium text-label-2 active:scale-95 transition-all"
              >
                Cancelar
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
