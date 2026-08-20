"use client"

import { useEffect, useRef, useState } from "react"
import { Map as MapLibreMap, NavigationControl, ScaleControl } from "maplibre-gl"
import "maplibre-gl/dist/maplibre-gl.css"

import { useMapInitializationGL } from "./hooks/map/useMapInitializationGL"
import { createBaseStyle, INITIAL_CENTER, INITIAL_ZOOM, MAX_ZOOM } from "./utils/mapStyles"
import { formatDegrees } from "./utils/mapUtils"
import { Button } from "@/components/ui/button"
import { MapIcon, Satellite } from "lucide-react"

/**
 * Visor sobre MapLibre. Convive con MapComponent.jsx (Leaflet) a propósito: se
 * llega a él por la ruta /gl y se compara lado a lado con el visor de siempre
 * hasta que alcance a hacer lo mismo. Entonces el de Leaflet se borra.
 *
 * Estado: Fase 1 del plan (docs/PLAN-MAPLIBRE.md). Solo mapa base. Las capas de
 * la ANM, el dibujo, la búsqueda por expediente y el GPS llegan en las fases
 * 2 y 3.
 *
 * Nota sobre la importación: maplibre-gl 6 dejó de tener exportación por
 * defecto. `import maplibregl from "maplibre-gl"` compila sin quejarse y
 * devuelve undefined, y el error solo aparece al construir el mapa. Hay que
 * importar por nombre. `Map` se renombra porque choca con el Map nativo de
 * JavaScript.
 */

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

export default function MapComponentGL({ onMapInitialized }) {
  // El contenedor se pasa por referencia y no por id. El visor Leaflet ya usa
  // el id "map"; con los dos montados a la vez, MapLibre podía apoderarse del
  // div equivocado.
  const containerRef = useRef(null)
  const mapRef = useRef(null)
  const [mapInstance, setMapInstance] = useState(null)

  const { baseLayer, toggleBaseLayer } = useMapInitializationGL(mapRef)

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
    setMapInstance(map)

    // El panel lateral llama a estos métodos sobre el mapa (botón Borrar). En
    // Leaflet los define MapComponent.jsx; aquí todavía no hay nada que
    // limpiar, pero tienen que existir o el botón revienta. Las fases 2 y 3 los
    // llenan de verdad.
    map.addVertices = () => {}
    map.removeVertices = () => {}
    map.clearDrawings = () => {}
    map.clearSearchResult = () => {
      map.flyTo({ center: INITIAL_CENTER, zoom: INITIAL_ZOOM })
    }

    onMapInitialized?.(map)

    return () => {
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
        MapLibre · Fase 1: solo mapa base
      </div>

      <CursorCoordinates map={mapInstance} />
    </>
  )
}
