import { useState, useCallback } from "react"
import L from "leaflet"

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
      L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
        attribution: "© OpenStreetMap contributors",
      }).addTo(map)
      setBaseLayer("osm")
    }
  }, [baseLayer, mapRef])

  return { baseLayer, toggleBaseLayer }
}
