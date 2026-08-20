"use client"

import { useEffect, useMemo, useRef, useState } from "react"
import { Map as MapLibreMap, NavigationControl, ScaleControl, setWorkerUrl } from "maplibre-gl"
import "maplibre-gl/dist/maplibre-gl.css"

import { useMapInitializationGL } from "./hooks/map/useMapInitializationGL"
import { useMapLayersGL } from "./hooks/map/useMapLayersGL"
import { BASE_LAYERS, createBaseStyle, INITIAL_CENTER, INITIAL_ZOOM, MAX_ZOOM } from "./utils/mapStyles"
import { formatDegrees } from "./utils/mapUtils"
import { Button } from "@/components/ui/button"
import { MapIcon, Satellite } from "lucide-react"

/**
 * Visor sobre MapLibre. Convive con MapComponent.jsx (Leaflet) a propósito: se
 * llega a él por la ruta /gl y se compara lado a lado con el visor de siempre
 * hasta que alcance a hacer lo mismo. Entonces el de Leaflet se borra.
 *
 * Estado: Fase 2 del plan (docs/PLAN-MAPLIBRE.md). Mapa base y las cuatro capas
 * de la ANM, con fichas al hacer clic y etiquetas. Faltan el dibujo, la
 * exportación, la búsqueda por expediente y el GPS.
 *
 * Nota sobre la importación: maplibre-gl 6 dejó de tener exportación por
 * defecto. `import maplibregl from "maplibre-gl"` compila sin quejarse y
 * devuelve undefined, y el error solo aparece al construir el mapa. Hay que
 * importar por nombre. `Map` se renombra porque choca con el Map nativo de
 * JavaScript.
 */

// MapLibre delega en un web worker el trabajo de convertir el GeoJSON en teselas.
// Por defecto busca ese worker a partir de `import.meta.url`, suponiendo que el
// paquete se sirve tal cual está en disco; webpack reescribe ese valor y la
// búsqueda falla. El worker entonces no arranca, y lo hace en absoluto silencio:
// no hay error en consola, las capas simplemente se quedan cargando para
// siempre. Costó encontrarlo porque el mapa base sí se veía —las teselas raster
// no pasan por el worker— y todo parecía funcionar.
//
// La copia la deja en public/ el script scripts/copy-maplibre-worker.mjs, que
// corre solo antes de cada `npm run dev` y de cada `npm run build`.
setWorkerUrl("/maplibre/maplibre-gl-worker.mjs")

/**
 * Lectura de la posición del cursor.
 *
 * Va en su propio componente porque el ratón dispara eventos decenas de veces
 * por segundo: así se vuelve a pintar solo este recuadro y no el visor entero.
 */
const CursorCoordinates = ({ map }) => {
  const [position, setPosition] = useState(null)

  useEffect(() => {
    if (!map) return

    // `wrap()` devuelve la longitud al rango -180..180. Sin esto, arrastrar el
    // mapa dando la vuelta al mundo muestra longitudes como -434°.
    const handleMove = (event) => setPosition(event.lngLat.wrap())
    const handleOut = () => setPosition(null)

    map.on("mousemove", handleMove)
    map.on("mouseout", handleOut)

    return () => {
      map.off("mousemove", handleMove)
      map.off("mouseout", handleOut)
    }
  }, [map])

  // En pantallas táctiles no hay cursor y nunca llega un mousemove; el recuadro
  // simplemente no aparece, en vez de quedarse mostrando ceros.
  if (!position) return null

  return (
    <div className="absolute bottom-4 right-4 z-10 rounded bg-white/90 px-3 py-1 font-mono text-xs text-gray-700 shadow-md">
      Lat {formatDegrees(position.lat)} · Lon {formatDegrees(position.lng)}
    </div>
  )
}

export default function MapComponentGL({
  onMapInitialized,
  showTitleLayer,
  showRequestLayer,
  showAnmServiceLayer,
  showHistoricalTitleLayer,
  titleOpacity,
  requestOpacity,
  anmServiceOpacity,
  historicalTitleOpacity,
}) {
  // El contenedor se pasa por referencia y no por id. El visor Leaflet ya usa
  // el id "map"; con los dos montados a la vez, MapLibre podía apoderarse del
  // div equivocado.
  const containerRef = useRef(null)
  const mapRef = useRef(null)
  const [mapInstance, setMapInstance] = useState(null)
  const [error, setError] = useState(null)
  const [showErrorBanner, setShowErrorBanner] = useState(false)

  const { baseLayer, toggleBaseLayer } = useMapInitializationGL(mapRef)

  // El panel lateral entrega ocho props sueltas; las capas se manejan por clave.
  // useMemo no es un adorno: sin él estos objetos serían nuevos en cada render y
  // los efectos del hook se re-ejecutarían sin que haya cambiado nada.
  const layerVisibility = useMemo(
    () => ({
      title: showTitleLayer,
      request: showRequestLayer,
      anmService: showAnmServiceLayer,
      historicalTitle: showHistoricalTitleLayer,
    }),
    [showTitleLayer, showRequestLayer, showAnmServiceLayer, showHistoricalTitleLayer],
  )

  const layerOpacity = useMemo(
    () => ({
      title: titleOpacity,
      request: requestOpacity,
      anmService: anmServiceOpacity,
      historicalTitle: historicalTitleOpacity,
    }),
    [titleOpacity, requestOpacity, anmServiceOpacity, historicalTitleOpacity],
  )

  const { showZoomInHint, truncatedLayers } = useMapLayersGL(
    mapRef,
    mapInstance,
    layerVisibility,
    layerOpacity,
    setError,
    setShowErrorBanner,
  )

  useEffect(() => {
    if (mapRef.current) return

    const map = new MapLibreMap({
      container: containerRef.current,
      style: createBaseStyle("osm"),
      center: INITIAL_CENTER,
      zoom: INITIAL_ZOOM,
      maxZoom: MAX_ZOOM,
      // La atribución propia de MapLibre se queda, en versión compacta: las
      // condiciones de uso de OSM la exigen. `false` la quitaría del todo.
      attributionControl: { compact: true },
    })

    // visualizePitch inclina la brújula junto con el mapa. Todavía no sirve de
    // nada porque el mapa está plano, pero es la pieza que en la Fase 4 le
    // indica al usuario que está mirando el terreno en 3D.
    map.addControl(new NavigationControl({ visualizePitch: true }), "top-right")
    map.addControl(new ScaleControl({ unit: "metric" }), "bottom-left")

    mapRef.current = map

    // El panel lateral llama a estos métodos sobre el mapa (botón Borrar). En
    // Leaflet los define MapComponent.jsx; aquí lo que hay que limpiar llega en
    // la Fase 3, pero tienen que existir o el botón revienta.
    map.addVertices = () => {}
    map.removeVertices = () => {}
    map.clearDrawings = () => {}
    map.clearSearchResult = () => {
      map.flyTo({ center: INITIAL_CENTER, zoom: INITIAL_ZOOM })
    }

    // El mapa no se anuncia hasta que el estilo esté parseado. Es asíncrono:
    // justo después de `new Map()` el estilo todavía está vacío y getLayer()
    // devuelve undefined. El hook de capas usa eso como señal de "todavía no",
    // así que entregarle el mapa antes de tiempo lo deja rendido en silencio y
    // las capas no aparecen nunca.
    //
    // La señal NO puede ser el evento `load`, que es lo que sugiere toda la
    // documentación: MapLibre solo lo dispara cuando el estilo *y todas sus
    // fuentes* terminaron de cargar. Con una fuente lenta o caída —el servidor
    // de teselas sin responder, por ejemplo— ese evento no llega nunca y el
    // visor se quedaría inicializándose para siempre. Se comprobó en pruebas:
    // con las teselas bloqueadas, `load` no llegó y `isStyleLoaded()` se quedó
    // en false indefinidamente. `styledata` solo depende del estilo, que es
    // justo la condición que hace falta aquí.
    let announced = false
    const announceWhenStyleReady = () => {
      if (announced || !map.getLayer(BASE_LAYERS.osm)) return
      announced = true
      setMapInstance(map)
      onMapInitialized?.(map)
    }

    map.on("styledata", announceWhenStyleReady)
    // Por si el estilo ya estaba listo antes de suscribirse.
    announceWhenStyleReady()

    // Solo en desarrollo: deja el mapa a mano en la consola del navegador para
    // poder preguntarle cosas (`__mapa.getZoom()`, `__mapa.getStyle()`) sin
    // tener que instrumentar el código cada vez. En la versión publicada no
    // existe, porque `next build` elimina esta rama entera.
    if (process.env.NODE_ENV === "development") {
      window.__mapa = map
    }

    return () => {
      map.off("styledata", announceWhenStyleReady)
      map.remove()
      mapRef.current = null
      // Sin esto los hooks siguen viendo un mapa ya destruido y revientan en la
      // siguiente llamada. Es la misma trampa que documenta el visor Leaflet.
      setMapInstance(null)
    }
  }, [onMapInitialized])

  return (
    <>
      {/* h-full w-full además de absolute inset-0, y no es redundante: al
          construir el mapa, MapLibre le pone al contenedor su clase
          .maplibregl-map, cuyo CSS declara `position: relative`. Esa regla pisa
          a la clase `absolute` de Tailwind —las dos tienen la misma
          especificidad y gana la que se cargue después—, con lo que `inset-0`
          deja de dimensionar nada y el mapa colapsaba a 0 px de alto. Con el
          alto y el ancho explícitos el contenedor llena a su padre gane quien
          gane. Leaflet no sufría esto porque su CSS no toca `position` en el
          contenedor. */}
      <div ref={containerRef} className="absolute inset-0 h-full w-full z-0" />

      <div className="absolute bottom-4 left-4 z-10 flex flex-col space-y-2">
        <Button onClick={toggleBaseLayer} className="bg-white text-black hover:bg-gray-200">
          {baseLayer === "osm" ? (
            <Satellite className="mr-2 h-4 w-4" />
          ) : (
            <MapIcon className="mr-2 h-4 w-4" />
          )}
          {baseLayer === "osm" ? "Satélite" : "Mapa"}
        </Button>
      </div>

      <div className="absolute top-4 right-16 z-10 rounded bg-amber-100/95 px-3 py-1 text-xs text-amber-900 shadow-md">
        MapLibre · Fase 2: mapa base y capas ANM
      </div>

      <CursorCoordinates map={mapInstance} />

      {showZoomInHint && (
        <div className="absolute bottom-4 left-1/2 -translate-x-1/2 z-10 bg-white/95 text-gray-700 text-sm px-4 py-2 rounded-full shadow-md">
          Acerca el mapa para ver las capas de títulos y solicitudes
        </div>
      )}

      {/* ArcGIS recorta la respuesta sin decirlo. Sin este aviso, el usuario
          creería estar viendo todos los títulos del área y podría sacar
          conclusiones sobre una zona a partir de datos incompletos. */}
      {truncatedLayers.length > 0 && (
        <div className="absolute bottom-16 left-1/2 -translate-x-1/2 z-10 rounded-full bg-amber-100/95 px-4 py-2 text-sm text-amber-900 shadow-md">
          Hay más polígonos de los que caben en una consulta ({truncatedLayers.join(", ")}). Acerca
          el mapa para verlos todos.
        </div>
      )}

      {error && showErrorBanner && (
        <div className="absolute top-0 left-0 right-0 bg-red-500 text-white p-2 z-10 flex items-center justify-between gap-2">
          <span className="text-sm">{error}</span>
          <button
            type="button"
            onClick={() => setShowErrorBanner(false)}
            className="px-2 py-1 text-xs font-semibold bg-red-700 rounded hover:bg-red-800"
          >
            Cerrar
          </button>
        </div>
      )}

      <style jsx global>{`
        /* Mismas etiquetas que el visor Leaflet: texto blanco con contorno negro,
           que es lo único legible tanto sobre el mapa claro como sobre satélite. */
        .map-label {
          background: none;
          border: none;
          box-shadow: none;
          pointer-events: none;
        }
        .map-label div {
          font-size: 14px;
          font-weight: bold;
          color: white;
          text-shadow:
            -1px -1px 0 #000,
             1px -1px 0 #000,
            -1px  1px 0 #000,
             1px  1px 0 #000;
          white-space: nowrap;
        }
        .maplibregl-popup-content {
          background: rgba(255, 255, 255, 0.95);
          color: #333;
          font-size: 14px;
          line-height: 24px;
          border-radius: 4px;
          max-height: 400px;
          overflow-y: auto;
        }
        .maplibregl-popup-content h3 {
          font-size: 16px;
          font-weight: bold;
          margin-bottom: 10px;
          border-bottom: 1px solid #ccc;
          padding-bottom: 5px;
        }
        .maplibregl-popup-content p {
          margin-bottom: 5px;
        }
      `}</style>
    </>
  )
}
