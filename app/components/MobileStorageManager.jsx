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
      <div className="rounded-2xl border border-zinc-800/80 bg-zinc-950/60 p-3.5 backdrop-blur-xl">
        <div className="flex items-center justify-between mb-2">
          <span className="text-[11px] font-semibold uppercase tracking-[0.08em] text-zinc-400">
            Aplicación Móvil
          </span>
          {isInstalled && (
            <span className="inline-flex items-center gap-1 rounded-full bg-emerald-950/80 px-2 py-0.5 text-[10px] font-medium text-emerald-400 border border-emerald-800/60">
              <CheckCircle2 className="h-3 w-3" />
              Instalada
            </span>
          )}
        </div>

        {canInstall && (
          <button
            type="button"
            onClick={promptInstall}
            className="flex w-full items-center justify-center gap-2 rounded-xl bg-sky-500 py-2.5 px-3 text-xs font-semibold text-zinc-950 shadow-sm active:scale-95 transition-all"
          >
            <Download className="h-4 w-4" />
            Instalar visor en el teléfono
          </button>
        )}

        {isIOS && !isInstalled && (
          <div className="flex items-start gap-2.5 rounded-xl border border-zinc-800 bg-zinc-900/60 p-2.5 text-xs text-zinc-300">
            <Share className="h-4 w-4 text-sky-400 shrink-0 mt-0.5" />
            <p className="leading-snug">
              Para instalar en iOS: pulsa el botón <strong className="text-white">Compartir</strong> y elige <strong className="text-white">«Añadir a pantalla de inicio»</strong>.
            </p>
          </div>
        )}

        {isInstalled && (
          <p className="text-xs text-zinc-400 leading-snug">
            El visor ya está funcionando en modo app sin bordes de navegador.
          </p>
        )}

        {!canInstall && !isIOS && !isInstalled && (
          <p className="text-xs text-zinc-400 leading-snug">
            Puedes instalar el visor directamente desde el menú de opciones de tu navegador (tres puntos ⋮ → «Instalar aplicación»).
          </p>
        )}
      </div>

      {/* 2. Control y límite de almacenamiento local */}
      <div className="rounded-2xl border border-zinc-800/80 bg-zinc-950/60 p-3.5 backdrop-blur-xl space-y-2.5">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-1.5">
            <HardDrive className="h-4 w-4 text-zinc-400" />
            <span className="text-[11px] font-semibold uppercase tracking-[0.08em] text-zinc-400">
              Memoria y Almacenamiento
            </span>
          </div>
          <span className="text-[10px] text-zinc-500 font-mono">
            Tope: 60 MB
          </span>
        </div>

        <div className="grid grid-cols-2 gap-2 text-left">
          <div className="rounded-xl border border-zinc-800/80 bg-zinc-900/50 p-2.5">
            <span className="text-[10px] text-zinc-400 block mb-0.5">Mapas y Relieve</span>
            <span className="font-mono text-xs font-semibold text-white">
              {formatBytes(status?.managedCacheBytes ?? 0)}
            </span>
            <span className="text-[9px] text-zinc-500 block">
              {status?.managedCacheEntries ?? 0} teselas
            </span>
          </div>

          <div className="rounded-xl border border-zinc-800/80 bg-zinc-900/50 p-2.5">
            <span className="text-[10px] text-zinc-400 block mb-0.5">Uso en Navegador</span>
            <span className="font-mono text-xs font-semibold text-zinc-300">
              {status?.originUsageBytes !== null ? formatBytes(status?.originUsageBytes) : "Medido"}
            </span>
            <span className="text-[9px] text-zinc-500 block">
              Protección activa
            </span>
          </div>
        </div>

        {message && (
          <div className="flex items-center gap-2 rounded-xl border border-emerald-900/60 bg-emerald-950/40 p-2 text-xs text-emerald-300">
            <CheckCircle2 className="h-3.5 w-3.5 shrink-0" />
            <span>{message}</span>
          </div>
        )}

        {!showConfirm ? (
          <button
            type="button"
            onClick={() => setShowConfirm(true)}
            disabled={loading}
            className="flex w-full items-center justify-center gap-2 rounded-xl border border-zinc-800 bg-zinc-900/70 py-2.5 px-3 text-xs font-medium text-zinc-300 hover:border-zinc-700 hover:bg-zinc-850 active:scale-95 transition-all"
          >
            <Trash2 className="h-3.5 w-3.5 text-zinc-400" />
            Liberar memoria de mapas
          </button>
        ) : (
          <div className="rounded-xl border border-amber-900/60 bg-amber-950/30 p-2.5 space-y-2">
            <div className="flex items-start gap-1.5 text-[11px] text-amber-200">
              <AlertCircle className="h-4 w-4 text-amber-400 shrink-0 mt-0.5" />
              <span>
                Se borrarán mapas y elevaciones temporales para liberar espacio. Tus datos y preferencias no se tocarán.
              </span>
            </div>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={handleClear}
                disabled={loading}
                className="flex-1 rounded-lg bg-rose-600 py-1.5 text-xs font-semibold text-white active:scale-95 transition-all"
              >
                {loading ? "Liberando..." : "Sí, liberar"}
              </button>
              <button
                type="button"
                onClick={() => setShowConfirm(false)}
                disabled={loading}
                className="flex-1 rounded-lg border border-zinc-700 bg-zinc-800 py-1.5 text-xs font-medium text-zinc-300 active:scale-95 transition-all"
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
