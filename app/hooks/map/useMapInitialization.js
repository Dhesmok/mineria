import { useState, useCallback } from "react"
import L from "leaflet"

// OSM solo publica teselas hasta z19, pero el satélite llega a z22. Sin maxNativeZoom
// el mapa quedaba en gris al volver de satélite a OSM desde un zoom alto: Leaflet no
// baja el zoom solo y la capa dejaba de pedir teselas por completo.
export const OSM_OPTIONS = {
  maxNativeZoom: 19,
  maxZoom: 22,
  attribution: "© OpenStreetMap contributors",
}

export const useMapInitialization = (mapRef) => {
  const [baseLayer, setBaseLayer] = useState("osm")

  const toggleBaseLayer = useCallback(() => {
    if (!mapRef.current) return

    const map = mapRef.current
    map.eachLayer((layer) => {
      if (layer instanceof L.TileLayer) {
        map.removeLayer(layer)
      }
    })

    if (baseLayer === "osm") {
      L.tileLayer("https://{s}.google.com/vt/lyrs=s,h&x={x}&y={y}&z={z}", {
        maxZoom: 22,
        subdomains: ["mt0", "mt1", "mt2", "mt3"],
        attribution: "© Google",
      }).addTo(map)
      setBaseLayer("satellite")
    } else {
      L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", OSM_OPTIONS).addTo(map)
      setBaseLayer("osm")
    }
  }, [baseLayer, mapRef])

  return { baseLayer, toggleBaseLayer }
}
