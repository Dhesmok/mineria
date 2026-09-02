import { useCallback, useEffect, useRef, useState } from "react"
import {
  HILLSHADE_LAYER_ID,
  TERRAIN_SOURCE_ID,
  TERRAIN_TILE_TEMPLATE,
} from "../../utils/mapStyles"
import {
  LOOKAROUND_DEM_ZOOM,
  SCENE_RADIUS_M,
  safeZoomFor,
} from "../../utils/camera3d"
import { reliefAround } from "../../utils/demTileLoader"
import { sampleGrid, slopeAspectFrom } from "../../utils/terrainAnalysis"

/**
 * Terreno 3D y sombreado del relieve.
 *
 * Son dos cosas distintas que comparten el mismo modelo de elevación:
 *
 * - **Relieve** (hillshade) sombrea las laderas sobre el mapa plano. Sirve para
 *   leer la topografía sin inclinar nada, que es como se mira un mapa la mayor
 *   parte del tiempo.
 * - **3D** inclina la cámara y levanta el terreno de verdad.
 *
 * Van separados porque responden a necesidades distintas, pero encender el 3D
 * enciende el relieve: en vista inclinada, sin sombras, un cerro y un valle se
 * parecen demasiado.
 */

/**
 * Inclinación de la cámara al entrar en 3D.
 *
 * Estaba en 58°, que con un máximo de 72 se lee como «casi al tope»: la entrada
 * en 3D parecía un giro brusco de cámara más que una inclinación. A 45° la
 * escena se levanta con claridad, se sigue reconociendo dónde estaba uno, y de
 * paso la cámara queda un tercio más alta —el desnivel va con el coseno—, así que
 * hay que alejarse menos para salvar las lomas.
 */
export const PITCH_3D = 45
export const EXAGGERATION_DEFAULT = 1.5
export const EXAGGERATION_MIN = 0.5
export const EXAGGERATION_MAX = 3

/**
 * El cielo. Sin él, al inclinar la cámara el horizonte queda cortado en seco
 * contra el fondo de la página y el relieve parece flotar en el vacío.
 */
const SKY = {
  "sky-color": "#8fc3f2",
  "horizon-color": "#dfeaf5",
  "fog-color": "#e8eef4",
  "horizon-fog-blend": 0.6,
  "fog-ground-blend": 0.1,
}

/**
 * Hasta dónde deja inclinarse la cámara. Es el maxPitch con que se crea el mapa.
 *
 * Estaba en 85°. Los últimos grados son los que meten el horizonte dentro de la
 * pantalla, y con el horizonte entran cientos de teselas lejanas que ocupan
 * cuatro filas de píxeles: se pagan enteras y no se ven. A 72° el terreno
 * cercano se sigue leyendo igual de bien y el trabajo baja mucho.
 */
export const PITCH_MAX = 72

/**
 * Velocidad del giro continuo, en grados por segundo. Una vuelta completa cada
 * 36 segundos: lo bastante lento para leer el terreno mientras pasa.
 */
const SPIN_DEGREES_PER_SECOND = 10

/**
 * Cuántas teselas de elevación pueden fallar antes de dar el 3D por perdido.
 *
 * Una o dos fallan por mil motivos pasajeros. Cuatro seguidas dentro de la misma
 * sesión de 3D ya no es mala suerte: es que el servicio no está respondiendo.
 */
const TERRAIN_FAILURES_LIMIT = 4

/**
 * Cuánto se espera, como mucho, a que el terreno tenga teselas antes de inclinar.
 *
 * Con red buena no se llega a notar. Si la red está mal, más vale entrar en 3D
 * con la cámara mal colocada que dejar el botón sin responder: lo primero se
 * arregla moviendo el mapa, lo segundo parece que el visor se colgó.
 */
const TERRAIN_WAIT_MS = 1500

/**
 * Espera a que el modelo de elevación esté cargado y MapLibre conozca la cota del centro.
 *
 * **No basta con `areTilesLoaded()`**: al encender el terreno desde 2D, las teselas del
 * mapa plano ya estaban cargadas y `areTilesLoaded()` devolvía `true` de inmediato (en 0 ms),
 * antes de que MapLibre siquiera empezara a pedir o decodificar el DEM. La cámara
 * calculaba su pose con cota cero y luego, al subir el terreno a 2.000 m, quedaba atrapada en el suelo.
 *
 * Esperamos a que `queryTerrainElevation(centro)` devuelva una cota válida o a que el
 * mapa emita `idle`/`render` con el terreno ya decodificado.
 */
const esperarAlTerreno = (map, ms = TERRAIN_WAIT_MS) =>
  new Promise((listo) => {
    if (!map) {
      listo()
      return
    }

    const centro = map.getCenter?.()
    if (centro && map.queryTerrainElevation?.(centro) != null) {
      listo()
      return
    }

    let reloj = 0
    let terminado = false

    const terminar = () => {
      if (terminado) return
      terminado = true
      clearTimeout(reloj)
      map.off?.("idle", onIdle)
      map.off?.("render", onRender)
      map.off?.("data", onData)
      listo()
    }

    const onIdle = () => terminar()

    const onRender = () => {
      if (centro && map.queryTerrainElevation?.(centro) != null) {
        terminar()
      }
    }

    const onData = (e) => {
      if (e?.dataType === "source" && e?.sourceId === TERRAIN_SOURCE_ID) {
        if (centro && map.queryTerrainElevation?.(centro) != null) {
          terminar()
        }
      }
    }

    reloj = setTimeout(terminar, ms)
    map.on?.("idle", onIdle)
    map.on?.("render", onRender)
    map.on?.("data", onData)
  })

export const useTerrainGL = (mapRef, mapInstance) => {
  const [is3D, setIs3D] = useState(false)
  /**
   * El 3D no podía fallar de forma visible.
   *
   * Si las teselas de elevación no llegan, MapLibre inclina la cámara igual y
   * enseña un plano inclinado sin relieve, sin decir nada. «El 3D se ve raro» y
   * «el 3D no cargó» son problemas distintos con soluciones distintas, y así se
   * veían igual.
   */
  const [terrainError, setTerrainError] = useState(null)
  const [showHillshade, setShowHillshade] = useState(false)
  const [exaggeration, setExaggeration] = useState(EXAGGERATION_DEFAULT)
  // Giro e inclinación actuales de la cámara. Están aquí para que los controles
  // grandes de la interfaz muestren dónde está el mapa ahora mismo, se haya
  // llegado ahí con ellos o arrastrando con Ctrl.
  const [bearing, setBearing] = useState(0)
  const [pitch, setPitch] = useState(0)
  // ¿Está girando solo? Es un play/stop, no un ajuste.
  const [isSpinning, setIsSpinning] = useState(false)

  // La exageración se lee dentro de callbacks creados una sola vez.
  const exaggerationRef = useRef(exaggeration)
  exaggerationRef.current = exaggeration
  // Y el giro continuo, dentro del manejador de `moveend`.
  const spinningRef = useRef(isSpinning)
  spinningRef.current = isSpinning
  // Para saber, al salir de la consulta puntual, si el terreno lo había puesto
  // el 3D: quitarlo entonces apagaría el 3D por debajo.
  const is3DRef = useRef(is3D)
  is3DRef.current = is3D
  /**
   * Cuánto sobresale el terreno de alrededor por encima del centro, en metros y
   * sin exagerar.
   *
   * El desnivel y no la cota: MapLibre pone la cámara sobre el suelo del punto
   * que mira, así que lo que hay que salvar es lo que las lomas suben respecto de
   * ese punto. Se mide al entrar en 3D y al terminar de mover el mapa, y de ahí
   * lo leen los deslizadores, que no pueden esperar a una consulta en cada paso
   * del arrastre. `null` mientras no se sepa.
   */
  const desnivelRef = useRef(null)

  const setHillshadeVisible = useCallback(
    (visible) => {
      const map = mapRef.current
      if (!map?.getLayer(HILLSHADE_LAYER_ID)) return
      map.setLayoutProperty(HILLSHADE_LAYER_ID, "visibility", visible ? "visible" : "none")
    },
    [mapRef],
  )

  const toggleHillshade = useCallback(() => {
    setShowHillshade((current) => {
      const next = !current
      setHillshadeVisible(next)
      return next
    })
  }, [setHillshadeVisible])

  const dismissTerrainError = useCallback(() => setTerrainError(null), [])

  /**
   * Mide cuánto sobresale el terreno de alrededor, y lo guarda.
   *
   * **Se le pregunta al modelo directamente, no a MapLibre**, y esa es la parte
   * que no es evidente: MapLibre solo tiene las teselas de elevación de lo que
   * está dibujando, así que justo en el caso que importa —mucho zoom, cámara ya
   * bajo tierra— `queryTerrainElevation` responde cero. Medido sobre un terreno
   * sintético de 1.800 m: a zoom 13 y 14 responde bien, de 15 en adelante da 0.
   * Preguntarle a él habría dado un techo de cero y no habría corregido nada.
   */
  /**
   * La medida en curso, para abandonarla si llega otra.
   *
   * Al mover el mapa en 3D se vuelve a medir en cada `moveend`. Casi siempre sale
   * de la memoria —una tesela de este nivel abarca 19 km—, pero al cruzar el
   * borde de una tesela con la red lenta se encolaban mosaicos que ya no le
   * importaban a nadie, y el último en llegar podía ser el más viejo: la cámara
   * acababa calculando con el desnivel de donde ya no está.
   */
  const medicionRef = useRef(null)

  const medirElDesnivel = useCallback(async (map) => {
    const centro = map.getCenter()

    medicionRef.current?.abort()
    const control = new AbortController()
    medicionRef.current = control

    try {
      const medida = await reliefAround(TERRAIN_TILE_TEMPLATE, {
        lng: centro.lng,
        lat: centro.lat,
        radiusMeters: SCENE_RADIUS_M,
        zoom: LOOKAROUND_DEM_ZOOM,
        signal: control.signal,
      })
      // Si mientras tanto arrancó otra medida, la que manda es esa: lo que se
      // acaba de calcular es de un sitio donde ya no se está mirando.
      if (medicionRef.current !== control) return desnivelRef.current
      desnivelRef.current = medida?.relief ?? null
    } catch {
      // Sin modelo no hay nada que calcular.
      if (medicionRef.current === control) desnivelRef.current = null
    }
    return desnivelRef.current
  }, [])

  /**
   * El zoom seguro con la cima ya medida. Sin espera, para los deslizadores.
   *
   * Los controles de exageración e inclinación tienen el mismo problema que el
   * botón —subir la exageración a 3× levanta el terreno al doble que a 1,5×, e
   * inclinar más baja la cámara—, pero se arrastran, y no se puede consultar el
   * modelo en cada paso del arrastre. De ahí que la cima se guarde.
   *
   * Si no se sabe la cima, **no se toca el zoom**: dejar la vista como está hoy
   * es mejor que alejarse por un número inventado.
   */
  const zoomParaMirarElRelieve = useCallback((map, pitch, exageracion) => {
    if (desnivelRef.current === null) return map.getZoom()

    return safeZoomFor({
      currentZoom: map.getZoom(),
      latitude: map.getCenter().lat,
      pitch,
      viewportHeight: map.getCanvas().clientHeight,
      fov: map.getVerticalFieldOfView(),
      // Lo que hay que esquivar es el relieve **dibujado**, que es el desnivel
      // por la exageración. Con 3× una loma que sube 700 m sube 2.100.
      reliefMeters: desnivelRef.current * (exageracion || 1),
    })
  }, [])

  /**
   * Entrar y salir del 3D.
   *
   * **Los efectos van fuera del actualizador de estado.** Estuvieron dentro de
   * `setIs3D(current => …)`, que es el patrón que ya costó una tanda con el
   * perfil longitudinal: React puede ejecutar ese actualizador más de una vez
   * para el mismo cambio, y ahí dentro no puede haber nada que no se pueda
   * repetir. Aquí, además, ahora hay una espera de por medio.
   */
  const toggle3D = useCallback(async () => {
    const map = mapRef.current
    if (!map) return

    setTerrainError(null)
    const entrando = !is3DRef.current
    is3DRef.current = entrando
    setIs3D(entrando)

    if (!entrando) {
      // `null` y no `undefined`: con undefined, MapLibre entiende "no me digas
      // nada" y deja el terreno puesto.
      map.setTerrain(null)
      map.setSky(undefined)
      map.easeTo({ pitch: 0, bearing: 0, duration: 700 })
      // El relieve se queda encendido a propósito: sigue siendo útil en plano, y
      // apagarlo de golpe al volver a 2D se siente como si el mapa hubiera
      // perdido información.
      return
    }

    map.setTerrain({ source: TERRAIN_SOURCE_ID, exaggeration: exaggerationRef.current })
    map.setSky(SKY)
    // **El relieve ya no se enciende solo al entrar en 3D.** El sombreado es una
    // segunda pasada sobre el mismo modelo que el terreno ya está usando, y en
    // 3D la forma la da la propia geometría: la silueta contra el cielo y la
    // perspectiva ya dicen qué sube y qué baja. Quien lo quiera lo enciende.

    // **Aquí hay que esperar, y no es por cortesía.** MapLibre coloca la cámara
    // sobre la cota del centro, pero solo si en ese instante la conoce. Con
    // `setTerrain` y el movimiento seguidos, la pose se calcula con cota cero —y
    // no la vuelve a tocar nunca—: la cámara se quedaba dentro del cerro. Se
    // comprobó dejándolo quince segundos, y ahí seguía.
    await Promise.all([medirElDesnivel(map), esperarAlTerreno(map)])

    const zoom = zoomParaMirarElRelieve(map, PITCH_3D, exaggerationRef.current)
    // Mientras se consultaba el modelo pudo pulsarse otra vez el botón.
    if (!is3DRef.current) return

    // Un solo movimiento, no dos: alejarse y luego inclinarse se ve como si el
    // mapa dudara.
    map.easeTo({ pitch: PITCH_3D, zoom, duration: 700 })
  }, [mapRef, medirElDesnivel, zoomParaMirarElRelieve])

  const changeExaggeration = useCallback(
    (value) => {
      setExaggeration(value)
      const map = mapRef.current
      // Solo tiene efecto con el terreno puesto. Sin la comprobación,
      // setTerrain lo encendería desde el slider, que no es lo que nadie espera
      // al mover una barra.
      if (!map?.getTerrain()) return

      map.setTerrain({ source: TERRAIN_SOURCE_ID, exaggeration: value })

      // Subir la exageración levanta el terreno sin mover la cámara: de 1,5× a
      // 3× un cerro de 2.000 m pasa de 3.000 a 6.000, y lo que era una vista
      // aérea acaba dentro de la montaña. Solo en 3D: en vista cenital la cámara
      // mira desde arriba y da igual dónde esté.
      if (!is3DRef.current) return
      const zoom = zoomParaMirarElRelieve(map, map.getPitch(), value)
      // `jumpTo` y no `easeTo`: mientras se arrastra la barra, una animación por
      // cada paso hace que la cámara persiga al control con retraso.
      if (zoom < map.getZoom()) map.jumpTo({ zoom })
    },
    [mapRef, zoomParaMirarElRelieve],
  )

  /**
   * Girar e inclinar con un control grande, en vez de con la brújula del zoom.
   *
   * La brújula que trae MapLibre mide 29 px y hay que arrastrarla con precisión;
   * en un portátil con trackpad es incómoda, y en el mapa hay que saber que
   * existe el atajo de Ctrl. Estos dos deslizadores hacen lo mismo con el dedo
   * o el ratón, sin atajos que descubrir.
   *
   * `jumpTo` y no `easeTo`: mientras se arrastra la barra, una animación por
   * cada paso hace que la cámara persiga al control con retraso.
   */
  const changeBearing = useCallback(
    (value) => {
      setBearing(value)
      mapRef.current?.jumpTo({ bearing: value })
    },
    [mapRef],
  )

  const changePitch = useCallback(
    (value) => {
      setPitch(value)
      const map = mapRef.current
      if (!map) return

      // Inclinar baja la cámara: conserva la distancia al punto que mira, así que
      // se acerca al suelo. A 72° se queda al 31 % de la altura que tenía plana.
      const zoom =
        is3DRef.current && map.getTerrain()
          ? zoomParaMirarElRelieve(map, value, exaggerationRef.current)
          : map.getZoom()

      map.jumpTo(zoom < map.getZoom() ? { pitch: value, zoom } : { pitch: value })
    },
    [mapRef, zoomParaMirarElRelieve],
  )

  /** Vuelve a poner el norte arriba sin tocar la inclinación. */
  const resetNorth = useCallback(() => {
    setBearing(0)
    mapRef.current?.easeTo({ bearing: 0, duration: 500 })
  }, [mapRef])

  /**
   * Giro continuo, para mirar el relieve sin tener que arrastrar.
   *
   * Va con `requestAnimationFrame` y no con un temporizador: el navegador lo
   * sincroniza con el repintado de la pantalla, así que el giro sale parejo en
   * vez de a tirones, y se detiene solo cuando la pestaña pasa a segundo plano
   * en lugar de acumular fotogramas que nadie ve.
   *
   * El paso se mide en grados por segundo y no por fotograma: en una pantalla
   * de 120 Hz, un paso por fotograma giraría al doble de velocidad que en una
   * de 60.
   */
  const spin = useCallback(() => {
    setIsSpinning((current) => !current)
  }, [])

  useEffect(() => {
    if (!isSpinning || !mapInstance) return

    let frame = 0
    let previous = performance.now()
    let lastPublished = 0

    const step = (now) => {
      const seconds = (now - previous) / 1000
      previous = now
      // jumpTo y no easeTo: una animación por fotograma se pisaría con la
      // siguiente y el giro saldría a saltos.
      const bearing = mapInstance.getBearing() + SPIN_DEGREES_PER_SECOND * seconds
      mapInstance.jumpTo({ bearing })

      // El deslizador de giro sigue al mapa, pero no a 60 veces por segundo:
      // cada jumpTo dispara un `moveend`, y publicar eso al estado repintaría el
      // visor entero en cada fotograma. Cuatro veces por segundo basta para que
      // el control se vea vivo y no cuesta nada.
      if (now - lastPublished > 250) {
        lastPublished = now
        setBearing(mapInstance.getBearing())
      }

      frame = requestAnimationFrame(step)
    }

    frame = requestAnimationFrame(step)

    return () => {
      cancelAnimationFrame(frame)
      // Al parar, el estado se pone al día con dónde quedó de verdad la cámara.
      setBearing(mapInstance.getBearing())
    }
  }, [isSpinning, mapInstance])

  // Al salir del 3D se para el giro: seguir dando vueltas sobre el mapa plano
  // marea y no enseña nada.
  useEffect(() => {
    if (!is3D) setIsSpinning(false)
  }, [is3D])

  /**
   * El desnivel se vuelve a medir al terminar de mover, mientras se está en 3D.
   *
   * Sin esto, los deslizadores seguirían calculando con la altura del sitio
   * donde se entró en 3D: uno se va del valle a la cordillera y la exageración
   * cree que sigue sobre el valle. Casi siempre sale de la memoria, porque una
   * tesela de este nivel abarca 19 km y moverse dentro de ella no pide nada.
   */
  useEffect(() => {
    if (!mapInstance || !is3D) return

    const remedir = async () => {
      // Mientras gira solo, cada fotograma dispara un `moveend` y la cámara no
      // se está desplazando: no hay desnivel nuevo que medir.
      if (spinningRef.current) return
      const desnivel = await medirElDesnivel(mapInstance)
      if (desnivel !== null && is3DRef.current) {
        const safeZoom = zoomParaMirarElRelieve(
          mapInstance,
          mapInstance.getPitch(),
          exaggerationRef.current,
        )
        // Si al desplazarse a una zona más montañosa la cámara quedó por debajo de las lomas,
        // elevar suavemente la vista para no colisionar contra el relieve.
        if (safeZoom < mapInstance.getZoom() - 0.25) {
          mapInstance.easeTo({ zoom: safeZoom, duration: 500 })
        }
      }
    }

    mapInstance.on("moveend", remedir)
    return () => mapInstance.off("moveend", remedir)
  }, [mapInstance, is3D, medirElDesnivel, zoomParaMirarElRelieve])

  // El mapa también se gira e inclina arrastrando con Ctrl, o con dos dedos en
  // el celular. Sin escuchar esos eventos, los deslizadores se quedarían
  // marcando el último valor que se les puso y mentirían sobre dónde está la
  // cámara.
  useEffect(() => {
    if (!mapInstance) return

    const syncCamera = () => {
      // Mientras gira solo, el propio bucle publica el rumbo a su ritmo. Sin
      // esta salida, cada uno de sus `jumpTo` entraría también por aquí y el
      // visor se repintaría en cada fotograma.
      if (spinningRef.current) return
      setBearing(mapInstance.getBearing())
      setPitch(mapInstance.getPitch())
    }

    mapInstance.on("rotateend", syncCamera)
    mapInstance.on("pitchend", syncCamera)
    mapInstance.on("moveend", syncCamera)

    return () => {
      mapInstance.off("rotateend", syncCamera)
      mapInstance.off("pitchend", syncCamera)
      mapInstance.off("moveend", syncCamera)
    }
  }, [mapInstance])

  /**
   * Altura del terreno en un punto, **en metros de verdad**.
   *
   * Existe por una trampa que costaría cara: `queryTerrainElevation` de MapLibre
   * no devuelve la altura del dato, sino la altura *ya multiplicada por la
   * exageración*. Con el slider en 3×, un cerro de 1.880 m se reporta como
   * 5.639 m. Nada avisa; el número simplemente sale mal.
   *
   * Cualquier código que lea alturas —el recorte de DEM de la Fase 5, un rótulo
   * de cota, un perfil topográfico— tiene que pasar por aquí y no por MapLibre
   * directamente. De ahí también el aviso bajo el slider: la exageración es un
   * efecto visual y no cambia ningún dato.
   *
   * Recordatorio aparte, ya anotado en CLAUDE.md: las alturas de los DEM
   * globales son elipsoidales. Para cotas ortométricas hay que aplicar geoide.
   *
   * @returns {number|null} metros, o null si no hay terreno o el dato no ha
   *   llegado todavía
   */
  const elevationAt = useCallback(
    (lngLat) => {
      const map = mapRef.current
      const terrain = map?.getTerrain()
      if (!terrain) return null

      const exaggerated = map.queryTerrainElevation(lngLat)
      if (exaggerated === null || exaggerated === undefined) return null

      const factor = terrain.exaggeration ?? 1
      return factor === 0 ? 0 : exaggerated / factor
    },
    [mapRef],
  )

  /**
   * Vigila que el modelo de elevación esté llegando de verdad.
   *
   * MapLibre avisa de las teselas que no puede cargar por el evento `error`,
   * con el identificador de la fuente. Solo se cuentan mientras el 3D está
   * puesto: en 2D, la fuente ni se consulta.
   */
  useEffect(() => {
    if (!mapInstance || !is3D) return

    let fallos = 0
    const alFallar = (evento) => {
      if (evento?.sourceId !== TERRAIN_SOURCE_ID) return
      fallos += 1
      if (fallos < TERRAIN_FAILURES_LIMIT) return

      // Volver a 2D y no dejar el plano inclinado: una cámara inclinada sobre
      // un mapa plano no aporta nada y hace pensar que el relieve de esa zona
      // es llano.
      setTerrainError("No se pudo cargar el modelo de elevación. El 3D quedó desactivado.")
      setIs3D(false)
      try {
        mapInstance.setTerrain(null)
        mapInstance.setSky(undefined)
        mapInstance.easeTo({ pitch: 0, duration: 500 })
      } catch {
        // El mapa se estaba destruyendo; no hay nada que devolver a su sitio.
      }
    }

    mapInstance.on("error", alFallar)
    return () => mapInstance.off("error", alFallar)
  }, [mapInstance, is3D])

  /**
   * Poner o quitar el terreno sin entrar en 3D.
   *
   * `queryTerrainElevation` solo responde con el terreno puesto, y consultar la
   * pendiente de un punto no tiene por qué obligar a inclinar la cámara: en
   * vista cenital el mapa se ve igual con terreno que sin él, y lo que se quiere
   * es el dato, no el efecto.
   */
  const setTerrainForQuery = useCallback(
    (on) => {
      const map = mapRef.current
      if (!map) return

      if (on) {
        if (!map.getTerrain()) {
          map.setTerrain({ source: TERRAIN_SOURCE_ID, exaggeration: exaggerationRef.current })
        }
        return
      }

      // Solo se quita si no era el 3D quien lo tenía puesto.
      if (!is3DRef.current && map.getTerrain()) map.setTerrain(null)
    },
    [mapRef],
  )

  /**
   * Cota, pendiente y orientación en un punto.
   *
   * Es lo que de verdad se usa en campo, y lo más barato de las tres cosas que
   * se pueden sacar del modelo: una consulta puntual no necesita recorrer nada,
   * solo mirar las nueve alturas de alrededor.
   *
   * @returns {Object|null} null si el modelo todavía no ha llegado a ese punto
   */
  const queryTerrain = useCallback(
    (lngLat) => {
      const map = mapRef.current
      if (!map?.getTerrain()) return null

      const alturas = sampleGrid([lngLat.lng, lngLat.lat]).map((punto) => elevationAt(punto))
      const centro = alturas[4]
      if (!Number.isFinite(centro)) return null

      return { elevation: centro, ...(slopeAspectFrom(alturas) ?? {}) }
    },
    [elevationAt, mapRef],
  )

  // Al desmontar hay que quitar el terreno: si no, MapLibre intenta seguir
  // dibujándolo mientras el mapa se destruye.
  useEffect(() => {
    if (!mapInstance) return
    return () => {
      // Y abandonar la medida del desnivel, que puede tener teselas en vuelo.
      medicionRef.current?.abort()
      try {
        if (mapInstance.getTerrain()) mapInstance.setTerrain(null)
      } catch {
        // El mapa ya se estaba destruyendo; no queda terreno que quitar.
      }
    }
  }, [mapInstance])

  return {
    elevationAt,
    is3D,
    toggle3D,
    terrainError,
    dismissTerrainError,
    setTerrainForQuery,
    queryTerrain,
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
  }
}
