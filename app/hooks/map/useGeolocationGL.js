import { useCallback, useEffect, useRef, useState } from "react"
import { Marker, Popup } from "maplibre-gl"

/**
 * GPS y brújula 360°, sobre MapLibre.
 *
 * Es el equivalente de `useGeolocation` (Leaflet). La identidad visual del
 * marcador —el punto azul, la rosa de los vientos, la aguja que gira con el
 * celular— se conserva idéntica: el mismo SVG y el mismo CSS. Lo que cambia es
 * el motor. Diferencias que hay que respetar al portar:
 *
 * - MapLibre usa [lon, lat]; Leaflet usaba [lat, lon]. Invertirlo manda el punto
 *   al otro lado del mundo.
 * - El marcador es un `Marker` de MapLibre con un elemento HTML, no un
 *   `L.divIcon`. Cambiar de icono (al activar la brújula) es reescribir el HTML
 *   del elemento, no llamar a `setIcon`.
 *
 * La lectura de la orientación del dispositivo (`deviceorientation`) es API del
 * navegador y va igual que antes.
 */

/**
 * Tamaño de la rosa de los vientos, en píxeles de pantalla.
 *
 * Es ajustable porque 250 px es mucho en un celular —tapaba media pantalla— y
 * poco en un monitor grande. El punto azul, en cambio, mide siempre lo mismo:
 * es una posición, no un dibujo que haya que leer.
 */
export const COMPASS_SIZE_DEFAULT = 250
export const COMPASS_SIZE_MIN = 120
export const COMPASS_SIZE_MAX = 420
const DOT_SIZE = 44

/**
 * HTML del marcador. Punto azul siempre; con la brújula activa, además la rosa
 * de los vientos grande y la aguja. Es una cadena pura, sin dependencias.
 */
export const buildCompassMarkup = (compassActive, compassSize = COMPASS_SIZE_DEFAULT) => {
  const size = compassActive ? compassSize : DOT_SIZE
  const center = size / 2
  // Las letras y los números de la rosa se escalan con ella. Con tamaños fijos,
  // una brújula pequeña quedaba con una "N" que se salía del círculo.
  const scale = size / COMPASS_SIZE_DEFAULT

  let dialHtml = ""
  let needleHtml = ""

  if (compassActive) {
    // Todas las medidas de dentro se dan en las unidades del diseño original
    // (una rosa de 250 px) y esta función las lleva al tamaño elegido.
    const s = (value) => Number((value * scale).toFixed(2))

    let ticks = ""
    for (let i = 0; i < 360; i += 2) {
      const isTen = i % 10 === 0
      const length = isTen ? 12 : i % 5 === 0 ? 8 : 4
      const start = isTen ? 0 : s(12 - length)
      ticks += `<line x1="${center}" y1="${start}" x2="${center}" y2="${s(12)}" transform="rotate(${i} ${center} ${center})" stroke="rgba(255,255,255,0.8)" stroke-width="${s(1.5)}"/>`
      ticks += `<line x1="${center}" y1="${start}" x2="${center}" y2="${s(12)}" transform="rotate(${i} ${center} ${center})" stroke="rgba(0,0,0,0.5)" stroke-width="${s(0.5)}"/>`
      if (isTen) {
        ticks += `<text x="${center}" y="${s(24)}" transform="rotate(${i} ${center} ${center})" fill="white" font-size="${s(10)}" text-anchor="middle" font-family="sans-serif" font-weight="bold" style="text-shadow: 1px 1px 2px black;">${i}</text>`
      }
    }

    dialHtml = `
      <svg width="${size}" height="${size}" viewBox="0 0 ${size} ${size}" style="position: absolute; left: 0; top: 0; pointer-events: none;">
        <circle cx="${center}" cy="${center}" r="${center - 2}" fill="rgba(0, 50, 100, 0.1)" stroke="rgba(255,255,255,0.4)" stroke-width="1"/>
        ${ticks}
        <g font-size="${s(28)}" font-weight="bold" font-family="serif" style="text-shadow: 1px 1px 3px black;">
          <text x="${center}" y="${s(55)}" fill="#ff4444" text-anchor="middle">N</text>
          <text x="${center}" y="${size - s(35)}" fill="white" text-anchor="middle">S</text>
          <text x="${size - s(35)}" y="${center + s(10)}" fill="white" text-anchor="middle">E</text>
          <text x="${s(35)}" y="${center + s(10)}" fill="white" text-anchor="middle">W</text>
        </g>
        <line x1="${center - s(15)}" y1="${center}" x2="${center + s(15)}" y2="${center}" stroke="rgba(255,255,255,0.7)" stroke-width="1.5"/>
        <line x1="${center}" y1="${center - s(15)}" x2="${center}" y2="${center + s(15)}" stroke="rgba(255,255,255,0.7)" stroke-width="1.5"/>
      </svg>
    `

    needleHtml = `
      <div class="gps-compass__needle" style="width:${size}px; height:${size}px; left:0; top:0; transform-origin: center; transform: rotate(0deg); background:transparent; border:none; filter:none; position:absolute;">
        <svg width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
          <line x1="${center}" y1="${center}" x2="${center}" y2="${s(20)}" stroke="#ff4444" stroke-width="${s(2)}"/>
          <polygon points="${center - s(4)},${s(35)} ${center + s(4)},${s(35)} ${center},${s(20)}" fill="#ff4444" />
          <circle cx="${center}" cy="${center}" r="${s(3)}" fill="#ff4444"/>
        </svg>
      </div>
    `
  }

  return `
    <div class="gps-compass__pulse" style="left: ${center}px; top: ${center}px;"></div>
    <div class="gps-compass__ring" style="width: ${size}px; height: ${size}px;">
      ${dialHtml}
      ${needleHtml}
      <div class="gps-compass__dot" style="left: ${center}px; top: ${center}px;"></div>
    </div>
  `
}

/** Normaliza la orientación del dispositivo a un rumbo 0–360. */
export const headingFromOrientation = (event) => {
  if (typeof event.webkitCompassHeading === "number") {
    // iOS ya da el rumbo respecto al norte.
    return event.webkitCompassHeading
  }
  if (typeof event.alpha === "number") {
    // El resto da alpha, que crece al revés que el rumbo de brújula.
    return (360 - event.alpha) % 360
  }
  return null
}

const popupContent = (lat, lon) =>
  `Tu ubicación actual:<br/>Latitud: ${lat.toFixed(6)}<br/>Longitud: ${lon.toFixed(6)}`

export const useGeolocationGL = (mapRef, setError, setShowErrorBanner) => {
  const [isLocating, setIsLocating] = useState(false)
  const [hasLocated, setHasLocated] = useState(false)
  const [isCompassActive, setIsCompassActive] = useState(false)
  const [compassSize, setCompassSize] = useState(COMPASS_SIZE_DEFAULT)

  const markerRef = useRef(null)
  const markerElRef = useRef(null)
  const popupRef = useRef(null)
  const watchIdRef = useRef(null)
  const orientationCleanupRef = useRef(null)
  const headingRef = useRef(null)
  const hasCenteredRef = useRef(false)
  // El tamaño se lee dentro de manejadores creados una sola vez; con el valor
  // del estado se quedarían viendo el del primer render.
  const compassSizeRef = useRef(compassSize)
  compassSizeRef.current = compassSize

  /** Elemento del marcador, creándolo la primera vez. */
  const ensureMarkerElement = useCallback((compassActive) => {
    if (!markerElRef.current) {
      const el = document.createElement("div")
      el.className = "gps-compass-marker"
      markerElRef.current = el
    }
    markerElRef.current.innerHTML = buildCompassMarkup(compassActive, compassSizeRef.current)
    return markerElRef.current
  }, [])

  const updateNeedle = useCallback((heading) => {
    if (!Number.isFinite(heading) || !markerElRef.current) return
    const needle = markerElRef.current.querySelector(".gps-compass__needle")
    if (needle) needle.style.transform = `rotate(${heading}deg)`
  }, [])

  const startOrientationTracking = useCallback(async () => {
    if (typeof window === "undefined" || typeof DeviceOrientationEvent === "undefined") {
      setError("Este dispositivo no soporta lectura de brújula.")
      setShowErrorBanner(true)
      return false
    }

    orientationCleanupRef.current?.()
    orientationCleanupRef.current = null

    // iOS exige pedir permiso explícito, y solo desde un gesto del usuario.
    if (typeof DeviceOrientationEvent.requestPermission === "function") {
      try {
        const state = await DeviceOrientationEvent.requestPermission()
        if (state !== "granted") {
          setError("GPS activo, pero no pude leer la orientación del celular (permiso denegado).")
          setShowErrorBanner(true)
          return false
        }
      } catch {
        setError("GPS activo, pero no pude leer la orientación del celular (permiso denegado).")
        setShowErrorBanner(true)
        return false
      }
    }

    const handleOrientation = (event) => {
      const heading = headingFromOrientation(event)
      if (heading !== null) {
        headingRef.current = heading
        updateNeedle(heading)
      }
    }

    window.addEventListener("deviceorientationabsolute", handleOrientation, true)
    window.addEventListener("deviceorientation", handleOrientation, true)
    orientationCleanupRef.current = () => {
      window.removeEventListener("deviceorientationabsolute", handleOrientation, true)
      window.removeEventListener("deviceorientation", handleOrientation, true)
    }
    return true
  }, [updateNeedle, setError, setShowErrorBanner])

  const stopOrientationTracking = useCallback(() => {
    orientationCleanupRef.current?.()
    orientationCleanupRef.current = null
    setIsCompassActive(false)
  }, [])

  const handleToggleCompass360 = useCallback(async () => {
    if (isCompassActive) {
      stopOrientationTracking()
      if (markerRef.current) ensureMarkerElement(false)
      return
    }

    setError(null)
    setShowErrorBanner(false)
    const started = await startOrientationTracking()
    if (!started) return

    setIsCompassActive(true)
    if (markerRef.current) {
      ensureMarkerElement(true)
      if (headingRef.current !== null) updateNeedle(headingRef.current)
    }
  }, [
    isCompassActive,
    startOrientationTracking,
    stopOrientationTracking,
    ensureMarkerElement,
    updateNeedle,
    setError,
    setShowErrorBanner,
  ])

  /**
   * Cambia el tamaño de la rosa mientras se mira.
   *
   * Redibujar el marcador borra la aguja, así que hay que volver a ponerle el
   * rumbo que tenía: si no, la brújula salta al norte cada vez que se mueve la
   * barra del tamaño.
   */
  const changeCompassSize = useCallback(
    (value) => {
      compassSizeRef.current = value
      setCompassSize(value)
      if (!isCompassActive || !markerElRef.current) return
      ensureMarkerElement(true)
      if (headingRef.current !== null) updateNeedle(headingRef.current)
    },
    [ensureMarkerElement, isCompassActive, updateNeedle],
  )

  const removeMarker = useCallback(() => {
    markerRef.current?.remove()
    markerRef.current = null
    popupRef.current = null
  }, [])

  const handleLocateUser = useCallback(() => {
    const map = mapRef.current
    if (!map) return

    // Segunda pulsación: apaga el GPS y limpia todo.
    if (hasLocated || isLocating) {
      if (watchIdRef.current !== null) {
        navigator.geolocation.clearWatch(watchIdRef.current)
        watchIdRef.current = null
      }
      removeMarker()
      // La brújula se apaga con el GPS. Vive sobre el marcador de la ubicación,
      // así que sin ubicación no hay dónde dibujarla: dejarla "activa" solo
      // conseguía que el botón dijera "Ocultar 360°" sin haber nada que ocultar.
      stopOrientationTracking()
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

    watchIdRef.current = navigator.geolocation.watchPosition(
      (position) => {
        setIsLocating(false)
        setHasLocated(true)
        const { latitude, longitude } = position.coords
        const lngLat = [longitude, latitude]

        if (!markerRef.current) {
          const el = ensureMarkerElement(isCompassActive)
          popupRef.current = new Popup({ offset: 24 }).setHTML(popupContent(latitude, longitude))
          markerRef.current = new Marker({ element: el }).setLngLat(lngLat).setPopup(popupRef.current).addTo(map)
        } else {
          markerRef.current.setLngLat(lngLat)
          popupRef.current?.setHTML(popupContent(latitude, longitude))
        }

        // Centrar y abrir el globo solo la primera vez: si no, cada lectura del
        // GPS arrastraría el mapa y reabriría el popup mientras el usuario mira
        // otra cosa.
        if (!hasCenteredRef.current) {
          map.flyTo({ center: lngLat, zoom: 16, duration: 1500 })
          markerRef.current.togglePopup()
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
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 },
    )
  }, [
    ensureMarkerElement,
    hasLocated,
    isLocating,
    isCompassActive,
    mapRef,
    removeMarker,
    stopOrientationTracking,
    setError,
    setShowErrorBanner,
  ])

  useEffect(() => {
    return () => {
      stopOrientationTracking()
      if (watchIdRef.current !== null) {
        navigator.geolocation.clearWatch(watchIdRef.current)
      }
      removeMarker()
    }
  }, [stopOrientationTracking, removeMarker])

  return {
    isLocating,
    hasLocated,
    isCompassActive,
    compassSize,
    changeCompassSize,
    handleLocateUser,
    handleToggleCompass360,
  }
}
