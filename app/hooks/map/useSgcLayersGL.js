import { useCallback, useEffect, useRef, useState } from "react"

import {
  SGC_LAYERS,
  identifyResultsFrom,
  legendFrom,
  sgcIdentifyUrl,
  sgcLayerId,
  sgcLegendUrl,
  sgcMetaUrl,
  sgcSourceId,
  sgcTileTemplate,
  subLayersFrom,
} from "../../utils/sgcLayers"
import { onMapTap } from "../../utils/tapGesture"

/**
 * Las capas de geología del SGC sobre el mapa.
 *
 * ## Lo que faltaba, y por qué era grave
 *
 * La primera versión solo dibujaba. Y una capa que solo se dibuja **no es una
 * capa geológica, es un adorno**: quien la mira ve manchas de colores sin poder
 * preguntarle a ninguna qué unidad es, de qué edad, ni qué significa el color. Se
 * arregla con tres cosas que el propio servicio ya sabe dar:
 *
 * 1. **`meta`** — el árbol de capas. «Geología por departamentos» resultó dibujar
 *    solo Antioquia, porque eso es lo que el servicio trae encendido de fábrica;
 *    el resto de departamentos estaban ahí, apagados. Con el árbol se puede
 *    ofrecer la lista y encender el que se quiera.
 * 2. **`identify`** — qué hay en el punto donde se tocó.
 * 3. **`legend`** — el símbolo y el nombre de cada unidad.
 *
 * ## Nada de índices escritos a mano
 *
 * Los números de subcapa se descubren en runtime, igual que hace
 * `findTenureLayerNumbers()` con la ANM y por el mismo motivo: cambian. Con el
 * añadido de que aquí ni siquiera se sabían — desde la máquina donde se escribió
 * esto el SGC está bloqueado, así que lo único honesto era enseñar lo que el
 * servicio diga de sí mismo.
 */

/** Cuánto se espera tras un clic antes de dar la consulta por perdida. */
const IDENTIFY_TIMEOUT_MS = 15000

/**
 * Pide algo a nuestra ruta y lo pasa por un traductor, una sola vez por capa.
 *
 * El «una sola vez» lo lleva un `Set` en una referencia y no el propio estado:
 * mirar el estado obliga a ponerlo en las dependencias del efecto, y entonces
 * guardar la respuesta vuelve a disparar el efecto que la pidió. Si falla se
 * borra de la lista, para que apagar y encender la capa lo reintente.
 */
const pedirUnaVez = async ({ key, url, traducir, pedidas, guardar, vivo }) => {
  if (pedidas.has(key)) return
  pedidas.add(key)
  try {
    const respuesta = await fetch(url)
    if (!respuesta.ok) throw new Error(String(respuesta.status))
    const traducido = traducir(await respuesta.json())
    if (vivo()) guardar(traducido)
  } catch {
    // Sin respuesta, la capa sigue dibujándose como la traiga el servicio: es
    // exactamente lo que había antes de todo esto, nunca menos.
    pedidas.delete(key)
    if (vivo()) guardar([])
  }
}

export const useSgcLayersGL = (mapRef, mapInstance, layerState, { enabled = true } = {}) => {
  /** `{clave: [{id, label, ids}]}` — lo que cada servicio dice tener dentro. */
  const [subLayers, setSubLayers] = useState({})
  /** `{clave: [ids]}` — qué subcapas quiere ver el usuario. */
  const [chosenSub, setChosenSub] = useState({})
  /** La leyenda de cada capa, tal como la publica el SGC. */
  const [legends, setLegends] = useState({})
  /** Lo que devolvió el último clic: `null`, `{loading:true}` o los resultados. */
  const [featureInfo, setFeatureInfo] = useState(null)

  const chosenRef = useRef(chosenSub)
  chosenRef.current = chosenSub
  const stateRef = useRef(layerState)
  stateRef.current = layerState
  const enabledRef = useRef(enabled)
  enabledRef.current = enabled

  /** Qué capas del SGC están encendidas ahora mismo, como texto. */
  // Una huella y no el arreglo: el arreglo es nuevo en cada render y dispararía
  // los efectos aunque no hubiera cambiado nada.
  const huellaEncendidas = SGC_LAYERS.filter(({ key }) => layerState?.[key]?.on)
    .map(({ key }) => key)
    .join(",")

  const metaPedida = useRef(new Set())
  const leyendaPedida = useRef(new Set())

  /**
   * Descubre qué tiene dentro cada capa encendida, y su leyenda.
   *
   * Solo al encenderla, no al arrancar: son diez peticiones a un servidor
   * público que no hacen falta hasta que alguien mira esa capa.
   */
  useEffect(() => {
    if (!huellaEncendidas) return
    let sigue = true
    const vivo = () => sigue

    huellaEncendidas.split(",").forEach((key) => {
      pedirUnaVez({
        key,
        url: sgcMetaUrl(key),
        traducir: subLayersFrom,
        pedidas: metaPedida.current,
        vivo,
        guardar: (grupos) => {
          setSubLayers((actual) => ({ ...actual, [key]: grupos }))
          // Las casillas arrancan marcadas en lo que el servicio ya dibuja. Si
          // arrancaran vacías, la lista diría «ninguno» con Antioquia pintada en
          // el mapa, y lo primero que haría cualquiera sería desconfiar de la
          // lista. Solo la primera vez: después manda lo que el usuario haya
          // tocado.
          setChosenSub((actual) =>
            actual[key]
              ? actual
              : { ...actual, [key]: grupos.filter((g) => g.on).flatMap((g) => g.ids) },
          )
        },
      })

      pedirUnaVez({
        key,
        url: sgcLegendUrl(key),
        traducir: legendFrom,
        pedidas: leyendaPedida.current,
        vivo,
        guardar: (leyenda) => setLegends((actual) => ({ ...actual, [key]: leyenda })),
      })
    })

    return () => {
      sigue = false
    }
  }, [huellaEncendidas])

  /** Encender, apagar y graduar. */
  useEffect(() => {
    const map = mapRef.current
    if (!map) return

    SGC_LAYERS.forEach(({ key }) => {
      const id = sgcLayerId(key)
      if (!map.getLayer(id)) return

      const estado = layerState?.[key]
      map.setLayoutProperty(id, "visibility", estado?.on ? "visible" : "none")
      // La opacidad se aplica siempre, encendida o no: si solo se aplicara al
      // encenderla, volver a prenderla después de mover el deslizador la sacaría
      // con la opacidad vieja durante un instante.
      map.setPaintProperty(id, "raster-opacity", estado?.opacity ?? 0.6)
    })
  }, [mapInstance, layerState, mapRef])

  /**
   * Cambiar de subcapas obliga a rehacer la fuente, no basta con avisar.
   *
   * MapLibre guarda las teselas por su dirección. Si se cambia lo que se pide sin
   * cambiar la dirección, sigue enseñando las que ya tenía: el mapa se quedaría
   * en Antioquia por mucho que se marcara Boyacá. Por eso la selección viaja
   * dentro de la URL y aquí se sustituye la fuente entera.
   *
   * Y solo cuando la dirección cambia de verdad: `setTiles` tira lo que la
   * fuente tuviera cargado, así que llamarlo con la misma dirección haría
   * parpadear las otras cuatro capas cada vez que se marca un departamento.
   */
  const huellaSeleccion = JSON.stringify(chosenSub)
  // Se arranca con lo que `mapStyles` ya dejó puesto —la plantilla sin
  // selección—, para que la primera pasada no recargue las cinco fuentes
  // poniéndoles exactamente la dirección que ya tenían.
  const puestas = useRef(
    Object.fromEntries(SGC_LAYERS.map(({ key }) => [key, sgcTileTemplate(key)])),
  )
  useEffect(() => {
    const map = mapRef.current
    // La condición es que exista la fuente, no `isStyleLoaded()`: ese devuelve
    // falso mientras alguna fuente siga cargando, y estas capas tardan segundos
    // en responder. Esperarlo dejaría la selección sin aplicar justo cuando el
    // SGC va lento, que es siempre. Es la misma trampa que obligó a escuchar
    // `styledata` en vez de `load` al arrancar el mapa.
    if (!map) return

    SGC_LAYERS.forEach(({ key }) => {
      const fuente = map.getSource(sgcSourceId(key))
      if (!fuente?.setTiles) return

      const plantilla = sgcTileTemplate(key, chosenSub[key] ?? [])
      if (puestas.current[key] === plantilla) return
      puestas.current[key] = plantilla
      fuente.setTiles([plantilla])
    })
  }, [mapInstance, huellaSeleccion, chosenSub, mapRef])

  /**
   * Apagar la última capa de geología borra la respuesta del último clic.
   *
   * La tarjeta ya se esconde sola sin capas encendidas, así que esto no se ve;
   * lo que evita es que al volver a encenderla reaparezca la unidad de un punto
   * que se tocó hace rato, como si fuera la respuesta a algo reciente.
   */
  useEffect(() => {
    if (!huellaEncendidas) setFeatureInfo(null)
  }, [huellaEncendidas])

  /** Marcar o desmarcar una subcapa. */
  const toggleSubLayer = useCallback((key, grupo) => {
    setChosenSub((actual) => {
      const puestas = actual[key] ?? []
      const yaEstaba = grupo.ids.every((id) => puestas.includes(id))
      const siguiente = yaEstaba
        ? puestas.filter((id) => !grupo.ids.includes(id))
        : [...new Set([...puestas, ...grupo.ids])]
      return { ...actual, [key]: siguiente }
    })
  }, [])

  const clearFeatureInfo = useCallback(() => setFeatureInfo(null), [])

  /**
   * El clic sobre el mapa: preguntar al SGC qué hay ahí.
   *
   * Se pregunta a **todas** las capas del SGC encendidas y se juntan las
   * respuestas: si alguien tiene el mapa nacional y una plancha a la vez, quiere
   * ver las dos, no la que el código mire primero.
   */
  useEffect(() => {
    if (!mapInstance) return

    const alTocar = async (evento) => {
      if (!enabledRef.current) return
      const map = mapRef.current
      if (!map) return

      const activas = SGC_LAYERS.filter(({ key }) => stateRef.current?.[key]?.on).map((c) => c.key)
      if (activas.length === 0) return

      const punto = evento.lngLat
      const lienzo = map.getCanvas()
      const limites = map.getBounds()
      const suroeste = mercator(limites.getWest(), limites.getSouth())
      const noreste = mercator(limites.getEast(), limites.getNorth())
      const bbox = `${suroeste[0]},${suroeste[1]},${noreste[0]},${noreste[1]}`
      const [mx, my] = mercator(punto.lng, punto.lat)

      setFeatureInfo({ loading: true, lngLat: [punto.lng, punto.lat], results: [] })

      const control = new AbortController()
      const reloj = setTimeout(() => control.abort(), IDENTIFY_TIMEOUT_MS)

      try {
        const respuestas = await Promise.all(
          activas.map(async (key) => {
            const url = sgcIdentifyUrl({
              key,
              lng: mx,
              lat: my,
              bbox,
              width: lienzo.clientWidth,
              height: lienzo.clientHeight,
              sub: chosenRef.current[key] ?? [],
            })
            try {
              const r = await fetch(url, { signal: control.signal })
              if (!r.ok) return []
              return identifyResultsFrom(await r.json()).map((res) => ({ ...res, layerKey: key }))
            } catch {
              return []
            }
          }),
        )

        setFeatureInfo({
          loading: false,
          lngLat: [punto.lng, punto.lat],
          results: respuestas.flat(),
        })
      } finally {
        clearTimeout(reloj)
      }
    }

    mapInstance.on("click", alTocar)
    // Y lo mismo para los toques, por separado: en un teléfono el clic no llega.
    // `mapbox-gl-draw` cancela el `touchend` para manejar sus propios gestos, y
    // con ese evento cancelado el navegador no genera el clic de compatibilidad.
    // Ver `utils/tapGesture` para el diagnóstico completo.
    const quitarToque = onMapTap(mapInstance, alTocar)

    return () => {
      mapInstance.off("click", alTocar)
      quitarToque()
    }
  }, [mapInstance, mapRef])

  return {
    sgcSubLayers: subLayers,
    sgcChosenSub: chosenSub,
    toggleSgcSubLayer: toggleSubLayer,
    sgcLegends: legends,
    sgcFeatureInfo: featureInfo,
    clearSgcFeatureInfo: clearFeatureInfo,
  }
}

/**
 * De grados a metros de Web Mercator.
 *
 * Se hace aquí y no con `proj4` —que el proyecto ya usa— porque para esta
 * proyección concreta son dos líneas, y `utils/crs.js` está montado alrededor de
 * los sistemas colombianos. Meter 3857 allí obligaría a explicar por qué el visor
 * habla de un sistema que no le sirve a ningún dato del país.
 */
const mercator = (lng, lat) => {
  const x = (lng * 20037508.34) / 180
  const y =
    ((Math.log(Math.tan(((90 + lat) * Math.PI) / 360)) / (Math.PI / 180)) * 20037508.34) / 180
  return [x, y]
}
