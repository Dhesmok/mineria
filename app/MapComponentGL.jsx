"use client"

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { Map as MapLibreMap, NavigationControl, ScaleControl, setWorkerUrl } from "maplibre-gl"
import "maplibre-gl/dist/maplibre-gl.css"

import { useMapInitializationGL } from "./hooks/map/useMapInitializationGL"
import {
  useTerrainGL,
  EXAGGERATION_MAX,
  EXAGGERATION_MIN,
  PITCH_MAX,
} from "./hooks/map/useTerrainGL"
import { useMapLayersGL } from "./hooks/map/useMapLayersGL"
import { useDrawControlGL } from "./hooks/map/useDrawControlGL"
import { useAreaDownloadGL } from "./hooks/map/useAreaDownloadGL"
import { useGeolocationGL } from "./hooks/map/useGeolocationGL"
import { useExpedientSearchGL } from "./hooks/map/useExpedientSearchGL"
import { BASE_LAYERS, createBaseStyle, INITIAL_CENTER, INITIAL_ZOOM, MAX_ZOOM } from "./utils/mapStyles"
import { formatDegrees } from "./utils/mapUtils"
import { COMPASS_SIZE_MAX, COMPASS_SIZE_MIN } from "./hooks/map/useGeolocationGL"
import { Button } from "@/components/ui/button"
import {
  Box,
  Compass,
  Crosshair,
  Download,
  Loader2,
  MapIcon,
  MapPin,
  Mountain,
  Pentagon,
  Satellite,
  Spline,
  Trash2,
  User,
  X,
} from "lucide-react"

/**
 * El visor del proyecto, sobre MapLibre. Es el único: el de Leaflet se borró en
 * la Fase 7 del plan, una vez que este hacía todo lo que hacía aquel.
 *
 * Se sirve en la raíz (`/`). Durante la migración vivió en `/gl` para poder
 * compararlos lado a lado; esa ruta ya no existe.
 *
 * Pendiente (ver docs/PLAN-MAPLIBRE.md): el DEM recortado en la descarga por
 * área —falta decidir la fuente— y las capas de otras entidades.
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
    // Abajo a la izquierda, justo encima de la barra de escala: las dos son
    // información sobre dónde estás mirando, y así la esquina derecha queda
    // libre para los botones. Antes estaba a la derecha y ahí ahora hay
    // controles que la taparían.
    <div className="absolute bottom-10 left-4 z-10 rounded bg-white/90 px-3 py-1 font-mono text-xs text-gray-700 shadow-md">
      Lat {formatDegrees(position.lat)} · Lon {formatDegrees(position.lng)}
    </div>
  )
}

/** Los colores con que se puede dibujar. El primero es el de partida. */
const DRAW_COLORS = [
  "#f357a1",
  "#ef4444",
  "#f59e0b",
  "#10b981",
  "#3b82f6",
  "#8b5cf6",
  "#111827",
  "#ffffff",
]

/**
 * Barra de dibujo.
 *
 * Sustituye a las dos barras del visor Leaflet —la de dibujo y la de medición—,
 * que hacían lo mismo: ambas dibujaban. Aquí toda figura muestra su medida al
 * cerrarla, así que una sola barra basta.
 *
 * La paleta va aquí dentro y no en un botón aparte. Antes era un botón "Color"
 * suelto arriba del mapa que abría un desplegable: estaba siempre a la vista,
 * incluso cuando no había nada que colorear, y no se entendía sobre qué actuaba.
 * Ahora aparece solo cuando hay algo que colorear —mientras se dibuja, o con una
 * figura seleccionada— y dice a qué se va a aplicar.
 */
const DrawToolbar = ({
  mode,
  startMode,
  deleteSelected,
  drawingColor,
  onColorChange,
  hasSelection,
}) => {
  const tools = [
    { id: "draw_polygon", label: "Dibujar polígono y medir su área", Icon: Pentagon },
    { id: "draw_line_string", label: "Dibujar línea y medir su longitud", Icon: Spline },
    { id: "draw_point", label: "Marcar puntos y ver sus coordenadas", Icon: MapPin },
  ]

  const drawing = mode.startsWith("draw_")
  const showPalette = drawing || hasSelection

  return (
    <>
      <div className="absolute top-32 right-4 z-10 flex flex-col gap-1 rounded-md bg-white p-1 shadow-md">
        {tools.map(({ id, label, Icon }) => (
          <button
            key={id}
            type="button"
            onClick={() => startMode(id)}
            title={`${label}. Pulsa otra vez (o Escape) para salir.`}
            aria-label={label}
            // El modo activo se resalta: sin eso no hay forma de saber que el
            // siguiente clic en el mapa va a empezar una figura.
            aria-pressed={mode === id}
            className={`flex h-8 w-8 items-center justify-center rounded ${
              mode === id ? "bg-blue-100 text-blue-700" : "text-gray-700 hover:bg-gray-100"
            }`}
          >
            <Icon className="h-4 w-4" />
          </button>
        ))}
        <button
          type="button"
          onClick={deleteSelected}
          title="Borrar la figura seleccionada, o todo el dibujo si no hay ninguna"
          aria-label="Borrar figura"
          className="flex h-8 w-8 items-center justify-center rounded text-gray-700 hover:bg-red-50 hover:text-red-600"
        >
          <Trash2 className="h-4 w-4" />
        </button>
      </div>

      {showPalette && (
        <div className="absolute top-32 right-16 z-10 rounded-md bg-white px-2 py-1.5 shadow-md">
          <p className="mb-1 text-[10px] leading-tight text-gray-500">
            {hasSelection ? "Color de lo seleccionado" : "Color del dibujo"}
          </p>
          <div className="flex gap-1.5">
            {DRAW_COLORS.map((color) => (
              <button
                key={color}
                type="button"
                onClick={() => onColorChange(color)}
                aria-label={`Usar el color ${color}`}
                aria-pressed={drawingColor === color}
                className={`h-6 w-6 rounded-full transition-transform hover:scale-110 ${
                  drawingColor === color
                    ? "ring-2 ring-gray-800 ring-offset-1"
                    : "ring-1 ring-gray-300"
                }`}
                style={{ backgroundColor: color }}
              />
            ))}
          </div>
        </div>
      )}
    </>
  )
}

/**
 * Una fila de ajuste: nombre, barra y valor, todo en un renglón.
 *
 * Va en horizontal y no con la etiqueta encima porque estos ajustes viven en un
 * panel flotante sobre el mapa, y en vertical ocupaban tanto que la columna de
 * botones acababa montándose sobre el panel lateral. Se vio en una captura: las
 * comprobaciones sobre el estado del mapa daban todas por buenas.
 */
const SliderRow = ({ id, label, value, display, min, max, step, onChange }) => (
  <div className="flex items-center gap-2">
    <label htmlFor={id} className="w-20 shrink-0 text-[11px] leading-tight text-gray-700">
      {label}
    </label>
    <input
      id={id}
      type="range"
      min={min}
      max={max}
      step={step}
      value={value}
      onChange={(event) => onChange(parseFloat(event.target.value))}
      className="min-w-0 flex-1"
    />
    <span className="w-11 shrink-0 text-right text-[11px] tabular-nums text-gray-600">
      {display}
    </span>
  </div>
)

/**
 * Aviso de cómo se gira el mapa con el ratón.
 *
 * En el celular el 3D se maneja solo: dos dedos y ya. En el navegador hay que
 * saber que se arrastra con Ctrl, y eso no está escrito en ninguna parte, así
 * que la primera vez que alguien entra en 3D se queda con un mapa inclinado que
 * no sabe girar. El aviso sale una vez por visita y se va solo.
 */
const RotateHint = ({ onClose }) => {
  useEffect(() => {
    const timer = setTimeout(onClose, 9000)
    return () => clearTimeout(timer)
  }, [onClose])

  return (
    <div className="absolute top-4 left-1/2 z-20 flex -translate-x-1/2 items-center gap-3 rounded-full bg-gray-900/90 px-4 py-2 text-sm text-white shadow-lg">
      <span>
        Mantén <kbd className="rounded bg-white/20 px-1.5 py-0.5 font-mono text-xs">Ctrl</kbd> y
        arrastra para girar e inclinar el mapa
      </span>
      <button
        type="button"
        onClick={onClose}
        aria-label="Cerrar el aviso"
        className="rounded-full p-0.5 hover:bg-white/20"
      >
        <X className="h-4 w-4" />
      </button>
    </div>
  )
}

export default function MapComponentGL({
  onMapInitialized,
  expedientCode,
  searchTrigger,
  onCoordinatesUpdate,
  layerState,
  layerOrder,
}) {
  // El contenedor se pasa por referencia y no por id. Durante la migración
  // convivían los dos visores y el de Leaflet ya ocupaba el id "map": MapLibre
  // podía apoderarse del div equivocado. Se deja por referencia porque además
  // es lo correcto en React: el id es un nombre global y la referencia no.
  const containerRef = useRef(null)
  const mapRef = useRef(null)
  const [mapInstance, setMapInstance] = useState(null)
  const [error, setError] = useState(null)
  const [showErrorBanner, setShowErrorBanner] = useState(false)

  const { baseLayer, toggleBaseLayer } = useMapInitializationGL(mapRef)

  // El panel entrega el estado de las capas ya agrupado por clave: encendida,
  // opacidad y colores. Antes llegaban ocho props sueltas que había que volver a
  // juntar aquí con dos useMemo.
  const { showZoomInHint, truncatedLayers } = useMapLayersGL(
    mapRef,
    mapInstance,
    layerState,
    layerOrder,
    setError,
    setShowErrorBanner,
  )

  const {
    drawingColor,
    handleColorChange,
    mode,
    startMode,
    addPointAt,
    selectedIds,
    deleteSelected,
    clearDrawings,
    getDrawnFeatures,
    hasArea,
  } = useDrawControlGL(mapRef, mapInstance)

  // La descarga por área solo necesita saber qué está encendido, no con qué
  // color ni en qué orden. Se le entrega esa vista reducida para no obligar a
  // `bboxDownload` —que es lógica pura y con pruebas propias— a aprenderse la
  // forma del estado del panel.
  const layerVisibility = useMemo(
    () =>
      Object.fromEntries(
        Object.entries(layerState).map(([key, estado]) => [key, Boolean(estado?.on)]),
      ),
    [layerState],
  )

  const { isDownloading, downloadArea } = useAreaDownloadGL(
    getDrawnFeatures,
    layerVisibility,
    setError,
    setShowErrorBanner,
  )

  const {
    isLocating,
    hasLocated,
    isCompassActive,
    compassSize,
    changeCompassSize,
    handleLocateUser,
    handleToggleCompass360,
  } = useGeolocationGL(mapRef, setError, setShowErrorBanner)

  const {
    is3D,
    toggle3D,
    showHillshade,
    toggleHillshade,
    exaggeration,
    changeExaggeration,
    bearing,
    changeBearing,
    resetNorth,
    pitch,
    changePitch,
    elevationAt,
  } = useTerrainGL(mapRef, mapInstance)

  // El aviso de "arrastra con Ctrl" solo tiene sentido con ratón: en una
  // pantalla táctil se gira con dos dedos y ese gesto ya lo conoce todo el
  // mundo. `pointer: fine` es la pregunta correcta —¿hay un puntero preciso?—;
  // mirar el ancho de la pantalla habría dejado sin aviso a un portátil pequeño.
  const [rotateHintShown, setRotateHintShown] = useState(false)
  const [showRotateHint, setShowRotateHint] = useState(false)
  const hideRotateHint = useCallback(() => setShowRotateHint(false), [])

  useEffect(() => {
    if (!is3D || rotateHintShown) return
    if (typeof window === "undefined" || !window.matchMedia("(pointer: fine)").matches) return
    setRotateHintShown(true)
    setShowRotateHint(true)
  }, [is3D, rotateHintShown])

  // Solo en desarrollo, junto a `window.__mapa`: permite preguntar la altura
  // real de un punto desde la consola (`__mapa.__alturaReal(__mapa.getCenter())`)
  // sin caer en la trampa de queryTerrainElevation, que devuelve la altura
  // multiplicada por la exageración.
  useEffect(() => {
    if (!mapInstance || process.env.NODE_ENV !== "development") return
    mapInstance.__alturaReal = elevationAt
  }, [mapInstance, elevationAt])

  const { addVertices, removeVertices, clearSearchResult } = useExpedientSearchGL(
    mapRef,
    mapInstance,
    expedientCode,
    searchTrigger,
    onCoordinatesUpdate,
    setError,
    setShowErrorBanner,
  )

  // El panel lateral no habla con estos hooks: llama a métodos sobre el objeto
  // del mapa (`mapRef.current.clearDrawings()`, etc.), que es el contrato que ya
  // existía con el visor Leaflet. Se colocan aquí, en un efecto, y no dentro de
  // la creación del mapa, porque las funciones vienen de hooks que se ejecutan
  // después y hay que reemplazarlas cuando cambian.
  useEffect(() => {
    if (!mapInstance) return
    mapInstance.addVertices = addVertices
    mapInstance.removeVertices = removeVertices
    mapInstance.clearDrawings = clearDrawings
    mapInstance.clearSearchResult = clearSearchResult
    // Lo usa el campo de "ir a una coordenada" del panel: marca el punto por la
    // misma vía que el ratón, así que sale con el mismo símbolo y se borra con
    // la misma papelera.
    mapInstance.addPointAt = addPointAt
  }, [mapInstance, addVertices, removeVertices, clearDrawings, clearSearchResult, addPointAt])

  useEffect(() => {
    if (mapRef.current) return

    const map = new MapLibreMap({
      container: containerRef.current,
      style: createBaseStyle("osm"),
      center: INITIAL_CENTER,
      zoom: INITIAL_ZOOM,
      maxZoom: MAX_ZOOM,
      // Por defecto MapLibre no deja pasar de 60° de inclinación. Con terreno
      // real conviene poder acercarse más al horizonte para leer un valle a
      // contraluz, que es justo lo que uno quiere mirar en 3D.
      maxPitch: 85,
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

      {/* Los controles del mapa van todos a la derecha y el panel de consulta se
          queda con la izquierda entera. Estaban los dos a la izquierda y se
          estorbaban: al crecer el panel, su fila de botones acababa por debajo
          de esta columna, que al estar encima se comía los clics. Separarlos por
          lados quita el problema de raíz en vez de ir ajustando alturas. */}
      {/* bottom-10 y no bottom-4: en esa esquina va la atribución de
          OpenStreetMap, que las condiciones de uso obligan a mostrar, y el
          último botón se le montaba encima. */}
      <div className="absolute bottom-10 right-4 z-10 flex flex-col items-end space-y-2">
        {/* Ajustes de cómo se ve el mapa. Van encima de los botones de acción,
            en la misma columna, y cada uno solo aparece cuando hay algo que
            ajustar: un control que no hace nada visible confunde más que ayuda. */}
        {(is3D || isCompassActive) && (
          <div className="w-64 space-y-2">
            {is3D && (
              <div className="space-y-1.5 rounded-md bg-white px-3 py-2 shadow-md">
                <SliderRow
                  id="exageracion"
                  label="Exageración"
                  min={EXAGGERATION_MIN}
                  max={EXAGGERATION_MAX}
                  step="0.1"
                  value={exaggeration}
                  display={`${exaggeration.toFixed(1)}×`}
                  onChange={changeExaggeration}
                />
                {/* Girar e inclinar sin pelearse con la brújula de 29 px que trae
                    MapLibre, y sin tener que saber el atajo de Ctrl. */}
                <SliderRow
                  id="inclinacion"
                  label="Inclinación"
                  min={0}
                  max={PITCH_MAX}
                  step="1"
                  value={Math.round(pitch)}
                  display={`${Math.round(pitch)}°`}
                  onChange={changePitch}
                />
                <SliderRow
                  id="giro"
                  label="Giro"
                  min={0}
                  max={360}
                  step="1"
                  value={Math.round((bearing + 360) % 360)}
                  display={`${Math.round((bearing + 360) % 360)}°`}
                  onChange={changeBearing}
                />
                <button
                  type="button"
                  onClick={resetNorth}
                  className="flex items-center gap-1 whitespace-nowrap pt-0.5 text-[11px] font-medium text-blue-600 hover:text-blue-800"
                >
                  <Compass className="h-3 w-3" />
                  Volver a poner el norte arriba
                </button>
                {/* Decirlo evita que alguien lea el relieve como una medida. */}
                <p className="text-[10px] leading-tight text-gray-500">
                  La exageración solo afecta a cómo se ve: no cambia alturas ni áreas.
                </p>
              </div>
            )}

            {/* 250 px es mucho en un celular y poco en un monitor grande. */}
            {isCompassActive && (
              <div className="rounded-md bg-white px-3 py-2 shadow-md">
                <SliderRow
                  id="tamano-brujula"
                  label="Brújula"
                  min={COMPASS_SIZE_MIN}
                  max={COMPASS_SIZE_MAX}
                  step="10"
                  value={compassSize}
                  display={`${compassSize} px`}
                  onChange={(value) => changeCompassSize(Math.round(value))}
                />
              </div>
            )}
          </div>
        )}

        {/* La función diferenciadora: dibujar un polígono y salir con los
            archivos de las capas encendidas dentro de esa área. Va en esta
            columna de acciones del mapa, no junto a la barra de dibujo, para no
            solaparse con ella; solo aparece cuando hay un área dibujada. */}
        {hasArea && (
          <Button
            onClick={downloadArea}
            disabled={isDownloading}
            title="Descargar en un ZIP las capas encendidas dentro del área dibujada"
            className="bg-green-600 text-white hover:bg-green-700 disabled:opacity-60"
          >
            {isDownloading ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <Download className="mr-2 h-4 w-4" />
            )}
            {isDownloading ? "Preparando…" : "Descargar área"}
          </Button>
        )}

        <Button onClick={toggleBaseLayer} className="bg-white text-black hover:bg-gray-200">
          {baseLayer === "osm" ? (
            <Satellite className="mr-2 h-4 w-4" />
          ) : (
            <MapIcon className="mr-2 h-4 w-4" />
          )}
          {baseLayer === "osm" ? "Satélite" : "Mapa"}
        </Button>

        <Button
          onClick={toggleHillshade}
          aria-pressed={showHillshade}
          title="Sombrear el relieve sobre el mapa plano"
          className={
            showHillshade
              ? "bg-blue-50 text-blue-700 hover:bg-blue-100"
              : "bg-white text-black hover:bg-gray-200"
          }
        >
          <Mountain className="mr-2 h-4 w-4" />
          Relieve
        </Button>

        <Button
          onClick={toggle3D}
          aria-pressed={is3D}
          title="Levantar el terreno e inclinar la cámara"
          className={
            is3D ? "bg-blue-50 text-blue-700 hover:bg-blue-100" : "bg-white text-black hover:bg-gray-200"
          }
        >
          <Box className="mr-2 h-4 w-4" />
          {is3D ? "Volver a 2D" : "Ver en 3D"}
        </Button>

        <Button
          onClick={handleLocateUser}
          className={`transition-colors ${
            isLocating
              ? "bg-blue-50 text-blue-500 animate-pulse"
              : hasLocated
                ? "bg-blue-50 text-blue-600 hover:bg-blue-100"
                : "bg-white text-black hover:bg-gray-200"
          }`}
          title="Mostrar tu ubicación con el GPS"
        >
          <Crosshair className={`mr-2 h-4 w-4 ${isLocating ? "animate-spin" : ""}`} />
          {isLocating ? "Ubicando..." : hasLocated ? "Ubicación activa" : "Activar GPS"}
        </Button>

        {/* La brújula 360° se dibuja encima del marcador del GPS: sin ubicación
            no hay dónde ponerla. Estaba siempre visible y pulsarla sin el GPS
            encendido no hacía nada, que es la peor respuesta posible. */}
        {hasLocated && (
          <Button
            onClick={handleToggleCompass360}
            aria-pressed={isCompassActive}
            title="Girar una rosa de los vientos con la orientación del celular"
            className={`transition-colors ${
              isCompassActive
                ? "bg-blue-50 text-blue-600 hover:bg-blue-100"
                : "bg-white text-black hover:bg-gray-200"
            }`}
          >
            <Compass className={`mr-2 h-4 w-4 ${isCompassActive ? "text-blue-600" : ""}`} />
            {isCompassActive ? "Ocultar 360°" : "Brújula 360°"}
          </Button>
        )}

        <Button
          onClick={() =>
            window.open("https://www.linkedin.com/in/fabio-espinosa/", "_blank", "noopener,noreferrer")
          }
          title="Perfil del autor en LinkedIn"
          className="bg-white text-black hover:bg-gray-200"
        >
          <User className="mr-2 h-4 w-4" />
          Fabio A. Espinosa
        </Button>
      </div>

      <DrawToolbar
        mode={mode}
        startMode={startMode}
        deleteSelected={deleteSelected}
        drawingColor={drawingColor}
        onColorChange={handleColorChange}
        hasSelection={selectedIds.length > 0}
      />

      <CursorCoordinates map={mapInstance} />

      {showRotateHint && <RotateHint onClose={hideRotateHint} />}

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
          font-size: 13px;
          line-height: 1.35;
          border-radius: 4px;
          max-height: 400px;
          overflow-y: auto;
          padding: 10px 12px;
        }
        .maplibregl-popup-content h3 {
          font-size: 15px;
          font-weight: bold;
          margin-bottom: 6px;
          border-bottom: 1px solid #ccc;
          padding-bottom: 4px;
        }
        .maplibregl-popup-content p {
          margin: 0 0 2px;
        }
        /* Esta regla estaba puesta sobre todos los globos y era la causa de que
           la ficha de un expediente saliera con un renglón en blanco entre cada
           dato: el HTML de la ficha se arma con una plantilla de texto, que trae
           un salto de línea y su sangría entre etiqueta y etiqueta, y con
           pre-line esos saltos se dibujan como líneas de verdad. La ficha medía
           casi el doble de lo que decía.

           La necesita solo el globo de un vértice, cuyo texto sí lleva saltos
           deliberados, así que ahora va contra su clase y no contra todos. */
        .maplibregl-popup.popup-vertice .maplibregl-popup-content {
          white-space: pre-line;
        }
        /* La medida de una figura dibujada se distingue de las etiquetas de
           expediente: fondo oscuro en vez de texto con contorno, porque es un
           dato calculado y no un rótulo del mapa. */
        .map-label.draw-measure div {
          background: rgba(17, 24, 39, 0.85);
          color: #ffffff;
          border-radius: 4px;
          padding: 2px 6px;
          font-size: 12px;
          text-shadow: none;
        }
        /* Los botones de zoom y la brújula vienen de fábrica a 29 px, que con
           un trackpad es incómodo de acertar —sobre todo la brújula, que además
           hay que arrastrar—. A 36 px se pulsan sin apuntar. Los controles
           grandes de giro e inclinación viven aparte, en el panel del 3D. */
        .maplibregl-ctrl-group button {
          width: 36px;
          height: 36px;
        }
        .maplibregl-ctrl-group button .maplibregl-ctrl-icon {
          background-size: 22px 22px;
        }
        /* mapbox-gl-draw le pone estas clases al contenedor del mapa para
           cambiar el cursor, pero su CSS las escribe contra .mapboxgl-map, que
           en MapLibre se llama .maplibregl-map. Sin estas reglas el cursor no
           cambia nunca y no hay señal de que el mapa está en modo dibujo.
           (Ojo: nada de comillas invertidas dentro de este bloque; el CSS vive
           en una plantilla de texto delimitada por ese mismo carácter, así que
           una sola la cierra antes de tiempo. El compilador falla sin decir
           dónde.) */
        .maplibregl-map.mouse-add .maplibregl-canvas-container {
          cursor: crosshair;
        }
        .maplibregl-map.mouse-pointer .maplibregl-canvas-container {
          cursor: pointer;
        }
        .maplibregl-map.mouse-move .maplibregl-canvas-container {
          cursor: move;
        }
        /* Marcador de GPS y brújula. Mismo aspecto que en el visor Leaflet: el
           punto azul con su pulso, y la rosa de los vientos cuando la brújula
           está activa. La aguja la rota useGeolocationGL por estilo en línea. */
        .gps-compass-marker {
          background: transparent;
          border: none;
        }
        .gps-compass__ring {
          position: relative;
          border-radius: 9999px;
          background: transparent;
        }
        .gps-compass__dot {
          position: absolute;
          width: 16px;
          height: 16px;
          border-radius: 9999px;
          transform: translate(-50%, -50%);
          background: #007aff;
          border: 3px solid #ffffff;
          box-shadow: 0 0 6px rgba(0, 0, 0, 0.3);
          z-index: 3;
        }
        .gps-compass__pulse {
          position: absolute;
          width: 60px;
          height: 60px;
          border-radius: 9999px;
          transform: translate(-50%, -50%);
          background: rgba(0, 122, 255, 0.2);
          animation: gps-pulse 2.5s ease-out infinite;
          z-index: 1;
        }
        @keyframes gps-pulse {
          0% {
            transform: translate(-50%, -50%) scale(0.3);
            opacity: 1;
          }
          100% {
            transform: translate(-50%, -50%) scale(1.5);
            opacity: 0;
          }
        }
      `}</style>
    </>
  )
}
