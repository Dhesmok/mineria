import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { Marker } from "maplibre-gl"

import { TERRAIN_SOURCE_ID } from "../../utils/mapStyles"
import {
  profileFrom,
  sampleAtDistance,
  samplePointsAlong,
} from "../../utils/terrainProfile"
import { debounce } from "@/lib/utils"

/**
 * El perfil longitudinal: dibujar una línea y ver el corte del terreno.
 *
 * **Cómo se maneja.** Se enciende desde el botón «Terreno», el mapa entra en
 * modo línea, y en cuanto se cierra la línea aparece el perfil abajo. A partir de
 * ahí sigue vivo: arrastrar un vértice de esa línea vuelve a calcularlo, y pasar
 * el puntero por la gráfica mueve un punto sobre el mapa. Ese ida y vuelta es lo
 * que lo hace útil de verdad — un perfil que solo se mira no dice **dónde** está
 * el escarpe que se ve en la curva.
 *
 * **Se apoya en el control de dibujo que ya existe**, en vez de traer uno
 * propio. Eso da gratis lo más caro de un editor de líneas: arrastrar vértices,
 * añadir puntos en medio, deshacer. Solo hay que quedarse con el identificador de
 * la línea adoptada y escuchar sus cambios.
 *
 * **El coste está medido, y a propósito.** Son como mucho trescientas consultas
 * de altura, no veinte mil como la capa de pendiente —que bloquea el navegador
 * diez segundos y es el ejemplo de qué no hacer—. Trescientas se resuelven sin
 * que se note.
 */

/** Cuánto se espera tras un cambio antes de rehacer el perfil. */
const RECALCULO_MS = 200

/**
 * Cuántas veces se reintenta cuando el modelo de elevación llega a medias.
 *
 * Las teselas de elevación llegan poco a poco, así que el primer perfil puede
 * salir con huecos. Se rehace cuando llegan más, pero **con un tope**: sin él,
 * cada lote de teselas dispararía otro cálculo y se repetiría durante minutos,
 * que es exactamente lo que le pasa hoy a la capa de pendiente.
 */
const MAX_REINTENTOS = 6

export const useTerrainProfileGL = (
  mapRef,
  mapInstance,
  { elevationAt, setTerrainForQuery, startMode },
) => {
  const [active, setActive] = useState(false)
  const [profile, setProfile] = useState(null)
  /** La muestra sobre la que está el puntero, para el punto del mapa. */
  const [hovered, setHovered] = useState(null)

  const activeRef = useRef(active)
  activeRef.current = active
  /** El identificador de la línea adoptada dentro del control de dibujo. */
  const lineIdRef = useRef(null)
  const geometriaRef = useRef(null)
  const reintentosRef = useRef(0)
  const markerRef = useRef(null)

  /**
   * Calcula el perfil de la línea adoptada.
   *
   * Aquí es donde se piden las alturas, y por eso es lo único que hay que mirar
   * si algún día esto se vuelve lento.
   */
  const recalcular = useCallback(() => {
    const map = mapRef.current
    const coordenadas = geometriaRef.current
    if (!map || !coordenadas) return

    const puntos = samplePointsAlong(coordenadas)
    if (puntos.length < 2) {
      setProfile(null)
      return
    }

    if (!map.getTerrain()) {
      setProfile({ points: [], stats: null, pending: true })
      return
    }

    const alturas = puntos.map((punto) => elevationAt({ lng: punto.lng, lat: punto.lat }))
    const resultado = profileFrom(puntos, alturas)
    setProfile(resultado)

    // Si el modelo llegó a medias, se reintenta —con tope— cuando lleguen más
    // teselas. Con cobertura completa se deja de contar.
    if (resultado && resultado.stats.coverage >= 1) reintentosRef.current = MAX_REINTENTOS
  }, [elevationAt, mapRef])

  const recalcularPronto = useMemo(
    () => debounce(() => recalcular(), RECALCULO_MS),
    [recalcular],
  )

  /**
   * Enciende o apaga el modo, dejando el mapa como estaba.
   *
   * **Los efectos van fuera del actualizador de estado, y no es cosmética.** La
   * primera versión los metía dentro de `setActive(estaba => …)`, y el perfil no
   * llegaba a activarse nunca: React puede ejecutar ese actualizador más de una
   * vez para el mismo cambio, y `startMode` es un interruptor —llamarlo dos
   * veces con el mismo modo lo pone y lo quita—. El resultado era que el mapa se
   * quedaba en `simple_select` y no había forma de dibujar la línea, sin ningún
   * error de por medio. Se vio preguntándole el modo al control de dibujo.
   *
   * El estado actual se lee de la referencia y no de la variable de estado para
   * que esta función no cambie de identidad en cada render.
   */
  const toggleProfile = useCallback(() => {
    const siguiente = !activeRef.current
    activeRef.current = siguiente
    setActive(siguiente)

    // El perfil necesita el terreno puesto para preguntar alturas, pero no
    // necesita que la cámara esté inclinada.
    setTerrainForQuery(siguiente)

    if (siguiente) {
      reintentosRef.current = 0
      startMode("draw_line_string")
      return
    }

    lineIdRef.current = null
    geometriaRef.current = null
    setProfile(null)
    setHovered(null)
  }, [setTerrainForQuery, startMode])

  /** Adoptar una línea recién dibujada, o seguir la que ya se adoptó. */
  useEffect(() => {
    if (!mapInstance) return

    const primeraLinea = (features) =>
      (features ?? []).find((f) => f?.geometry?.type === "LineString")

    const alCrear = (evento) => {
      if (!activeRef.current) return
      const linea = primeraLinea(evento.features)
      if (!linea) return
      lineIdRef.current = linea.id
      geometriaRef.current = linea.geometry.coordinates
      reintentosRef.current = 0
      recalcular()
    }

    const alActualizar = (evento) => {
      if (!activeRef.current || !lineIdRef.current) return
      const linea = (evento.features ?? []).find((f) => f?.id === lineIdRef.current)
      if (!linea) return
      geometriaRef.current = linea.geometry.coordinates
      // Aplazado: arrastrar un vértice dispara muchos cambios seguidos, y
      // recalcular en cada uno haría el arrastre pesado sin enseñar nada nuevo.
      recalcularPronto()
    }

    const alBorrar = (evento) => {
      if (!lineIdRef.current) return
      const borrada = (evento.features ?? []).some((f) => f?.id === lineIdRef.current)
      if (!borrada) return
      lineIdRef.current = null
      geometriaRef.current = null
      setProfile(null)
      setHovered(null)
    }

    mapInstance.on("draw.create", alCrear)
    mapInstance.on("draw.update", alActualizar)
    mapInstance.on("draw.delete", alBorrar)
    return () => {
      mapInstance.off("draw.create", alCrear)
      mapInstance.off("draw.update", alActualizar)
      mapInstance.off("draw.delete", alBorrar)
      recalcularPronto.cancel()
    }
  }, [mapInstance, recalcular, recalcularPronto])

  /** Rehacer el perfil cuando llegue más modelo de elevación, con tope. */
  useEffect(() => {
    if (!mapInstance || !active) return

    const alLlegarTerreno = (evento) => {
      if (evento.sourceId !== TERRAIN_SOURCE_ID || !evento.isSourceLoaded) return
      if (!geometriaRef.current) return
      if (reintentosRef.current >= MAX_REINTENTOS) return
      reintentosRef.current += 1
      recalcularPronto()
    }

    mapInstance.on("sourcedata", alLlegarTerreno)
    return () => mapInstance.off("sourcedata", alLlegarTerreno)
  }, [mapInstance, active, recalcularPronto])

  /**
   * El punto del mapa que sigue al puntero de la gráfica.
   *
   * Es un marcador y no una capa del estilo porque se mueve en cada movimiento
   * del ratón: cambiar la posición de un marcador es mover un nodo, mientras que
   * actualizar una capa obliga al worker a volver a teselar.
   */
  const señalarDistancia = useCallback(
    (distancia) => {
      const map = mapRef.current
      const puntos = profile?.points
      if (!map || !puntos?.length || distancia === null || distancia === undefined) {
        markerRef.current?.remove()
        markerRef.current = null
        setHovered(null)
        return
      }

      const muestra = sampleAtDistance(puntos, distancia)
      if (!muestra) return
      setHovered(muestra)

      if (!markerRef.current) {
        const nodo = document.createElement("div")
        nodo.className = "profile-cursor"
        markerRef.current = new Marker({ element: nodo }).setLngLat([muestra.lng, muestra.lat])
        markerRef.current.addTo(map)
      } else {
        markerRef.current.setLngLat([muestra.lng, muestra.lat])
      }
    },
    [mapRef, profile],
  )

  // El marcador no puede sobrevivir al perfil ni al desmontaje.
  useEffect(() => {
    if (profile) return
    markerRef.current?.remove()
    markerRef.current = null
  }, [profile])

  useEffect(
    () => () => {
      markerRef.current?.remove()
      markerRef.current = null
    },
    [],
  )

  return {
    profileActive: active,
    toggleProfile,
    profile,
    profileHover: hovered,
    onProfileHover: señalarDistancia,
  }
}
