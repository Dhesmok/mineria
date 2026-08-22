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
import { useTerrainRasterGL } from "./hooks/map/useTerrainRasterGL"
import { useTerrainProfileGL } from "./hooks/map/useTerrainProfileGL"
import { useMapLayersGL } from "./hooks/map/useMapLayersGL"
import { useDrawControlGL } from "./hooks/map/useDrawControlGL"
import { useAreaDownloadGL } from "./hooks/map/useAreaDownloadGL"
import { useGeolocationGL } from "./hooks/map/useGeolocationGL"
import { useExpedientSearchGL } from "./hooks/map/useExpedientSearchGL"
import { BASE_LAYERS, createBaseStyle, INITIAL_CENTER, INITIAL_ZOOM, MAX_ZOOM } from "./utils/mapStyles"
import { COMPASS_SIZE_MAX, COMPASS_SIZE_MIN } from "./hooks/map/useGeolocationGL"
import { basemapById } from "./utils/basemaps"
import { readPreferences } from "./utils/preferences"
import { onMapTap } from "./utils/tapGesture"
import { crsById } from "./utils/crs"
import { ANM_LAYERS } from "./utils/anmLayers"
import { BasemapPicker } from "./components/BasemapPicker"
import { FloatingPanel } from "./components/FloatingPanel"
import { DrawToolbar } from "./components/DrawToolbar"
import { MapMenuItem, MapMenuPanel, MapMenuSeparator } from "./components/MapMenu"
import { ImageExport } from "./components/ImageExport"
import { TerrainQuery } from "./components/TerrainQuery"
import { TerrainRasterLegend } from "./components/TerrainRasterLegend"
import { TerrainProfile } from "./components/TerrainProfile"
import { CoordinateEntry, CursorCoordinates } from "./components/CoordinateReadout"
import { MapButton, MapNotice, RotateHint, SliderRow } from "./components/MapControls"
import {
  Box,
  ChevronLeft,
  Compass,
  Crosshair,
  Download,
  Loader2,
  ImageDown,
  MountainSnow,
  PencilRuler,
  Spline,
  Triangle,
  Layers,
  Mountain,
  Play,
  Square,
  User,
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




export default function MapComponentGL({
  onMapInitialized,
  expedientCode,
  searchTrigger,
  onCoordinatesUpdate,
  layerState,
  layerOrder,
  coordinateSystem,
  filters,
  onLayerData,
  panelOpen = false,
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

  const { basemap, showLabels, chooseBasemap } = useMapInitializationGL(mapRef, mapInstance)
  // Qué ventana de la columna está abierta y de qué botón salió. Una sola, y no
  // un estado por menú: abrir una tiene que cerrar la anterior, y con estados
  // separados se quedaban dos abiertas, una encima de otra.
  const [menuAbierto, setMenuAbierto] = useState(null)
  // El dibujo no es una ventana anclada como las demás: es un panel que se
  // arrastra y se queda puesto mientras se trabaja, así que su estado es aparte.
  const [dibujoAbierto, setDibujoAbierto] = useState(false)
  const [dibujoCompacto, setDibujoCompacto] = useState(false)
  const [exportandoImagen, setExportandoImagen] = useState(false)
  // La consulta de terreno se declara aquí arriba y no junto a su hook: quien
  // primero la necesita es `useMapLayersGL`, para callar la ficha del polígono
  // mientras está encendida. Declarada más abajo, leerla desde ahí daba
  // «Cannot access before initialization» y el visor no se pintaba.
  const [queryingTerrain, setQueryingTerrain] = useState(false)
  const [terrainResult, setTerrainResult] = useState(null)

  // El panel entrega el estado de las capas ya agrupado por clave: encendida,
  // opacidad y colores. Antes llegaban ocho props sueltas que había que volver a
  // juntar aquí con dos useMemo.
  const { showZoomInHint, truncatedLayers, loadedFeatures } = useMapLayersGL(
    mapRef,
    mapInstance,
    layerState,
    layerOrder,
    filters,
    setError,
    setShowErrorBanner,
    !queryingTerrain,
  )

  // Lo cargado sube al panel, que es donde viven el filtro y la tabla: las
  // opciones del filtro se arman con lo que hay, y la tabla necesita además el
  // recuadro de cada figura para poder llevar el mapa hasta ella. Va en una sola
  // llamada porque las tres cosas cambian a la vez.
  useEffect(() => {
    onLayerData?.({
      features: loadedFeatures,
      truncated: truncatedLayers,
    })
  }, [loadedFeatures, truncatedLayers, onLayerData])

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
    summary: drawSummary,
  } = useDrawControlGL(mapRef, mapInstance, coordinateSystem)

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
    isSpinning,
    spin,
    pitch,
    changePitch,
    elevationAt,
    terrainError,
    dismissTerrainError,
    setTerrainForQuery,
    queryTerrain,
  } = useTerrainGL(mapRef, mapInstance)

  const { profileActive, toggleProfile, profile, profileHover, onProfileHover } =
    useTerrainProfileGL(mapRef, mapInstance, { elevationAt, setTerrainForQuery, startMode })

  const { terrainMode, chooseTerrainMode, terrainRasterUnavailable } = useTerrainRasterGL(
    mapRef,
    mapInstance,
    { setTerrainForQuery },
  )

  /**
   * La consulta puntual al terreno: un modo, no un botón de una sola vez.
   *
   * Con la consulta encendida, cada clic en el mapa responde por ese punto y la
   * ficha del polígono se calla, para que la respuesta no quede tapada.
   * `terrainResult` es `null` mientras no se ha pulsado nada, y un objeto vacío
   * cuando se pulsó pero el modelo todavía no tenía dato ahí: son dos cosas
   * distintas y la tarjeta las dice distinto.
   */
  const toggleTerrainQuery = useCallback(() => {
    setQueryingTerrain((actual) => {
      const siguiente = !actual
      setTerrainForQuery(siguiente)
      setTerrainResult(null)
      return siguiente
    })
  }, [setTerrainForQuery])

  /**
   * Abrir la ventana de un botón, o cerrarla si ya estaba abierta por él.
   *
   * Lo segundo importa: sin ello, volver a pulsar el botón la cerraba —por el
   * clic de fuera— y la abría otra vez en el mismo gesto, así que parecía que no
   * respondiera.
   */
  const abrirMenu = useCallback((id, event) => {
    const el = event.currentTarget
    setMenuAbierto((actual) =>
      actual?.id === id ? null : { id, el, rect: el.getBoundingClientRect() },
    )
  }, [])

  const cerrarMenu = useCallback(() => setMenuAbierto(null), [])

  /**
   * Qué anuncia cada botón de grupo en su distintivo.
   *
   * Agrupar botones tiene un precio: lo que está encendido deja de verse. El
   * distintivo lo devuelve —«Pendiente», «2 figuras»— para que no haya que abrir
   * la ventana solo para averiguar en qué estado se quedó el mapa.
   */
  const terrenoActivo =
    terrainMode === "slope"
      ? "Pendiente"
      : terrainMode === "aspect"
        ? "Orientación"
        : queryingTerrain
          ? "Consulta"
          : profileActive
            ? "Perfil"
            : showHillshade
              ? "Relieve"
              : null

  const figurasDibujadas =
    (drawSummary?.polygons ?? 0) + (drawSummary?.lines ?? 0) + (drawSummary?.points ?? 0)
  const resumenDibujo = figurasDibujadas
    ? `${figurasDibujadas} ${figurasDibujadas === 1 ? "figura" : "figuras"}`
    : null

  useEffect(() => {
    if (!mapInstance || !queryingTerrain) return

    const alPulsar = (event) => setTerrainResult(queryTerrain(event.lngLat) ?? {})
    mapInstance.on("click", alPulsar)
    // Y el toque aparte: en táctil el clic no llega, porque el control de
    // dibujo cancela `touchend`. Ver `utils/tapGesture.js`.
    const quitarToque = onMapTap(mapInstance, alPulsar)
    // El cursor lo dice: en este modo el mapa se pregunta, no se navega.
    mapInstance.getCanvas().style.cursor = "crosshair"

    return () => {
      mapInstance.off("click", alPulsar)
      quitarToque()
      mapInstance.getCanvas().style.cursor = ""
    }
  }, [mapInstance, queryingTerrain, queryTerrain])

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
      // El fondo de partida tiene que ser el mismo que dice el botón. Estaba
      // fijo en "osm" desde cuando solo había dos fondos: el visor arrancaba con
      // el callejero mientras el botón anunciaba «Satélite», y no se notaba
      // hasta comparar la atribución de la esquina con lo que decía el botón.
      //
      // Y se lee de las preferencias, no del valor de fábrica: si no, quien
      // dejó puesto el satélite vería un parpadeo del gris de CARTO en cada
      // recarga antes de que el fondo guardado se aplicara encima.
      style: createBaseStyle(readPreferences().basemap),
      center: INITIAL_CENTER,
      zoom: INITIAL_ZOOM,
      maxZoom: MAX_ZOOM,
      // Por defecto MapLibre no deja pasar de 60° de inclinación. Con terreno
      // real conviene poder acercarse más al horizonte para leer un valle a
      // contraluz, que es justo lo que uno quiere mirar en 3D.
      //
      // El número sale de `PITCH_MAX` y no está escrito aquí: estuvo fijo en 85
      // mientras el deslizador ya usaba la constante, así que bajarla no bajaba
      // nada —arrastrando con Ctrl se seguía llegando a 85—.
      maxPitch: PITCH_MAX,
      // Sin esto, leer el lienzo devuelve una imagen en negro: WebGL descarta
      // el búfer en cuanto termina de pintar, salvo que se le pida guardarlo.
      // Es lo que hace posible exportar el mapa como imagen.
      preserveDrawingBuffer: true,
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
      <div
        // En el teléfono, con la hoja de capas abierta esta columna quedaba
        // encima de ella: los botones del mapa flotando sobre las filas del
        // panel, tapando justo la lupa y el filtro. Mientras la hoja está
        // abierta, la columna se aparta; en escritorio no hay conflicto porque
        // el panel vive al otro lado.
        // Dos columnas, no una: a la izquierda los paneles que se arrastran, a
        // la derecha los botones. Antes los paneles iban dentro de la columna,
        // encima de los botones, y con el de 3D abierto la columna crecía hacia
        // arriba y empujaba todo. Al costado quedan al lado de lo que los
        // gobierna y sin desplazar nada.
        //
        // Alineado abajo (`items-end`) para que el panel salga a la altura del
        // último botón y no flotando a media pantalla.
        className={`absolute bottom-16 right-2 z-10 items-end gap-2 md:bottom-10 md:right-4 ${
          panelOpen ? "hidden md:flex" : "flex"
        }`}
      >
        <div className="flex flex-col items-end gap-2">
          {is3D && (
            <FloatingPanel title="Opciones 3D" icon={Box}>
              <div className="space-y-1.5">
                <SliderRow
                  id="exageracion"
                  label="Exageración"
                  title="Solo afecta a cómo se ve: no cambia alturas ni áreas"
                  min={EXAGGERATION_MIN}
                  max={EXAGGERATION_MAX}
                  step="0.1"
                  value={exaggeration}
                  display={`${exaggeration.toFixed(1)}×`}
                  onChange={changeExaggeration}
                />
                {/* Girar e inclinar sin pelearse con la brújula de 29 px que
                    trae MapLibre, y sin tener que saber el atajo de Ctrl. */}
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
                <div className="flex items-center gap-2 pt-0.5">
                  {/* Play y stop en el mismo sitio: es un único estado con dos
                      caras, no dos acciones distintas. */}
                  <button
                    type="button"
                    onClick={spin}
                    aria-pressed={isSpinning}
                    title={isSpinning ? "Detener el giro" : "Girar el mapa solo, en bucle"}
                    className={`flex items-center gap-1 rounded-md border px-2 py-1 text-[11px] font-medium transition-colors ${
                      isSpinning
                        ? "border-slate-900 bg-slate-900 text-white"
                        : "border-slate-200 bg-white text-slate-700 hover:bg-slate-50"
                    }`}
                  >
                    {isSpinning ? <Square className="h-3 w-3" /> : <Play className="h-3 w-3" />}
                    {isSpinning ? "Detener" : "Girar solo"}
                  </button>
                  <button
                    type="button"
                    onClick={resetNorth}
                    title="Volver a dejar el norte hacia arriba"
                    className="flex items-center gap-1 whitespace-nowrap text-[11px] font-medium text-blue-600 hover:text-blue-800"
                  >
                    <Compass className="h-3 w-3" />
                    Norte arriba
                  </button>
                </div>
              </div>
            </FloatingPanel>
          )}

          {/* Las herramientas de dibujo. Panel flotante y no ventana anclada:
              se usan mientras se mira el mapa, y una ventana que se cierra al
              primer clic fuera obligaba a reabrirla para cambiar de herramienta
              o de color. Su equis lo cierra del todo —no lo guarda en un botón
              como el de 3D— porque para volver ya está el botón «Dibujo». */}
          {dibujoAbierto && (
            <FloatingPanel
              title="Dibujo y medidas"
              icon={PencilRuler}
              collapsible={false}
              compact={dibujoCompacto}
              onRequestClose={() => setDibujoAbierto(false)}
              // Recoger deja solo los iconos. Cuando ya se sabe cuál es cuál,
              // los nombres y las medidas ocupan sitio sobre el mapa sin
              // aportar nada; y quien todavía no lo sabe, los despliega.
              headerAction={
                <button
                  type="button"
                  onClick={() => setDibujoCompacto((compacto) => !compacto)}
                  aria-expanded={!dibujoCompacto}
                  aria-label={dibujoCompacto ? "Desplegar las herramientas" : "Recoger las herramientas"}
                  title={dibujoCompacto ? "Desplegar" : "Recoger a solo iconos"}
                  className="rounded p-0.5 text-slate-400 transition-colors hover:bg-slate-200 hover:text-slate-700"
                >
                  <ChevronLeft
                    className={`h-3.5 w-3.5 transition-transform ${dibujoCompacto ? "rotate-180" : ""}`}
                  />
                </button>
              }
            >
              <DrawToolbar
                compact={dibujoCompacto}
                mode={mode}
                startMode={startMode}
                deleteSelected={deleteSelected}
                drawingColor={drawingColor}
                onColorChange={handleColorChange}
                hasSelection={selectedIds.length > 0}
                summary={drawSummary}
              />
            </FloatingPanel>
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

        <div className="flex flex-col items-end space-y-2">
        {/* Ajustes de cómo se ve el mapa. Van encima de los botones de acción,
            en la misma columna, y cada uno solo aparece cuando hay algo que
            ajustar: un control que no hace nada visible confunde más que ayuda. */}
        {terrainMode && (
          <TerrainRasterLegend mode={terrainMode} unavailable={terrainRasterUnavailable} />
        )}

        {queryingTerrain && (
          <TerrainQuery result={terrainResult} onClose={toggleTerrainQuery} />
        )}

        {/* La función diferenciadora: dibujar un polígono y salir con los
            archivos de las capas encendidas dentro de esa área. Va en la columna
            de acciones del mapa y no en el panel de dibujo, para que se vea sin
            abrirlo; solo aparece cuando hay un área dibujada. */}
        {hasArea && (
          <MapButton
            onClick={downloadArea}
            disabled={isDownloading}
            icon={isDownloading ? Loader2 : Download}
            title="Descargar en un ZIP las capas encendidas dentro del área dibujada"
            className={`!border-emerald-700 !bg-emerald-600 !text-white hover:!bg-emerald-700 disabled:opacity-60 ${
              isDownloading ? "[&_svg]:animate-spin" : ""
            }`}
          >
            {isDownloading ? "Preparando…" : "Descargar área"}
          </MapButton>
        )}

        {/* Las herramientas de dibujo. Estaban sueltas sobre el mapa, en una
            esquina distinta según el tamaño de la pantalla; ahora salen de aquí,
            que es donde el usuario ya busca lo demás. */}
        <MapButton
          onClick={() => setDibujoAbierto((abierto) => !abierto)}
          active={dibujoAbierto || mode.startsWith("draw_")}
          icon={PencilRuler}
          badge={resumenDibujo}
          title="Dibujar y medir polígonos, líneas y puntos"
        >
          Dibujo
        </MapButton>

        {/* Relieve, pendiente, orientación y la consulta de cota eran cuatro
            botones seguidos que hacen lo mismo: mirar el terreno. Juntos ocupaban
            casi media columna en un teléfono. El 3D se queda fuera a propósito:
            es un interruptor que se usa a cada rato y esconderlo tras dos toques
            sería peor que el problema que se está resolviendo. */}
        <MapButton
          onClick={(event) => abrirMenu("terreno", event)}
          active={menuAbierto?.id === "terreno" || Boolean(terrenoActivo)}
          icon={Mountain}
          badge={terrenoActivo}
          title="Relieve, pendiente, orientación y consulta de cota"
        >
          Terreno
        </MapButton>

        <MapButton
          onClick={toggle3D}
          active={is3D}
          aria-pressed={is3D}
          icon={Box}
          title="Levantar el terreno e inclinar la cámara"
        >
          {is3D ? "Volver a 2D" : "Ver en 3D"}
        </MapButton>

        <MapButton
          onClick={handleLocateUser}
          active={hasLocated}
          icon={Crosshair}
          title="Mostrar tu ubicación con el GPS"
          className={isLocating ? "animate-pulse [&_svg]:animate-spin" : ""}
        >
          {isLocating ? "Ubicando…" : hasLocated ? "Ubicación activa" : "Activar GPS"}
        </MapButton>

        {/* La brújula 360° se dibuja encima del marcador del GPS: sin ubicación
            no hay dónde ponerla. Estaba siempre visible y pulsarla sin el GPS
            encendido no hacía nada, que es la peor respuesta posible. */}
        {hasLocated && (
          <MapButton
            onClick={handleToggleCompass360}
            active={isCompassActive}
            aria-pressed={isCompassActive}
            icon={Compass}
            title="Girar una rosa de los vientos con la orientación del celular"
          >
            {isCompassActive ? "Ocultar 360°" : "Brújula 360°"}
          </MapButton>
        )}

        <MapButton
          onClick={() => setExportandoImagen(true)}
          icon={ImageDown}
          title="Guardar el mapa como imagen, sin los controles"
        >
          Exportar imagen
        </MapButton>

        {/* Se llamaba «Satélite» y alternaba entre dos fondos. Con cinco, un
            botón que va rotando obliga a pasar por todos para llegar al que se
            quiere, así que ahora abre una lista.

            Va abajo del todo, pegado a la firma: el fondo se elige una vez al
            empezar y no se vuelve a tocar, mientras que relieve, 3D y GPS se
            encienden y apagan a cada rato. Lo que más se usa queda más cerca
            del pulgar. */}
        <MapButton
          onClick={(event) => abrirMenu("fondo", event)}
          active={menuAbierto?.id === "fondo"}
          icon={Layers}
          badge={basemapById(basemap).short}
          title="Elegir el mapa de fondo"
        >
          Mapa base
        </MapButton>

        <MapButton
          onClick={() =>
            window.open("https://www.linkedin.com/in/fabio-espinosa/", "_blank", "noopener,noreferrer")
          }
          icon={User}
          title="Perfil del autor en LinkedIn"
        >
          Fabio A. Espinosa
        </MapButton>
        </div>
      </div>

      {/* La caja de escribir coordenadas acompaña a la herramienta de punto: es
          la otra forma de hacer lo mismo. */}
      {mode === "draw_point" && (
        <CoordinateEntry
          crsId={coordinateSystem}
          onGo={(lon, lat) => {
            addPointAt([lon, lat])
            mapRef.current?.flyTo({ center: [lon, lat], zoom: 16, duration: 1200 })
          }}
        />
      )}

      <CursorCoordinates map={mapInstance} crsId={coordinateSystem} />

      {showRotateHint && <RotateHint onClose={hideRotateHint} />}

      {exportandoImagen && (
        <ImageExport
          map={mapInstance}
          crs={crsById(coordinateSystem)}
          layerNames={ANM_LAYERS.filter(({ key }) => layerState[key]?.on).map((l) => l.label)}
          sources={["Agencia Nacional de Minería", basemapById(basemap).source].filter(Boolean)}
          onClose={() => setExportandoImagen(false)}
        />
      )}

      {menuAbierto?.id === "fondo" && (
        <BasemapPicker
          current={basemap}
          showLabels={showLabels}
          anchorRect={menuAbierto.rect}
          anchorEl={menuAbierto.el}
          onChoose={chooseBasemap}
          onClose={cerrarMenu}
        />
      )}

      {/* Las cuatro formas de mirar el terreno, juntas.
          Pendiente y orientación se excluyen entre sí —las pinta la misma capa—,
          así que `chooseTerrainMode` con el modo que ya está puesto lo apaga. */}
      {menuAbierto?.id === "terreno" && (
        <MapMenuPanel
          label="Terreno"
          anchorRect={menuAbierto.rect}
          anchorEl={menuAbierto.el}
          onClose={cerrarMenu}
        >
          <MapMenuItem
            icon={Mountain}
            name="Relieve"
            hint="Sombrear los cerros sobre el mapa plano"
            active={showHillshade}
            onClick={toggleHillshade}
          />
          <MapMenuItem
            icon={Triangle}
            name="Pendiente"
            hint="Pintar la inclinación del terreno por colores"
            active={terrainMode === "slope"}
            onClick={() => chooseTerrainMode("slope")}
          />
          <MapMenuItem
            icon={Compass}
            name="Orientación"
            hint="Pintar hacia dónde mira cada ladera"
            active={terrainMode === "aspect"}
            onClick={() => chooseTerrainMode("aspect")}
          />
          <MapMenuSeparator />
          <MapMenuItem
            icon={MountainSnow}
            name="Consultar un punto"
            hint="Pulsa en el mapa y lee cota, pendiente y orientación"
            active={queryingTerrain}
            onClick={toggleTerrainQuery}
          />
          {/* Esta cierra la ventana al elegirla, a diferencia de las demás. No
              es un capricho: deja el mapa en modo dibujo, y la ventana se queda
              encima de donde hay que trazar la línea. Además se cerraría con
              Escape, que en modo dibujo **también cancela el trazo** — así que
              el usuario que la cerrara de esa forma se quedaría con el perfil
              encendido y sin poder dibujar, sin entender por qué. */}
          <MapMenuItem
            icon={Spline}
            name="Perfil longitudinal"
            hint="Dibuja una línea y mira el corte del terreno"
            active={profileActive}
            onClick={() => {
              toggleProfile()
              cerrarMenu()
            }}
          />
        </MapMenuPanel>
      )}

      {/* El perfil ocupa el ancho de la pantalla, no la columna de la derecha:
          es una gráfica de distancia, y en una columna de 256 px un recorrido de
          tres kilómetros no se lee. Va abajo, sobre la barra de escala, y deja
          libre el lado izquierdo por si el panel de capas está abierto. */}
      {profileActive && (
        <div className="pointer-events-none absolute bottom-16 left-2 right-2 z-20 md:bottom-10 md:left-auto md:right-4 md:w-[min(46rem,calc(100%-26rem))]">
          <TerrainProfile
            profile={profile}
            hovered={profileHover}
            onHover={onProfileHover}
            onClose={toggleProfile}
          />
        </div>
      )}

      {/* Los avisos van apilados en una sola columna centrada abajo. Estaban
          sueltos en dos alturas fijas, y cuando salían los dos a la vez, uno se
          montaba sobre la lectura del cursor. */}
      <div className="pointer-events-none absolute bottom-32 left-1/2 z-10 flex w-[min(30rem,calc(100%-2rem))] -translate-x-1/2 flex-col items-center gap-2 md:bottom-24">
        {terrainError && (
          <div className="pointer-events-auto">
            <MapNotice tone="warning" icon={Mountain} onClose={dismissTerrainError}>
              {terrainError}
            </MapNotice>
          </div>
        )}

        {showZoomInHint && (
          <MapNotice icon={Layers}>Acerca el mapa para ver las capas de títulos y solicitudes</MapNotice>
        )}

        {/* ArcGIS recorta la respuesta sin decirlo. Sin este aviso, el usuario
            creería estar viendo todos los títulos del área y podría sacar
            conclusiones sobre una zona a partir de datos incompletos. */}
        {truncatedLayers.length > 0 && (
          <MapNotice tone="warning">
            Hay más polígonos de los que caben en una consulta ({truncatedLayers.join(", ")}). Acerca
            el mapa para verlos todos.
          </MapNotice>
        )}
      </div>

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
        /* Un filete tenue entre dato y dato. Sin él las trece filas se leían
           como un bloque macizo y había que ir contando con el dedo para no
           saltarse una; con él, cada renglón es una unidad y el ojo salta de una
           a otra sin perderse. El aire va dentro de la fila y no entre filas,
           para que la separación se note sin alargar la ficha. */
        .maplibregl-popup-content p {
          margin: 0;
          padding: 4px 0;
          border-bottom: 1px solid #eef2f6;
        }
        .maplibregl-popup-content p:last-child {
          border-bottom: none;
          padding-bottom: 0;
        }
        /* La equis de cerrar, con tamaño de dedo.
           MapLibre la dibuja pensada para un ratón, y en un teléfono la ficha
           tapa media pantalla: la única forma de quitarla de en medio es
           acertarle a ese cuadrito. Se agranda solo donde el puntero es grueso
           —un dedo—, para no engordarla en el escritorio, donde ya se acierta. */
        @media (pointer: coarse) {
          .maplibregl-popup-close-button {
            width: 44px;
            height: 44px;
            font-size: 22px;
            line-height: 44px;
          }
        }
        /* La etiqueta del dato, en gris, y el valor en negro: así se distinguen
           de un vistazo sin necesidad de más líneas. */
        .maplibregl-popup-content p strong {
          font-weight: 500;
          color: #64748b;
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
        /* El punto del mapa que sigue al puntero de la gráfica del perfil.
           Con halo blanco por lo mismo que los vértices dibujados: sobre una
           imagen de satélite, un punto de color sin halo desaparece. */
        .profile-cursor {
          width: 14px;
          height: 14px;
          border-radius: 9999px;
          background: #3D5A80;
          border: 3px solid #ffffff;
          box-shadow: 0 1px 4px rgba(15, 23, 42, 0.45);
          pointer-events: none;
        }
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
        /* La lectura del rumbo, dentro de la rosa. Fondo oscuro y sólido en vez
           de texto con contorno: es un dato que se consulta, no un rótulo del
           mapa, y sobre una imagen de satélite el contorno no basta. */
        .gps-compass__lectura {
          position: absolute;
          left: 50%;
          transform: translateX(-50%);
          padding: 3px 10px;
          border-radius: 9999px;
          background: rgba(15, 23, 42, 0.82);
          color: #ffffff;
          font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
          font-weight: 600;
          letter-spacing: 0.04em;
          white-space: nowrap;
          pointer-events: none;
          z-index: 4;
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
