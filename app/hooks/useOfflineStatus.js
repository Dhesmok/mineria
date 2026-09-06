import { useState, useEffect } from "react"

/**
 * Hook para monitorear el estado de conexión (Online / Offline).
 * @returns {boolean} isOffline
 */
export const useOfflineStatus = () => {
  const [isOffline, setIsOffline] = useState(() => {
    if (typeof window === "undefined" || typeof navigator === "undefined") return false
    return !navigator.onLine
  })

  useEffect(() => {
    if (typeof window === "undefined") return

    const handleOnline = () => setIsOffline(false)
    const handleOffline = () => setIsOffline(true)

    window.addEventListener("online", handleOnline)
    window.addEventListener("offline", handleOffline)

    return () => {
      window.removeEventListener("online", handleOnline)
      window.removeEventListener("offline", handleOffline)
    }
  }, [])

  return isOffline
}
