import L from "leaflet"

export const DEFAULT_DRAWING_COLOR = "#f357a1"

const MARKER_ICON_BASE = "https://unpkg.com/leaflet@1.7.1/dist/images"

export const createMarkerIcon = () =>
  new L.Icon({
    iconUrl: `${MARKER_ICON_BASE}/marker-icon.png`,
    iconRetinaUrl: `${MARKER_ICON_BASE}/marker-icon-2x.png`,
    shadowUrl: `${MARKER_ICON_BASE}/marker-shadow.png`,
    iconSize: [25, 41],
    iconAnchor: [12, 41],
    popupAnchor: [1, -34],
    shadowSize: [41, 41],
  })

/**
 * Opciones del control de dibujo. Estaban duplicadas casi literalmente entre
 * MapComponent y useDrawControl, y las dos copias se desincronizaban.
 */
export const createDrawOptions = (color, featureGroup) => ({
  position: "topright",
  draw: {
    polyline: {
      shapeOptions: { color, weight: 5 },
    },
    polygon: {
      allowIntersection: false,
      drawError: {
        color: "#e1e100",
        message: "<strong>¡Error!</strong> No se permiten polígonos que se intersecten.",
      },
      shapeOptions: { color },
    },
    circle: { shapeOptions: { color } },
    rectangle: { shapeOptions: { color } },
    marker: { icon: createMarkerIcon() },
    circlemarker: false,
  },
  edit: {
    featureGroup,
    remove: true,
  },
})
