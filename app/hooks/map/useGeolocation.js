import { useState, useCallback, useRef, useEffect } from "react"
import L from "leaflet"

export const useGeolocation = (mapRef, setError, setShowErrorBanner) => {
  const [isLocating, setIsLocating] = useState(false)
  const [hasLocated, setHasLocated] = useState(false)
  const [isCompassActive, setIsCompassActive] = useState(false)
  const [deviceHeading, setDeviceHeading] = useState(null)

  const userLocationMarkerRef = useRef(null)
  const locationWatchIdRef = useRef(null)
  const deviceOrientationCleanupRef = useRef(null)
  const deviceHeadingRef = useRef(null)
  const hasCenteredRef = useRef(false)

  const buildGpsCompassIcon = useCallback((compassActive) => {
    const size = compassActive ? 250 : 44
    const center = size / 2

    let dialHtml = ''
    let needleHtml = ''

    if (compassActive) {
      let ticks = ''
      for (let i = 0; i < 360; i += 2) {
        const isTen = i % 10 === 0
        const length = isTen ? 12 : (i % 5 === 0 ? 8 : 4)
        ticks += `<line x1="${center}" y1="${isTen ? 0 : (12-length)}" x2="${center}" y2="12" transform="rotate(${i} ${center} ${center})" stroke="rgba(255,255,255,0.8)" stroke-width="1.5"/>`
        ticks += `<line x1="${center}" y1="${isTen ? 0 : (12-length)}" x2="${center}" y2="12" transform="rotate(${i} ${center} ${center})" stroke="rgba(0,0,0,0.5)" stroke-width="0.5"/>`
        if (isTen) {
          ticks += `<text x="${center}" y="24" transform="rotate(${i} ${center} ${center})" fill="white" font-size="10" text-anchor="middle" font-family="sans-serif" font-weight="bold" style="text-shadow: 1px 1px 2px black;">${i}</text>`
        }
      }

      dialHtml = `
        <svg width="${size}" height="${size}" viewBox="0 0 ${size} ${size}" style="position: absolute; left: 0; top: 0; pointer-events: none;">
          <circle cx="${center}" cy="${center}" r="${center - 2}" fill="rgba(0, 50, 100, 0.1)" stroke="rgba(255,255,255,0.4)" stroke-width="1"/>
          ${ticks}
          <g font-size="28" font-weight="bold" font-family="serif" style="text-shadow: 1px 1px 3px black;">
            <text x="${center}" y="55" fill="#ff4444" text-anchor="middle">N</text>
            <text x="${center}" y="${size - 35}" fill="white" text-anchor="middle">S</text>
            <text x="${size - 35}" y="${center + 10}" fill="white" text-anchor="middle">E</text>
            <text x="35" y="${center + 10}" fill="white" text-anchor="middle">W</text>
          </g>
          <line x1="${center - 15}" y1="${center}" x2="${center + 15}" y2="${center}" stroke="rgba(255,255,255,0.7)" stroke-width="1.5"/>
          <line x1="${center}" y1="${center - 15}" x2="${center}" y2="${center + 15}" stroke="rgba(255,255,255,0.7)" stroke-width="1.5"/>
        </svg>
      `

      needleHtml = `
        <div class="gps-compass__needle" style="width:${size}px; height:${size}px; left:0; top:0; transform-origin: center; transform: rotate(0deg); background:transparent; border:none; filter:none; position:absolute;">
          <svg width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
            <line x1="${center}" y1="${center}" x2="${center}" y2="20" stroke="#ff4444" stroke-width="2"/>
            <polygon points="${center - 4},35 ${center + 4},35 ${center},20" fill="#ff4444" />
            <circle cx="${center}" cy="${center}" r="3" fill="#ff4444"/>
          </svg>
        </div>
      `
    }

    return L.divIcon({
      className: "gps-compass-marker",
      html: `
        <div class="gps-compass__pulse" style="left: ${center}px; top: ${center}px;"></div>
        <div class="gps-compass__ring" style="width: ${size}px; height: ${size}px;">
          ${dialHtml}
          ${needleHtml}
          <div class="gps-compass__dot" style="left: ${center}px; top: ${center}px;"></div>
        </div>
      `,
      iconSize: [size, size],
      iconAnchor: [center, center],
    })
  }, [])

  const updateCompassNeedle = useCallback((heading) => {
    if (!Number.isFinite(heading) || !userLocationMarkerRef.current) return

    const markerElement = userLocationMarkerRef.current.getElement()
    if (!markerElement) return

    const needleElement = markerElement.querySelector(".gps-compass__needle")
    if (!needleElement) return

    needleElement.style.transform = `rotate(${heading}deg)`
  }, [])

  const startDeviceOrientationTracking = useCallback(async () => {
    if (typeof window === "undefined" || typeof DeviceOrientationEvent === "undefined") {
      setError("Este dispositivo no soporta lectura de brújula.")
      setShowErrorBanner(true)
      return false
    }

    if (deviceOrientationCleanupRef.current) {
      deviceOrientationCleanupRef.current()
      deviceOrientationCleanupRef.current = null
    }

    let permissionGranted = true

    if (typeof DeviceOrientationEvent.requestPermission === "function") {
      try {
        const permissionState = await DeviceOrientationEvent.requestPermission()
        permissionGranted = permissionState === "granted"
      } catch {
        permissionGranted = false
      }
    }

    if (!permissionGranted) {
      setError("GPS activo, pero no pude leer la orientación del celular (permiso denegado).")
      setShowErrorBanner(true)
      return false
    }

    const handleOrientation = (event) => {
      let heading = null

      if (typeof event.webkitCompassHeading === "number") {
        heading = event.webkitCompassHeading
      } else if (typeof event.alpha === "number") {
        heading = (360 - event.alpha) % 360
      }

      if (heading !== null) {
        setDeviceHeading(heading)
        deviceHeadingRef.current = heading
        updateCompassNeedle(heading)
      }
    }

    window.addEventListener("deviceorientationabsolute", handleOrientation, true)
    window.addEventListener("deviceorientation", handleOrientation, true)
    deviceOrientationCleanupRef.current = () => {
      window.removeEventListener("deviceorientationabsolute", handleOrientation, true)
      window.removeEventListener("deviceorientation", handleOrientation, true)
    }
    return true
  }, [updateCompassNeedle, setError, setShowErrorBanner])

  const stopDeviceOrientationTracking = useCallback(() => {
    if (deviceOrientationCleanupRef.current) {
      deviceOrientationCleanupRef.current()
      deviceOrientationCleanupRef.current = null
    }
    setIsCompassActive(false)
    setDeviceHeading(null)
  }, [])

  const handleToggleCompass360 = useCallback(async () => {
    if (isCompassActive) {
      stopDeviceOrientationTracking()
      if (userLocationMarkerRef.current) {
        userLocationMarkerRef.current.setIcon(buildGpsCompassIcon(false))
      }
      return
    }

    setError(null)
    setShowErrorBanner(false)
    const started = await startDeviceOrientationTracking()
    if (started) {
      setIsCompassActive(true)
      if (userLocationMarkerRef.current) {
        userLocationMarkerRef.current.setIcon(buildGpsCompassIcon(true))
        setTimeout(() => {
          if (deviceHeadingRef.current !== null) {
            updateCompassNeedle(deviceHeadingRef.current)
          }
        }, 0)
      }
    }
  }, [isCompassActive, startDeviceOrientationTracking, stopDeviceOrientationTracking, buildGpsCompassIcon, updateCompassNeedle, setError, setShowErrorBanner])

  const handleLocateUser = useCallback(() => {
    if (!mapRef.current) return

    if (hasLocated || isLocating) {
      if (locationWatchIdRef.current !== null) {
        navigator.geolocation.clearWatch(locationWatchIdRef.current)
        locationWatchIdRef.current = null
      }
      if (userLocationMarkerRef.current) {
        mapRef.current.removeLayer(userLocationMarkerRef.current)
        userLocationMarkerRef.current = null
      }
      setIsLocating(false)
      setHasLocated(false)
      hasCenteredRef.current = false
      return
    }

    if (!navigator.geolocation) {
      setShowErrorBanner(true)
      setError("Tu navegador no soporta geolocalización.")
      return
    }

    setError(null)
    setShowErrorBanner(false)
    setIsLocating(true)

    locationWatchIdRef.current = navigator.geolocation.watchPosition(
      async (position) => {
        setIsLocating(false)
        setHasLocated(true)
        const { latitude, longitude } = position.coords
        const map = mapRef.current

        if (userLocationMarkerRef.current) {
          userLocationMarkerRef.current.setLatLng([latitude, longitude])
          userLocationMarkerRef.current.setPopupContent(
            `Tu ubicación actual:<br/>Latitud: ${latitude.toFixed(6)}<br/>Longitud: ${longitude.toFixed(6)}`
          )
        } else {
          userLocationMarkerRef.current = L.marker([latitude, longitude], {
            icon: buildGpsCompassIcon(isCompassActive),
          })
            .addTo(map)
            .bindPopup(
              `Tu ubicación actual:<br/>Latitud: ${latitude.toFixed(6)}<br/>Longitud: ${longitude.toFixed(6)}`,
            )
        }

        if (!hasCenteredRef.current) {
          map.flyTo([latitude, longitude], 16, {
            animate: true,
            duration: 1.5,
          })
          userLocationMarkerRef.current.openPopup()
          hasCenteredRef.current = true
        }
      },
      () => {
        setIsLocating(false)
        setHasLocated(false)
        hasCenteredRef.current = false
        setShowErrorBanner(true)
        setError("No se pudo obtener tu ubicación. Revisa permisos de GPS e inténtalo de nuevo.")
      },
      {
        enableHighAccuracy: true,
        timeout: 10000,
        maximumAge: 0
      },
    )
  }, [buildGpsCompassIcon, hasLocated, isLocating, isCompassActive, mapRef, setError, setShowErrorBanner])

  useEffect(() => {
    return () => {
      stopDeviceOrientationTracking()
      if (locationWatchIdRef.current !== null) {
        navigator.geolocation.clearWatch(locationWatchIdRef.current)
      }
    }
  }, [stopDeviceOrientationTracking])

  return {
    isLocating,
    hasLocated,
    isCompassActive,
    handleLocateUser,
    handleToggleCompass360,
    userLocationMarkerRef
  }
}
