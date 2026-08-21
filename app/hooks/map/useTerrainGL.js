import { useCallback, useEffect, useRef, useState } from "react"
import { HILLSHADE_LAYER_ID, TERRAIN_SOURCE_ID } from "../../utils/mapStyles"
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

/** Inclinación de la cámara al entrar en 3D. Ni plano ni tan rasante que se pierda el norte. */
const PITCH_3D = 58
const EXAGGERATION_DEFAULT = 1.5
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

  const toggle3D = useCallback(() => {
    const map = mapRef.current
    if (!map) return

    setTerrainError(null)
    setIs3D((current) => {
      const next = !current

      if (next) {
        map.setTerrain({ source: TERRAIN_SOURCE_ID, exaggeration: exaggerationRef.current })
        map.setSky(SKY)
        map.easeTo({ pitch: PITCH_3D, duration: 700 })
        // **El relieve ya no se enciende solo al entrar en 3D.**
        //
        // Se encendía porque en vista inclinada, sin sombras, un cerro y un
        // valle se parecen. Pero el sombreado es una segunda pasada sobre el
        // mismo modelo de elevación que el terreno ya está usando, y en 3D la
        // forma del relieve la da la propia geometría: la silueta contra el
        // cielo y la perspectiva ya dicen qué sube y qué baja.
        //
        // Quien lo quiera lo enciende con su botón, y si ya lo tenía encendido
        // se queda encendido. Lo que se quita es pagarlo sin haberlo pedido.
      } else {
        // `null` y no `undefined`: con undefined, MapLibre entiende "no me
        // digas nada" y deja el terreno puesto.
        map.setTerrain(null)
        map.setSky(undefined)
        map.easeTo({ pitch: 0, bearing: 0, duration: 700 })
        // El relieve se queda encendido a propósito: sigue siendo útil en
        // plano, y apagarlo de golpe al volver a 2D se siente como si el mapa
        // hubiera perdido información.
      }

      return next
    })
  }, [mapRef])

  const changeExaggeration = useCallback(
    (value) => {
      setExaggeration(value)
      const map = mapRef.current
      // Solo tiene efecto con el terreno puesto. Sin la comprobación,
      // setTerrain lo encendería desde el slider, que no es lo que nadie espera
      // al mover una barra.
      if (map?.getTerrain()) {
        map.setTerrain({ source: TERRAIN_SOURCE_ID, exaggeration: value })
      }
    },
    [mapRef],
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
      mapRef.current?.jumpTo({ pitch: value })
    },
    [mapRef],
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
