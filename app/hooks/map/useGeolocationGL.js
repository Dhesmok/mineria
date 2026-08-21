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
    const r = center - s(3)

    // Marcas cada 5°, más largas cada 15° y aún más cada 45°. Los grados solo se
    // rotulan cada 45: antes se numeraba cada 10° y en una rosa de 250 px eso son
    // 36 números de 10 px pegados unos a otros, ilegibles y con aspecto de
    // borrón. Con ocho rótulos hay aire de sobra y se sigue leyendo el rumbo.
    let ticks = ""
    for (let i = 0; i < 360; i += 5) {
      const mayor = i % 45 === 0
      const media = i % 15 === 0
      const largo = mayor ? 13 : media ? 9 : 5
      const grosor = mayor ? 1.8 : media ? 1.2 : 0.9
      ticks +=
        `<line x1="${center}" y1="${s(6)}" x2="${center}" y2="${s(6 + largo)}" ` +
        `transform="rotate(${i} ${center} ${center})" stroke="rgba(255,255,255,${mayor ? 0.95 : media ? 0.7 : 0.45})" ` +
        `stroke-width="${s(grosor)}" stroke-linecap="round"/>`
    }

    /**
     * Un rótulo colocado en su ángulo pero **siempre derecho**.
     *
     * Antes se giraba el texto con `rotate()` para llevarlo a su sitio, y eso
     * gira también las letras: a 225° el número salía boca abajo, y la E y la O
     * de los costados se leían como una "m" y un "0". Aquí se calcula dónde cae
     * el punto y el texto se pinta ahí sin girar, que es como se leen los
     * rótulos de una brújula de verdad.
     */
    const label = (texto, angulo, radio, tamano, color, peso) => {
      const radianes = (angulo * Math.PI) / 180
      const x = center + radio * Math.sin(radianes)
      const y = center - radio * Math.cos(radianes)
      return (
        `<text x="${x.toFixed(1)}" y="${y.toFixed(1)}" fill="${color}" font-size="${tamano}" ` +
        `text-anchor="middle" dominant-baseline="central" font-weight="${peso}" ` +
        `font-family="ui-sans-serif, system-ui, -apple-system, sans-serif">${texto}</text>`
      )
    }

    // Los grados, en los cuatro intercardinales; las letras van en los cardinales
    // y ocupan su sitio, así que numerarlos también sería repetir el mismo dato
    // dos veces.
    let degrees = ""
    for (const i of [45, 135, 225, 315]) {
      degrees += label(`${i}°`, i, r - s(30), s(11), "rgba(255,255,255,0.8)", 500)
    }

    const cardinal = (letra, angulo, color) =>
      label(letra, angulo, r - s(29), s(17), color, 600)

    dialHtml = `
      <svg width="${size}" height="${size}" viewBox="0 0 ${size} ${size}" style="position: absolute; left: 0; top: 0; pointer-events: none;">
        <defs>
          <radialGradient id="rosaFondo" cx="50%" cy="50%" r="50%">
            <stop offset="55%" stop-color="rgba(15, 23, 42, 0.04)"/>
            <stop offset="100%" stop-color="rgba(15, 23, 42, 0.34)"/>
          </radialGradient>
        </defs>
        <circle cx="${center}" cy="${center}" r="${r}" fill="url(#rosaFondo)" stroke="rgba(255,255,255,0.55)" stroke-width="${s(1.2)}"/>
        <!-- Banda oscura bajo las marcas y los rótulos. Sin ella, el blanco de
             los números se pierde sobre el mapa claro: la rosa se diseñó
             pensando en la imagen de satélite, que es oscura, y sobre OSM
             quedaba ilegible. Solo cubre el anillo exterior, así que el centro
             sigue dejando ver el mapa. -->
        <circle cx="${center}" cy="${center}" r="${r - s(22)}" fill="none"
                stroke="rgba(15, 23, 42, 0.5)" stroke-width="${s(44)}"/>
        <circle cx="${center}" cy="${center}" r="${r - s(44)}" fill="none" stroke="rgba(255,255,255,0.25)" stroke-width="${s(0.8)}"/>
        ${ticks}
        ${degrees}
        ${cardinal("N", 0, "#f87171")}
        ${cardinal("E", 90, "rgba(255,255,255,0.95)")}
        ${cardinal("S", 180, "rgba(255,255,255,0.95)")}
        ${cardinal("O", 270, "rgba(255,255,255,0.95)")}
      </svg>
    `

    // La aguja: una punta roja hacia donde apunta el dispositivo y una cola
    // clara hacia atrás, para que se lea el eje completo y no solo la dirección.
    needleHtml = `
      <div class="gps-compass__needle" style="width:${size}px; height:${size}px; left:0; top:0; transform-origin: center; transform: rotate(0deg); background:transparent; border:none; filter:none; position:absolute;">
        <svg width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
          <polygon points="${center},${s(30)} ${center - s(7)},${center} ${center + s(7)},${center}" fill="#ef4444"/>
          <polygon points="${center},${size - s(46)} ${center - s(5)},${center} ${center + s(5)},${center}" fill="rgba(255,255,255,0.75)"/>
          <circle cx="${center}" cy="${center}" r="${s(4)}" fill="#ffffff" stroke="#ef4444" stroke-width="${s(1.6)}"/>
        </svg>
      </div>
    `
  }

  // La lectura del rumbo, dentro de la rosa y justo bajo el centro. Ahí no la
  // tapa la aguja —que sale del centro hacia fuera— y se lee sin apartar la
  // vista del mapa. Fuera del círculo competiría con los polígonos del fondo.
  const readoutHtml = compassActive
    ? `<div class="gps-compass__lectura" style="top: ${center + size * 0.17}px; font-size: ${Math.max(11, size * 0.058).toFixed(1)}px;">
         <span class="gps-compass__grados">—</span>
       </div>`
    : ""

  return `
    <div class="gps-compass__pulse" style="left: ${center}px; top: ${center}px;"></div>
    <div class="gps-compass__ring" style="width: ${size}px; height: ${size}px;">
      ${dialHtml}
      ${needleHtml}
      ${readoutHtml}
      <div class="gps-compass__dot" style="left: ${center}px; top: ${center}px;"></div>
    </div>
  `
}

/** El rumbo en palabras: 0° es Norte, 135° es Sureste. */
export const cardinalName = (heading) => {
  const nombres = ["N", "NE", "E", "SE", "S", "SO", "O", "NO"]
  return nombres[Math.round(((heading % 360) + 360) % 360 / 45) % 8]
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

    // La lectura numérica se toca aquí y no rehaciendo el marcador: esto se
    // ejecuta cada vez que el celular se mueve un grado, y reconstruir el SVG
    // entero a esa velocidad haría parpadear la rosa.
    const grados = markerElRef.current.querySelector(".gps-compass__grados")
    if (grados) grados.textContent = `${Math.round(heading)}° ${cardinalName(heading)}`
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
