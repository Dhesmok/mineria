import { Button } from "@/components/ui/button"
import { Compass, Crosshair, MapIcon, Satellite, User } from "lucide-react"

export const MapControls = ({
  baseLayer,
  toggleBaseLayer,
  isLocating,
  hasLocated,
  handleLocateUser,
  isCompassActive,
  handleToggleCompass360
}) => {
  return (
    <div className="absolute bottom-4 left-4 z-10 flex flex-col space-y-2">
      <Button onClick={toggleBaseLayer} className="bg-white text-black hover:bg-gray-200">
        {baseLayer === "osm" ? <Satellite className="mr-2 h-4 w-4" /> : <MapIcon className="mr-2 h-4 w-4" />}
        {baseLayer === "osm" ? "Satélite" : "Mapa"}
      </Button>
      <Button
        onClick={handleLocateUser}
        className={`transition-colors ${
          isLocating
            ? "bg-blue-50 text-blue-500 animate-pulse"
            : hasLocated
              ? "bg-blue-50 text-blue-600 hover:bg-blue-100"
              : "bg-white text-black hover:bg-gray-200"
        }`}
      >
        <Crosshair className={`mr-2 h-4 w-4 ${isLocating ? "animate-spin" : ""}`} />
        {isLocating ? "Ubicando..." : hasLocated ? "Ubicación activa" : "Activar GPS"}
      </Button>
      <Button
        onClick={handleToggleCompass360}
        className={`transition-colors ${
          isCompassActive
            ? "bg-blue-50 text-blue-600 hover:bg-blue-100"
            : "bg-white text-black hover:bg-gray-200"
        }`}
      >
        <Compass className={`mr-2 h-4 w-4 ${isCompassActive ? "text-blue-600" : ""}`} />
        {isCompassActive ? "Ocultar 360°" : "Brújula 360°"}
      </Button>
      <Button
        onClick={() => window.open("https://www.linkedin.com/in/fabio-espinosa/", "_blank", "noopener,noreferrer")}
        className="bg-white text-black hover:bg-gray-200"
      >
        <User className="mr-2 h-4 w-4" />
        Fabio A. Espinosa
      </Button>
    </div>
  )
}
