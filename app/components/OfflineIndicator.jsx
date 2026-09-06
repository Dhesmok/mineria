"use client"

import { WifiOff } from "lucide-react"
import { useOfflineStatus } from "../hooks/useOfflineStatus"

export const OfflineIndicator = () => {
  const isOffline = useOfflineStatus()

  if (!isOffline) return null

  return (
    <div className="fixed top-3 left-1/2 -translate-x-1/2 z-50 flex items-center gap-2 bg-amber-600/90 text-white px-3 py-1.5 rounded-full text-xs font-medium shadow-md backdrop-blur-sm animate-pulse transition-all">
      <WifiOff className="w-3.5 h-3.5" />
      <span>Modo Offline (Caché Local)</span>
    </div>
  )
}
