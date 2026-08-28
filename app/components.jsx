"use client"

import { Fragment, useState, useEffect, useCallback, useMemo, useRef } from "react"
import dynamic from "next/dynamic"
import { Label } from "@/components/ui/label"
import { Button } from "@/components/ui/button"
import { Table, TableHeader, TableRow, TableHead, TableBody, TableCell } from "@/components/ui/table"
import { ChevronLeft, ChevronDown, Download, RefreshCw, Globe2 } from "lucide-react"
import ExportComponent from "./ExportComponent"
import { axisLabels, crsById, formatCoordinate, fromGeographic, SOURCE_CRS } from "./utils/crs"
import { areaById, DEFAULT_ORDER, initialLayerState, layerByKey } from "./utils/themeAreas"
import { LayerPanel } from "./components/LayerPanel"
import { AreaFilters } from "./components/AreaFilters"
import { AttributeTable } from "./components/AttributeTable"
import { CrsPicker } from "./components/CrsPicker"
import { ExpedientSearch } from "./components/ExpedientSearch"
import { matchesFilters } from "./utils/layerFilters"
import { readPreferences, writePreferences } from "./utils/preferences"

// `ssr: false` es obligatorio: MapLibre necesita el objeto `window` y una
// tarjeta gráfica, y ninguno de los dos existe cuando Next genera la página en
// el servidor.
const MapComponent = dynamic(() => import("./MapComponentGL"), {
  ssr: false,
  loading: () => <p>Cargando mapa...</p>,
})

// Los sistemas de coordenadas viven en utils/crs.js, no aquí: la tabla, la
// exportación y el campo de "ir a una coordenada" tienen que usar exactamente
// las mismas definiciones o mostrarían números distintos para el mismo punto.

export default function Component() {
  const [showSidebar, setShowSidebar] = useState(true)
  const [showTable, setShowTable] = useState(false)
  const [coordinates, setCoordinates] = useState([])
  const [coordinateRings, setCoordinateRings] = useState([])
  const [transformedCoordinates, setTransformedCoordinates] = useState([])
  const [showToggle, setShowToggle] = useState(false)
  const [showExportModal, setShowExportModal] = useState(false)
  const [selectedCoordinateSystem, setSelectedCoordinateSystem] = useState(SOURCE_CRS)
  const [expedientCode, setExpedientCode] = useState("")
  const [searchTrigger, setSearchTrigger] = useState(0)
  const [coordinatesAvailable, setCoordinatesAvailable] = useState(false)
  const [geoJsonData, setGeoJsonData] = useState(null)
  const mapRef = useRef(null)
  // Solo se guarda el «ya está listo»; el mapa en sí vive en mapRef.
  const [, setMapInitialized] = useState(false)
  // Estado de las capas: encendida, opacidad y colores, todo por clave. Antes
  // eran ocho estados sueltos —uno por interruptor y otro por deslizador—, que
  // con trece capas y su color serían treinta y nueve.
  const [layers, setLayers] = useState(initialLayerState)
  // El orden de pintado, de arriba abajo. Es lo que el usuario reordena
  // arrastrando en la pestaña "Activas".
  const [layerOrder, setLayerOrder] = useState(DEFAULT_ORDER)
  // Filtros sobre lo cargado, y los atributos con que el panel arma sus
  // opciones. Viven aquí y no en el mapa porque el panel es quien los enseña.
  // Un juego de filtros por área: con cuatro áreas y trece capas, un filtro
  // común se llenaba de opciones de cosas que ni siquiera estaban encendidas.
  const [areaFilters, setAreaFilters] = useState({})
  // El alcance sí es común: "en pantalla" o "toda la capa" describe cómo se
  // consulta, no qué se busca.
  const [filterScope, setFilterScope] = useState("viewport")
  // Lo que el mapa tiene cargado: atributos para armar el filtro, figuras con su
  // recuadro para la tabla, y qué capas recortó el servicio.
  const [layerData, setLayerData] = useState({ features: [], truncated: [] })
  // Lo que el servicio del SGC dice tener dentro de cada capa —los treinta y dos
  // departamentos, por ejemplo— y cuáles están marcados. Se descubre en el mapa,
  // porque hace falta el mapa para pedirlo, pero se dibuja aquí, bajo su capa:
  // encender un departamento es parte de encender la capa, no una ventana aparte.
  const [sgcState, setSgcState] = useState({})

  // Qué ventana flotante está abierta y a qué botón se ancla.
  const [filterPopover, setFilterPopover] = useState(null)
  const [searchPopover, setSearchPopover] = useState(null)
  const [crsPopover, setCrsPopover] = useState(null)
  const [showAttributeTable, setShowAttributeTable] = useState(false)

  /**
   * Las preferencias guardadas se aplican **después de montar**, no al crear el
   * estado.
   *
   * Es contraintuitivo y tiene una razón concreta: Next genera esta página en el
   * servidor, donde no existe el almacenamiento del navegador. Si el estado
   * inicial se leyera de ahí, el servidor pintaría los valores de fábrica y el
   * navegador los guardados, y React se encuentra dos árboles distintos: el
   * error de hidratación tira la página entera y la vuelve a pintar. Se vio en
   * el navegador; en el código no se nota.
   */
  const [prefsCargadas, setPrefsCargadas] = useState(false)

  /**
   * En un teléfono la hoja arranca recogida.
   *
   * Abierta ocupa más de la mitad de la pantalla, y lo primero que alguien
   * quiere ver al abrir un visor es el mapa. En escritorio no aplica: ahí el
   * panel es una columna al lado y no tapa nada.
   *
   * Se decide después de montar y no en el estado inicial, por lo mismo que las
   * preferencias: el servidor no sabe el ancho de la pantalla, y pintar algo
   * distinto de lo que pinta el navegador tira la página entera.
   */
  useEffect(() => {
    // `matchMedia` no existe en todos los entornos —jsdom, por ejemplo, donde
    // corren las pruebas—, y sin la comprobación esto lanzaba y se llevaba por
    // delante el montaje entero del panel.
    if (window.matchMedia?.("(max-width: 767px)")?.matches) setShowSidebar(false)
  }, [])

  useEffect(() => {
    const prefs = readPreferences()
    setSelectedCoordinateSystem(prefs.crs)
    setLayers(prefs.layers)
    setLayerOrder(prefs.layerOrder)
    setPrefsCargadas(true)
  }, [])

  // Guardar es un efecto y no una llamada dentro de cada manejador: así no hay
  // que acordarse de hacerlo en los cinco sitios donde se cambia una capa, y no
  // se puede olvidar en el sexto.
  //
  // El guardia de `prefsCargadas` no sobra: sin él, el primer render escribiría
  // los valores de fábrica encima de lo que el usuario tenía guardado, antes de
  // que el efecto de arriba llegara a leerlo.
  useEffect(() => {
    if (prefsCargadas) writePreferences({ layers })
  }, [layers, prefsCargadas])

  useEffect(() => {
    if (prefsCargadas) writePreferences({ layerOrder })
  }, [layerOrder, prefsCargadas])

  useEffect(() => {
    if (prefsCargadas) writePreferences({ crs: selectedCoordinateSystem })
  }, [selectedCoordinateSystem, prefsCargadas])

  const filtroDe = useCallback(
    (areaId) => areaFilters[areaId] ?? { selections: {}, areaRange: null },
    [areaFilters],
  )

  // Lo que viaja al mapa: el alcance, que es común, y el filtro de cada área.
  //
  // Antes viajaba además una copia del de Minería, aplanada, y era esa copia la
  // que el mapa usaba para todas las capas. Funcionaba solo porque las cuatro
  // capas conectadas son de Minería.
  const filters = useMemo(
    () => ({ scope: filterScope, byArea: areaFilters }),
    [areaFilters, filterScope],
  )

  const areaHasFilter = useCallback(
    (areaId) => {
      const { selections, areaRange } = filtroDe(areaId)
      return Object.values(selections).some((v) => v?.length > 0) || Boolean(areaRange)
    },
    [filtroDe],
  )

  const setAreaFilter = useCallback((areaId, cambios) => {
    setAreaFilters((current) => ({
      ...current,
      [areaId]: { ...(current[areaId] ?? { selections: {}, areaRange: null }), ...cambios },
    }))
  }, [])

  /**
   * Los registros que pasan el filtro, que es lo que enseña la tabla.
   *
   * Se calcula aquí y no se le pregunta al mapa qué está pintando: en modo
   * "toda la capa" hay resultados que ni siquiera están en pantalla, y llegar a
   * ellos por la tabla es justamente la gracia.
   */
  const registrosVisibles = useMemo(
    () =>
      layerData.features.filter((f) => {
        // Cada figura se juzga con el filtro de su propia área, no con el de
        // Minería para todas.
        const { selections, areaRange } = filtroDe(layerByKey(f.layerKey)?.areaId)
        return matchesFilters(f.properties, selections, areaRange)
      }),
    [layerData.features, filtroDe],
  )

  /**
   * Los atributos de lo cargado que pertenece a un área.
   *
   * Es con lo que la ventana de filtros arma sus opciones. Estaba escrito como
   * «si el área es Minería, todo lo cargado; si no, nada»: correcto hoy, y
   * equivocado en cuanto se conecte la primera capa de otra área.
   */
  const propiedadesDelArea = useCallback(
    (areaId) =>
      layerData.features
        .filter((f) => layerByKey(f.layerKey)?.areaId === areaId)
        .map((f) => f.properties),
    [layerData.features],
  )

  /** Llevar el mapa hasta un registro elegido en la tabla. */
  const enfocarRegistro = useCallback((registro) => {
    setShowAttributeTable(false)
    const map = mapRef.current
    if (!map || !registro?.bbox) return

    // `bboxOfGeometry` devuelve un objeto con nombres, no la tupla
    // [oeste, sur, este, norte] de GeoJSON. Leerlo como si fuera un arreglo
    // dejaba los cuatro valores en `undefined` y `fitBounds` no se quejaba: la
    // tabla se cerraba y el mapa se quedaba exactamente donde estaba. Solo se
    // vio comparando el centro antes y después en un navegador de verdad.
    const { west, south, east, north } = registro.bbox
    map.fitBounds(
      [
        [west, south],
        [east, north],
      ],
      { padding: 120, duration: 1200, maxZoom: 16 },
    )
  }, [])

  const actualizarCapa = useCallback((key, cambios) => {
    setLayers((current) => ({ ...current, [key]: { ...current[key], ...cambios } }))
  }, [])

  const alternarCapa = useCallback(
    (key) => setLayers((current) => ({ ...current, [key]: { ...current[key], on: !current[key].on } })),
    [],
  )

  const cambiarOpacidad = useCallback(
    (key, opacity) => actualizarCapa(key, { opacity }),
    [actualizarCapa],
  )

  const cambiarColor = useCallback(
    (key, fillColor, lineColor) => actualizarCapa(key, { fillColor, lineColor }),
    [actualizarCapa],
  )

  /** Lanza la búsqueda del expediente que entregue el buscador flotante. */
  const buscarExpediente = useCallback((codigo) => {
    setExpedientCode(codigo)
    setSearchTrigger((prev) => prev + 1)
    setShowToggle(true)
  }, [])

  // Era un `alert()`: el único diálogo del sistema operativo en toda la
  // interfaz, y encima bloquea la página hasta cerrarlo. Ahora el botón
  // sencillamente no aparece cuando no hay coordenadas que enseñar, que es
  // mejor respuesta que dejar pulsar algo para decir que no se puede.
  const handleShowCoordinates = () => setShowTable(true)

  const handleCloseTable = () => {
    setShowTable(false)
  }

  const handleReset = () => {
    setExpedientCode("")
    setCoordinates([])
    setCoordinateRings([])
    setTransformedCoordinates([])
    setShowTable(false)
    setShowToggle(false)
    setSearchTrigger(0)
    setCoordinatesAvailable(false)
    setGeoJsonData(null)
    if (mapRef.current) {
      mapRef.current.clearSearchResult()
      mapRef.current.removeVertices()
      mapRef.current.clearDrawings()
    }
  }

  const handleExportSHP = () => {
    setShowExportModal(true)
  }

  const handleCloseExportModal = () => {
    setShowExportModal(false)
  }

  const handleCoordinatesUpdate = useCallback((newCoordinates, newGeoJsonData, newRings = []) => {
    setCoordinates(newCoordinates)
    setCoordinateRings(newRings)
    setCoordinatesAvailable(newCoordinates.length > 0)
    setGeoJsonData(newGeoJsonData)
  }, [])

  // Índice del primer vértice de cada anillo, para intercalar un encabezado en la
  // tabla. Sin esto los huecos y las partes de un multipolígono se numeraban
  // seguidos, como si fueran un único contorno.
  const ringStartLabels = useMemo(() => {
    const labels = new Map()
    let offset = 0
    coordinateRings.forEach((ring) => {
      labels.set(offset, ring.label)
      offset += ring.coordinates.length
    })
    return labels
  }, [coordinateRings])

  useEffect(() => {
    // Recalcular también cuando no hay coordenadas: antes se conservaban las del
    // expediente anterior tras una búsqueda sin resultados.
    if (coordinates.length === 0) {
      setTransformedCoordinates([])
      return
    }
    setTransformedCoordinates(
      coordinates.map((coord) => fromGeographic(coord, selectedCoordinateSystem)),
    )
  }, [coordinates, selectedCoordinateSystem])

  const handleMapInitialized = useCallback((map) => {
    mapRef.current = map
    setMapInitialized(true)
  }, [])

  return (
    <div className="relative flex w-full h-screen bg-gray-100">
      {/* El panel y su pestaña se mueven juntos.

          Antes eran dos mandos distintos: una X dentro del panel para
          esconderlo y, cuando estaba escondido, un botón redondo en la esquina
          de la pantalla para volver a sacarlo. Dos sitios y dos formas para una
          sola cosa. Ahora es una pestaña pegada al costado del panel: la
          pestaña se desliza con él y queda asomando, así que ocultar y mostrar
          se hacen siempre en el mismo punto y la flecha dice hacia dónde va.

          El título «Títulos y Solicitudes» desapareció: el panel ya no es solo
          de la ANM —agrupa Geología, Hidrocarburos y Catastro—, y un encabezado
          que nombra a una sola de las cuatro áreas confunde más de lo que
          orienta. Sin él, el panel arranca 44 px más arriba. */}
      <div
        // **Dos disposiciones, una sola marca.**
        //
        // En pantalla ancha el panel es una columna a la izquierda con su
        // pestaña al costado, y se esconde deslizándose hacia la izquierda. En
        // un teléfono eso no cabe: 350 px de columna sobre una pantalla de 390
        // tapan el mapa entero. Ahí el panel pasa a ser una hoja que sube desde
        // abajo con la pestaña arriba, que es el gesto que ya usan todas las
        // aplicaciones de mapas y no hay que explicar.
        //
        // Se resuelve con clases por tamaño y no con JavaScript a propósito: un
        // `window.innerWidth` leído al montar no coincide con lo que pintó el
        // servidor, y eso tira la página entera para volver a pintarla —ya pasó
        // con las preferencias—.
        //
        // La cuenta del desplazamiento horizontal no es evidente: el bloque mide
        // el panel (350) más la pestaña (24) = 374, y arranca a 16 del borde.
        // Para que el panel salga entero hay que correrlo 366, o sea 100 % menos
        // media unidad. Con «100 % menos la pestaña» —que es lo que parece—
        // quedaba una franja de 16 px asomando, y eso solo se vio en una
        // captura.
        className={`fixed inset-x-0 bottom-0 z-10 flex max-h-[75vh] flex-col-reverse transition-transform duration-300 ease-out md:absolute md:inset-x-auto md:bottom-auto md:left-4 md:top-4 md:max-h-[calc(100vh-5rem)] md:flex-row md:items-start ${
          showSidebar
            ? "translate-y-0 md:translate-x-0"
            : "translate-y-[calc(100%-2.75rem)] md:translate-y-0 md:-translate-x-[calc(100%-0.5rem)]"
        }`}
      >
      <div
        // El alto máximo con desplazamiento interno no es un adorno: el panel
        // crece cada vez que se le añade algo, y al añadirle el campo de
        // coordenadas su fila de botones bajó hasta meterse debajo de los
        // controles del mapa, que quedaban por encima e impedían pulsarla. Con
        // un tope, el panel se desplaza por dentro en vez de invadir la
        // pantalla. Los 5rem de abajo son para la escala y la lectura del
        // cursor, que viven en esa esquina.
        className="flex max-h-[75vh] w-full flex-col overflow-y-auto overflow-x-hidden rounded-t-xl bg-white shadow-lg md:max-h-[calc(100vh-5rem)] md:w-[350px] md:rounded-xl"
      >
        <div className="p-4 space-y-4">
          {/* El buscador de expedientes se mudó a la lupa del área de Minería.
              Estaba aquí arriba, fijo, aunque solo sirva para esa área: pregunta
              por TENURE_ID y CODIGO_EXPEDIENTE, que son campos de la ANM. */}

          {/* El sistema de coordenadas gobierna todo lo que enseña una posición:
              la tabla, la exportación, la lectura del cursor sobre el mapa, las
              etiquetas de los puntos dibujados y la caja de escribir una
              coordenada.

              Era una lista desplegable con su explicación debajo, tres renglones
              para un ajuste que se toca una vez. Ahora es un botón que dice cuál
              está puesto; la explicación de cada sistema vive dentro, que es
              donde hace falta. */}
          {/* Sin filete arriba: separaba de nada —es lo primero del panel— y
              dejaba una raya suelta bajo el borde de la tarjeta.

              Y el rótulo, con la letra de las barras de área (Minería,
              Geología…): estaba en 14 px redonda, mientras que todos los demás
              encabezados del panel son de 11 versalitas. Era el único de su
              tamaño en la columna, y por eso se leía como de otra aplicación. */}
          <div className="space-y-1.5">
            <Label className="text-[11px] font-semibold uppercase tracking-[0.06em] text-slate-500">
              Sistema de coordenadas
            </Label>
            <button
              type="button"
              onClick={(event) => {
                const el = event.currentTarget
                setCrsPopover((actual) => (actual ? null : el))
              }}
              // El mismo gris que las barras de Minería, Geología y las demás: en
              // blanco parecía de otra familia, justo encima de ellas.
              className="flex h-9 w-full items-center gap-2 rounded-md border border-slate-200 bg-slate-50 px-3 text-left transition-colors hover:bg-slate-100"
            >
              <Globe2 className="h-4 w-4 shrink-0 text-slate-400" />
              <span className="min-w-0 flex-1 truncate text-[13px] text-slate-900">
                {crsById(selectedCoordinateSystem).label}
              </span>
              <span className="shrink-0 font-mono text-[10px] text-slate-400">
                EPSG:{selectedCoordinateSystem}
              </span>
              <ChevronDown className="h-4 w-4 shrink-0 text-slate-400" />
            </button>
          </div>

          <LayerPanel
            layers={layers}
            order={layerOrder}
            onToggle={alternarCapa}
            onOpacity={cambiarOpacidad}
            onColor={cambiarColor}
            onReorder={setLayerOrder}
            subLayers={sgcState.subLayers}
            chosenSub={sgcState.chosenSub}
            onToggleSubLayer={sgcState.onToggleSubLayer}
            areaHasFilter={areaHasFilter}
            onOpenFilters={(areaId, el) => setFilterPopover((a) => (a?.areaId === areaId ? null : { areaId, el }))}
            onOpenSearch={(areaId, el) => setSearchPopover((a) => (a?.areaId === areaId ? null : { areaId, el }))}
          />

          {showToggle && (
            <div className="space-y-4">
              {coordinatesAvailable && (
                <Button
                  variant="outline"
                  onClick={handleShowCoordinates}
                  className="w-full border border-slate-200 text-[13px] font-medium text-slate-700 hover:bg-slate-50"
                >
                  Mostrar coordenadas
                </Button>
              )}
              <div className="flex justify-between gap-4">
                <Button
                  variant="outline"
                  onClick={handleReset}
                  className="flex-1 border text-gray-700 hover:bg-gray-100"
                >
                  <RefreshCw className="mr-2" size={18} />
                  Borrar
                </Button>
                <Button onClick={handleExportSHP} className="flex-1 bg-green-500 hover:bg-green-600 text-white">
                  <Download className="mr-2" size={18} />
                  Exportar
                </Button>
              </div>
            </div>
          )}
        </div>
      </div>

        {/* La pestaña. Va fuera de la caja que se desplaza por dentro, para que
            no se vaya con el contenido al recorrer la lista de capas.

            En el teléfono es una barra ancha encima de la hoja, con el asa que
            todo el mundo reconoce; en escritorio, una lengüeta al costado. */}
        <button
          type="button"
          onClick={() => setShowSidebar((visible) => !visible)}
          aria-expanded={showSidebar}
          aria-label={showSidebar ? "Ocultar panel" : "Mostrar panel"}
          title={showSidebar ? "Ocultar panel" : "Mostrar panel"}
          className="flex h-11 w-full items-center justify-center gap-2 rounded-t-xl bg-white text-slate-400 shadow-[0_-2px_8px_rgba(15,23,42,0.08)] transition-colors hover:bg-slate-50 hover:text-slate-700 md:mt-3 md:h-14 md:w-6 md:rounded-l-none md:rounded-r-lg md:border-l md:border-slate-100 md:shadow-lg"
        >
          {/* El asa: solo en táctil, donde es la señal de «esto se arrastra». */}
          <span className="h-1 w-9 rounded-full bg-slate-300 md:hidden" />
          <span className="text-[13px] font-medium text-slate-600 md:hidden">Capas y filtros</span>
          <ChevronLeft
            className={`hidden h-4 w-4 transition-transform duration-300 md:block ${
              showSidebar ? "" : "rotate-180"
            }`}
          />
        </button>
      </div>

      <div className="flex-grow relative">
        <MapComponent
          expedientCode={expedientCode}
          onCoordinatesUpdate={handleCoordinatesUpdate}
          searchTrigger={searchTrigger}
          onMapInitialized={handleMapInitialized}
          layerState={layers}
          layerOrder={layerOrder}
          coordinateSystem={selectedCoordinateSystem}
          filters={filters}
          onLayerData={setLayerData}
          onSgcState={setSgcState}
          panelOpen={showSidebar}
        />
      </div>
      {showTable && (
        <div className="fixed inset-0 z-30 flex items-center justify-center bg-black bg-opacity-50 backdrop-blur-sm">
          <div className="bg-white p-6 rounded-lg shadow-xl w-full max-w-md m-4">
            {/* Aquí había una segunda lista desplegable con los diez sistemas,
                heredada de cuando el panel no tenía la suya. Eran dos mandos
                para el mismo ajuste, con dos aspectos distintos, y cambiar uno
                cambiaba el otro sin que se viera. Ahora esto solo dice en qué
                sistema está la tabla; para cambiarlo se usa el botón del panel,
                que es el único sitio donde se elige. */}
            <div className="mb-4 flex items-baseline gap-2">
              <h2 className="text-xl font-semibold text-slate-900">Coordenadas</h2>
              <span className="text-[13px] text-slate-500">
                {crsById(selectedCoordinateSystem).label}
              </span>
              <span className="font-mono text-[10px] text-slate-400">
                EPSG:{selectedCoordinateSystem}
              </span>
            </div>
            <div className="overflow-auto max-h-[60vh]">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="bg-gray-100 text-gray-700">Punto</TableHead>
                    <TableHead className="bg-gray-100 text-gray-700">
                      {axisLabels(selectedCoordinateSystem).first}
                    </TableHead>
                    <TableHead className="bg-gray-100 text-gray-700">
                      {axisLabels(selectedCoordinateSystem).second}
                    </TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {transformedCoordinates.map((coord, index) => (
                    <Fragment key={index}>
                      {coordinateRings.length > 1 && ringStartLabels.has(index) && (
                        <TableRow>
                          <TableCell
                            colSpan={3}
                            className="bg-gray-100 text-xs font-semibold text-gray-600 text-center"
                          >
                            {ringStartLabels.get(index)}
                          </TableCell>
                        </TableRow>
                      )}
                      <TableRow>
                        <TableCell className="text-center">{index + 1}</TableCell>
                        {/* Primero la ordenada —latitud o norte—, que es como se
                            leen las dos columnas de la cabecera; el par viene de
                            proj4 como [x, y], al revés. */}
                        <TableCell className="text-center">
                          {formatCoordinate(coord[1], selectedCoordinateSystem)}
                        </TableCell>
                        <TableCell className="text-center">
                          {formatCoordinate(coord[0], selectedCoordinateSystem)}
                        </TableCell>
                      </TableRow>
                    </Fragment>
                  ))}
                </TableBody>
              </Table>
            </div>
            <Button onClick={handleCloseTable} className="mt-4 w-full bg-red-500 hover:bg-red-600 text-white">
              Cerrar
            </Button>
          </div>
        </div>
      )}
      {filterPopover && (
        <AreaFilters
          area={areaById(filterPopover.areaId)}
          anchorRect={filterPopover.el.getBoundingClientRect()}
          anchorEl={filterPopover.el}
          properties={propiedadesDelArea(filterPopover.areaId)}
          selections={filtroDe(filterPopover.areaId).selections}
          areaRange={filtroDe(filterPopover.areaId).areaRange}
          scope={filterScope}
          truncated={layerData.truncated.length > 0}
          onChange={(selections) => setAreaFilter(filterPopover.areaId, { selections })}
          onArea={(areaRange) => setAreaFilter(filterPopover.areaId, { areaRange })}
          onScope={setFilterScope}
          onOpenTable={() => {
            setFilterPopover(null)
            setShowAttributeTable(true)
          }}
          onClose={() => setFilterPopover(null)}
        />
      )}

      {searchPopover && (
        <ExpedientSearch
          anchorRect={searchPopover.el.getBoundingClientRect()}
          anchorEl={searchPopover.el}
          areaColor={areaById(searchPopover.areaId).color}
          initialCode={expedientCode}
          onSearch={buscarExpediente}
          onClose={() => setSearchPopover(null)}
        />
      )}

      {crsPopover && (
        <CrsPicker
          current={selectedCoordinateSystem}
          anchorRect={crsPopover.getBoundingClientRect()}
          anchorEl={crsPopover}
          onChoose={setSelectedCoordinateSystem}
          onClose={() => setCrsPopover(null)}
        />
      )}

      {showAttributeTable && (
        <AttributeTable
          features={registrosVisibles}
          onPick={enfocarRegistro}
          onClose={() => setShowAttributeTable(false)}
        />
      )}

      {showExportModal && (
        <div className="fixed inset-0 z-30 flex items-center justify-center bg-black bg-opacity-50 backdrop-blur-sm">
          <div className="bg-white p-6 rounded-lg shadow-xl w-full max-w-md m-4">
            <h2 className="text-2xl font-bold mb-4 text-gray-800">Tipo de archivo</h2>
            <ExportComponent
              geoJsonData={geoJsonData}
              selectedCoordinateSystem={selectedCoordinateSystem}
              expedientCode={expedientCode}
            />
            <Button onClick={handleCloseExportModal} className="mt-4 w-full bg-red-500 hover:bg-red-600 text-white">
              Cerrar
            </Button>
          </div>
        </div>
      )}
    </div>
  )
}
