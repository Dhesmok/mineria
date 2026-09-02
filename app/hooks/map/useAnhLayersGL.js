import { useCallback, useEffect, useRef, useState } from "react"

import {
  ANH_LAYERS,
  anhIdentifyUrl,
  anhImageSize,
  anhImageUrl,
  anhLayerId,
  anhLegendUrl,
  anhMetaUrl,
  anhSourceId,
} from "../../utils/anhLayers"
import { ANH_ATTRIBUTION_LAYER_ID, TRANSPARENT_PIXEL } from "../../utils/mapStyles"
import { onMapTap } from "../../utils/tapGesture"
import { debounce } from "@/lib/utils"

const IDENTIFY_TIMEOUT_MS = 15000
const REDIBUJO_MS = 350
const PIXEL_TRANSPARENTE = TRANSPARENT_PIXEL
const VACIA = "vacia"

const pedirUnaVez = async ({ key, url, traducir, pedidas, guardar, vivo }) => {
  if (pedidas.has(key)) return
  pedidas.add(key)
  try {
    const respuesta = await fetch(url)
    if (!respuesta.ok) throw new Error(String(respuesta.status))
    const datos = await respuesta.json()
    const traducido = traducir ? traducir(datos) : datos
    if (vivo()) guardar(traducido)
  } catch {
    pedidas.delete(key)
    if (vivo()) guardar([])
  }
}

export const useAnhLayersGL = (mapRef, mapInstance, layerState, { enabled = true } = {}) => {
  const [subLayers, setSubLayers] = useState({})
  const [chosenSub, setChosenSub] = useState({})
  const [legends, setLegends] = useState({})
  const [featureInfo, setFeatureInfo] = useState(null)

  const metaPedida = useRef(new Set())
  const leyendaPedida = useRef(new Set())
  const abortIdentify = useRef(null)

  const stateRef = useRef(layerState)
  stateRef.current = layerState

  const chosenRef = useRef(chosenSub)
  chosenRef.current = chosenSub

  const subsRef = useRef(subLayers)
  subsRef.current = subLayers

  const huellaEncendidas = ANH_LAYERS.map(({ key }) => (layerState?.[key]?.on ? "1" : "0")).join("")

  useEffect(() => {
    let sigue = true
    const vivo = () => sigue

    ANH_LAYERS.forEach(({ key }) => {
      if (!layerState?.[key]?.on) return

      pedirUnaVez({
        key,
        url: anhMetaUrl(key),
        traducir: (json) => json.layers || [],
        pedidas: metaPedida.current,
        vivo,
        guardar: (capas) => {
          setSubLayers((actual) => ({ ...actual, [key]: capas }))
        },
      })

      pedirUnaVez({
        key,
        url: anhLegendUrl(key),
        traducir: (json) => json.layers || [],
        pedidas: leyendaPedida.current,
        vivo,
        guardar: (leyenda) => setLegends((actual) => ({ ...actual, [key]: leyenda })),
      })
    })

    return () => {
      sigue = false
    }
  }, [huellaEncendidas, layerState])

  useEffect(() => {
    const map = mapRef.current
    if (!map) return

    ANH_LAYERS.forEach(({ key }) => {
      const id = anhLayerId(key)
      if (!map.getLayer(id)) return

      const estado = layerState?.[key]
      map.setLayoutProperty(id, "visibility", estado?.on ? "visible" : "none")
      map.setPaintProperty(id, "raster-opacity", estado?.opacity ?? 0.6)
    })

    if (map.getLayer(ANH_ATTRIBUTION_LAYER_ID)) {
      map.setLayoutProperty(
        ANH_ATTRIBUTION_LAYER_ID,
        "visibility",
        ANH_LAYERS.some(({ key }) => layerState?.[key]?.on) ? "visible" : "none",
      )
    }
  }, [mapInstance, layerState, mapRef])

  const huellaSeleccion = JSON.stringify(chosenSub)
  const puestas = useRef({})

  const repintar = useCallback(() => {
    const map = mapRef.current
    if (!map) return

    const limites = map.getBounds()
    const recuadroDeg = [
      limites.getWest(),
      limites.getSouth(),
      limites.getEast(),
      limites.getNorth(),
    ]
    const lienzo = map.getCanvas()
    const [ancho, alto] = anhImageSize(recuadroDeg, [lienzo.width, lienzo.height])

    const esquinas = [
      [limites.getWest(), limites.getNorth()],
      [limites.getEast(), limites.getNorth()],
      [limites.getEast(), limites.getSouth()],
      [limites.getWest(), limites.getSouth()],
    ]

    ANH_LAYERS.forEach(({ key }) => {
      const fuente = map.getSource(anhSourceId(key))
      if (!fuente?.updateImage) return
      if (!stateRef.current?.[key]?.on) return

      const elegidas = chosenRef.current[key] ?? []
      if ((subsRef.current[key]?.length ?? 0) > 0 && elegidas.length === 0) {
        if (puestas.current[key] === VACIA) return
        puestas.current[key] = VACIA
        fuente.updateImage({ url: PIXEL_TRANSPARENTE, coordinates: esquinas })
        return
      }

      const url = anhImageUrl({
        key,
        bbox: recuadroDeg,
        width: ancho,
        height: alto,
        sub: elegidas,
      })
      if (puestas.current[key] === url) return
      puestas.current[key] = url
      fuente.updateImage({ url, coordinates: esquinas })
    })
  }, [mapRef])

  useEffect(() => {
    if (!mapInstance) return
    const alParar = debounce(repintar, REDIBUJO_MS)
    mapInstance.on("moveend", alParar)
    return () => {
      mapInstance.off("moveend", alParar)
      alParar.cancel()
    }
  }, [mapInstance, repintar])

  useEffect(() => {
    repintar()
  }, [mapInstance, huellaEncendidas, huellaSeleccion, repintar])

  useEffect(() => {
    if (!huellaEncendidas) setFeatureInfo(null)
  }, [huellaEncendidas])

  const toggleSubLayer = useCallback((key, subId) => {
    setChosenSub((actual) => {
      const puestas = actual[key] ?? []
      const yaEstaba = puestas.includes(subId)
      const siguiente = yaEstaba
        ? puestas.filter((id) => id !== subId)
        : [...puestas, subId]
      return { ...actual, [key]: siguiente }
    })
  }, [])

  const clearFeatureInfo = useCallback(() => setFeatureInfo(null), [])

  useEffect(() => {
    if (!mapInstance || !enabled) return

    const alTocar = async (event) => {
      const encendidas = ANH_LAYERS.filter(({ key }) => stateRef.current?.[key]?.on)
      if (encendidas.length === 0) return

      abortIdentify.current?.abort()
      const control = new AbortController()
      abortIdentify.current = control
      const reloj = setTimeout(() => control.abort(), IDENTIFY_TIMEOUT_MS)

      const limites = mapInstance.getBounds()
      const recuadroDeg = [
        limites.getWest(),
        limites.getSouth(),
        limites.getEast(),
        limites.getNorth(),
      ]
      const lienzo = mapInstance.getCanvas()
      const size = [lienzo.width, lienzo.height]

      setFeatureInfo({ lngLat: event.lngLat, consultando: true, resultados: [] })

      try {
        const peticiones = encendidas.map(async ({ key }) => {
          const elegidas = chosenRef.current[key] ?? []
          const url = anhIdentifyUrl({
            key,
            lngLat: event.lngLat,
            bbox: recuadroDeg,
            size,
            sub: elegidas,
          })
          const r = await fetch(url, { signal: control.signal })
          if (!r.ok) return []
          const data = await r.json()
          return (data.results || []).map((res) => ({
            ...res,
            layerKey: key,
            attributes: Object.entries(res.attributes || {}).map(([field, value]) => ({
              field,
              value: String(value ?? ""),
            })),
          }))
        })

        const todos = (await Promise.all(peticiones)).flat()
        setFeatureInfo({ lngLat: event.lngLat, consultando: false, resultados: todos })
      } catch (err) {
        if (err.name !== "AbortError") {
          setFeatureInfo({ lngLat: event.lngLat, consultando: false, resultados: [] })
        }
      } finally {
        clearTimeout(reloj)
      }
    }

    mapInstance.on("click", alTocar)
    const quitarToque = onMapTap(mapInstance, alTocar)

    return () => {
      mapInstance.off("click", alTocar)
      quitarToque()
      abortIdentify.current?.abort()
    }
  }, [mapInstance, enabled])

  return {
    subLayers,
    chosenSub,
    toggleSubLayer,
    legends,
    featureInfo,
    clearFeatureInfo,
  }
}
