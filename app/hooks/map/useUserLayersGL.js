import { useEffect, useRef } from "react"
import { Popup } from "maplibre-gl"

import {
  userFillLayerId,
  userLineLayerId,
  userPointLayerId,
  userSourceId,
} from "../../utils/userLayers"
import { SEARCH_LAYERS } from "../../utils/mapStyles"
import { createUserFeaturePopupContent } from "../../utils/mapUtils"
import { onMapTap } from "../../utils/tapGesture"

/**
 * Las capas que trae el usuario, puestas en el mapa.
 *
 * **Es el único hook que crea y destruye capas del estilo.** Todo lo demás está
 * declarado desde el arranque —ver la cabecera de `mapStyles.js`— porque crear
 * capas al vuelo obliga a reconstruir el orden de apilamiento cada vez, y en
 * MapLibre el orden de la lista *es* el orden de pintado. Aquí no hay otra:
 * cuántos archivos va a abrir alguien, y cómo se llaman, no se sabe hasta que los
 * abre.
 *
 * Lo que se conserva de aquella decisión es que el orden no se decide aquí. Cada
 * capa nueva se inserta justo debajo del resultado de la búsqueda —o sea, encima
 * de todo lo demás, que es donde quiere ver su archivo quien lo acaba de abrir— y
 * a partir de ahí manda el panel: `useMapLayersGL` recorre `layerOrder` y mueve
 * lo que haga falta, y ese recorrido ya conoce estas capas porque
 * `styleLayerIdsFor` responde por ellas.
 *
 * **Tres capas por archivo y no una.** Un archivo trae lo que le dé la gana
 * —polígonos, líneas, puntos, o las tres cosas— y MapLibre no tiene una capa que
 * pinte de todo. Ver `userStyleLayerIds` en `utils/userLayers.js`.
 *
 * @param mapRef       referencia al mapa
 * @param mapInstance  el mapa ya anunciado, que es la señal de «el estilo está»
 * @param userLayers   las fichas de las capas cargadas (ver `buildUserLayer`)
 * @param layerState   lo que el panel sabe de cada capa: encendida, opacidad, colores
 * @param popupsEnabled con la consulta de terreno puesta, un clic no abre ficha
 */
export const useUserLayersGL = (
  mapRef,
  mapInstance,
  userLayers = [],
  layerState = {},
  popupsEnabled = true,
) => {
  // Qué capas están montadas ahora mismo en el estilo, y con qué datos, para no
  // volver a mandarle al motor lo que ya tiene. La comparación es por
  // referencia: `buildUserLayer` crea una colección nueva cada vez que cambia el
  // sistema de coordenadas, y no la toca en ningún otro caso.
  const montadasRef = useRef(new Map())
  const popupsEnabledRef = useRef(popupsEnabled)
  popupsEnabledRef.current = popupsEnabled
  // Los rótulos de las capas se leen dentro del manejador del clic, que se
  // registra una sola vez: con la prop se quedaría viendo la lista del render en
  // que se creó, y una capa cargada después no tendría nombre en su ficha.
  const capasRef = useRef(userLayers)
  capasRef.current = userLayers

  /**
   * Monta lo que falte, actualiza lo que cambió y quita lo que ya no está.
   *
   * La condición de arranque es que exista la capa del resultado de la búsqueda,
   * no `map.isStyleLoaded()`: aquello devuelve falso mientras *cualquier* fuente
   * siga cargando —y las del SGC tardan segundos—, así que una guarda con eso
   * deja los archivos sin dibujar justo cuando el servicio va lento, que es
   * siempre. Es la trampa nº 16 de CLAUDE.md.
   */
  useEffect(() => {
    const map = mapRef.current
    if (!map || !map.getLayer(SEARCH_LAYERS.fill)) return

    const montadas = montadasRef.current
    const vivas = new Set(userLayers.map((capa) => capa.key))

    // Primero se quitan las que se fueron: si se hiciera al final, una clave
    // reutilizada —cargar, quitar y volver a cargar el mismo archivo— se
    // eliminaría justo después de haberse vuelto a añadir.
    montadas.forEach((_, key) => {
      if (vivas.has(key)) return
      desmontar(map, key)
      montadas.delete(key)
    })

    userLayers.forEach((capa) => {
      const yaEsta = montadas.get(capa.key)

      if (!yaEsta) {
        montar(map, capa)
        montadas.set(capa.key, capa.data)
        return
      }

      if (yaEsta !== capa.data) {
        // Cambió el sistema de coordenadas de origen: la geometría es otra.
        map.getSource(userSourceId(capa.key))?.setData(capa.data)
        montadas.set(capa.key, capa.data)
      }
    })
  }, [mapInstance, userLayers, mapRef])

  /**
   * Al desmontar el visor no se quitan las capas: el mapa entero se va con
   * ellas. Lo que sí hay que hacer es olvidar lo montado, porque si el mapa se
   * reconstruye —cambio de ruta, recarga en caliente— el registro diría que
   * están puestas y nadie las volvería a añadir.
   */
  useEffect(
    () => () => {
      montadasRef.current = new Map()
    },
    [],
  )

  /** Visibilidad, opacidad y colores: lo que el panel cambia sin tocar los datos. */
  useEffect(() => {
    const map = mapRef.current
    if (!map) return

    userLayers.forEach((capa) => {
      const relleno = userFillLayerId(capa.key)
      if (!map.getLayer(relleno)) return

      const estado = layerState[capa.key] ?? {}
      const visible = estado.on ? "visible" : "none"
      const opacidad = typeof estado.opacity === "number" ? estado.opacity : 0.6
      const fill = estado.fillColor ?? capa.fillColor
      const line = estado.lineColor ?? capa.lineColor

      const linea = userLineLayerId(capa.key)
      const punto = userPointLayerId(capa.key)

      ;[relleno, linea, punto].forEach((id) => {
        if (map.getLayer(id)) map.setLayoutProperty(id, "visibility", visible)
      })

      map.setPaintProperty(relleno, "fill-opacity", opacidad)
      map.setPaintProperty(relleno, "fill-color", fill)
      // Al contorno y a los puntos no les llega el deslizador, igual que en las
      // capas de la ANM: con opacidad cero la capa sigue existiendo y al menos se
      // ve dónde está, en vez de desaparecer del todo y parecer que no cargó.
      map.setPaintProperty(linea, "line-color", line)
      map.setPaintProperty(punto, "circle-color", fill)
      map.setPaintProperty(punto, "circle-stroke-color", line)
    })
  }, [mapInstance, userLayers, layerState, mapRef])

  /**
   * La ficha de una figura al pulsarla.
   *
   * Un manejador para todas las capas cargadas y no uno por capa, por lo mismo
   * que en `useMapLayersGL`: con el comportamiento por omisión, el globo abierto
   * se cierra *después* de que el nuevo se haya puesto, así que pulsar una
   * segunda figura la hacía desaparecer en vez de cambiar.
   *
   * Y enganchado dos veces —al clic y al toque— porque en el teléfono el clic no
   * llega: `mapbox-gl-draw` cancela el `touchend` y sin él el navegador no genera
   * el clic de compatibilidad. Es la trampa nº 27 de CLAUDE.md.
   */
  useEffect(() => {
    if (!mapInstance) return

    const popup = new Popup({ maxWidth: "320px", closeOnClick: false })

    const capasConsultables = () =>
      capasRef.current.flatMap((capa) =>
        [userFillLayerId(capa.key), userLineLayerId(capa.key), userPointLayerId(capa.key)].filter(
          (id) => mapInstance.getLayer(id),
        ),
      )

    const alPulsar = (event) => {
      if (!popupsEnabledRef.current) return

      const capas = capasConsultables()
      if (capas.length === 0) return

      const hits = mapInstance.queryRenderedFeatures(event.point, { layers: capas })
      if (hits.length === 0) {
        popup.remove()
        return
      }

      // El de más arriba en el apilamiento, que es el que el usuario ve y por
      // tanto el que cree estar pulsando.
      const hit = hits[0]
      // De qué capa es, comparando con sus tres identificadores exactos y no con
      // un `startsWith` sobre la clave, que es el atajo obvio y está mal: el
      // identificador de «usuario:12» empieza por la clave de «usuario:1», así
      // que la ficha saldría con el nombre del archivo equivocado.
      const capa = capasRef.current.find((c) =>
        [userFillLayerId(c.key), userLineLayerId(c.key), userPointLayerId(c.key)].includes(
          hit.layer.id,
        ),
      )

      popup
        .setLngLat(event.lngLat)
        .setHTML(createUserFeaturePopupContent(hit.properties, capa?.label))
        .addTo(mapInstance)
    }

    mapInstance.on("click", alPulsar)
    const quitarToque = onMapTap(mapInstance, alPulsar)

    return () => {
      mapInstance.off("click", alPulsar)
      quitarToque()
      popup.remove()
    }
  }, [mapInstance])
}

/**
 * Las tres capas de un archivo, insertadas debajo del resultado de la búsqueda.
 *
 * Nacen **ocultas**: quien las enciende es el efecto de visibilidad con lo que
 * diga el panel. Ponerlas visibles aquí y apagarlas allá da un parpadeo en el
 * que la capa se dibuja con los colores de fábrica antes de tomar los suyos.
 */
const montar = (map, capa) => {
  const fuente = userSourceId(capa.key)
  if (!map.getSource(fuente)) {
    map.addSource(fuente, { type: "geojson", data: capa.data })
  }

  const antesDe = map.getLayer(SEARCH_LAYERS.fill) ? SEARCH_LAYERS.fill : undefined

  if (!map.getLayer(userFillLayerId(capa.key))) {
    map.addLayer(
      {
        id: userFillLayerId(capa.key),
        type: "fill",
        source: fuente,
        layout: { visibility: "none" },
        paint: { "fill-color": capa.fillColor, "fill-opacity": 0.6 },
      },
      antesDe,
    )
  }

  if (!map.getLayer(userLineLayerId(capa.key))) {
    map.addLayer(
      {
        id: userLineLayerId(capa.key),
        type: "line",
        source: fuente,
        layout: { visibility: "none" },
        // Sin filtro por tipo de geometría a propósito: una capa `line` dibuja
        // tanto las líneas del archivo como el contorno de sus polígonos, que es
        // exactamente lo que se quiere. Un filtro de «solo líneas» dejaría los
        // polígonos sin borde.
        paint: { "line-color": capa.lineColor, "line-width": 1.6 },
      },
      antesDe,
    )
  }

  if (!map.getLayer(userPointLayerId(capa.key))) {
    map.addLayer(
      {
        id: userPointLayerId(capa.key),
        type: "circle",
        source: fuente,
        layout: { visibility: "none" },
        /**
         * **El filtro no es opcional, y esto se vio en una captura.**
         *
         * Una capa `circle` de MapLibre no dibuja «los puntos» de la fuente:
         * dibuja un círculo **en cada vértice de cada geometría**. Sin el filtro,
         * un lindero de cinco esquinas salía con cinco pelotas en las esquinas, y
         * el círculo de una bocamina —que aquí es un polígono de 64 lados— se
         * convertía en un anillo de 64 bolitas en vez de una circunferencia. En
         * un plano de topografía, que son todo vértices, el mapa quedaba
         * literalmente cubierto de puntos naranjas.
         *
         * Ninguna prueba sobre los datos podía verlo: la capa existía, la fuente
         * tenía sus figuras, los colores eran los correctos. Es la trampa nº 10
         * de CLAUDE.md otra vez.
         *
         * `geometry-type` responde «Point» también para un `MultiPoint`, así que
         * un archivo con puntos múltiples —lo normal en un GPS— sigue entrando.
         */
        filter: ["==", ["geometry-type"], "Point"],
        paint: {
          // Pequeño: un archivo de campo trae cientos de vértices y con círculos
          // grandes se convierten en una mancha sin forma.
          "circle-radius": 4,
          "circle-color": capa.fillColor,
          "circle-stroke-color": capa.lineColor,
          "circle-stroke-width": 1,
        },
      },
      antesDe,
    )
  }
}

/**
 * Quita las tres capas y su fuente, **en ese orden**.
 *
 * MapLibre se niega a borrar una fuente que alguna capa siga usando, y lo hace
 * lanzando: al revés, quitar la capa del usuario dejaría el visor con una
 * excepción a medio camino y la fuente puesta para siempre.
 */
const desmontar = (map, key) => {
  [userPointLayerId(key), userLineLayerId(key), userFillLayerId(key)].forEach((id) => {
    if (map.getLayer(id)) map.removeLayer(id)
  })
  if (map.getSource(userSourceId(key))) map.removeSource(userSourceId(key))
}
