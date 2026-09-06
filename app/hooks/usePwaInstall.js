"use client"

import { useState, useEffect, useCallback } from "react"

/**
 * Hook para gestionar la instalación de la PWA y compatibilidad multiplataforma.
 */
export function usePwaInstall() {
  const [deferredPrompt, setDeferredPrompt] = useState(null)
  const [isInstalled, setIsInstalled] = useState(false)
  const [isIOS, setIsIOS] = useState(false)

  useEffect(() => {
    if (typeof window === "undefined") return

    // 1. Detectar si ya está corriendo como app independiente (standalone)
    const isStandalone =
      window.matchMedia("(display-mode: standalone)").matches ||
      window.navigator.standalone === true

    setIsInstalled(isStandalone)

    // 2. Detectar si el dispositivo es iOS (Safari requiere indicación manual)
    const userAgent = window.navigator.userAgent || ""
    const isAppleDevice = /iPad|iPhone|iPod/.test(userAgent) && !window.MSStream
    setIsIOS(isAppleDevice && !isStandalone)

    // 3. Capturar evento nativo de instalación en navegadores Chromium/Android
    const handleBeforeInstallPrompt = (e) => {
      e.preventDefault()
      setDeferredPrompt(e)
    }

    const handleAppInstalled = () => {
      setIsInstalled(true)
      setDeferredPrompt(null)
    }

    window.addEventListener("beforeinstallprompt", handleBeforeInstallPrompt)
    window.addEventListener("appinstalled", handleAppInstalled)

    return () => {
      window.removeEventListener("beforeinstallprompt", handleBeforeInstallPrompt)
      window.removeEventListener("appinstalled", handleAppInstalled)
    }
  }, [])

  const promptInstall = useCallback(async () => {
    if (!deferredPrompt) return false
    try {
      deferredPrompt.prompt()
      const { outcome } = await deferredPrompt.userChoice
      if (outcome === "accepted") {
        setIsInstalled(true)
        setDeferredPrompt(null)
        return true
      }
      return false
    } catch (err) {
      console.warn("[PWA] Error en prompt de instalación:", err)
      return false
    }
  }, [deferredPrompt])

  return {
    canInstall: Boolean(deferredPrompt) && !isInstalled,
    isInstalled,
    isIOS,
    promptInstall,
  }
}
