import { useState, useCallback } from 'react'
import { Button } from "@/components/ui/button"
import proj4 from 'proj4'
import shpwrite from '@mapbox/shp-write'
import * as turf from '@turf/turf'
import { saveAs } from 'file-saver'
import { buildKml } from './utils/exportUtils'

// Define the coordinate systems
proj4.defs("EPSG:4326", "+proj=longlat +datum=WGS84 +no_defs");
proj4.defs("EPSG:4686", "+proj=longlat +ellps=GRS80 +towgs84=0,0,0,0,0,0,0 +no_defs");
proj4.defs("EPSG:9377", "+proj=tmerc +lat_0=4.0 +lon_0=-73.0 +k=0.9992 +x_0=5000000 +y_0=2000000 +ellps=GRS80 +towgs84=0,0,0,0,0,0,0 +units=m +no_defs");

const PRJ_9377 = 'PROJCS["MAGNA-SIRGAS_2018_Origen-Nacional",GEOGCS["MAGNA-SIRGAS_2018",DATUM["Marco_Geocentrico_Nacional_de_Referencia_2018",SPHEROID["GRS_1980",6378137.0,298.257222101]],PRIMEM["Greenwich",0.0],UNIT["Degree",0.0174532925199433]],PROJECTION["Transverse_Mercator"],PARAMETER["False_Easting",5000000.0],PARAMETER["False_Northing",2000000.0],PARAMETER["Central_Meridian",-73.0],PARAMETER["Scale_Factor",0.9992],PARAMETER["Latitude_Of_Origin",4.0],UNIT["Meter",1.0]]';

const PRJ_4686 = 'GEOGCS["MAGNA-SIRGAS",DATUM["D_MAGNA",SPHEROID["GRS_1980",6378137.0,298.257222101]],PRIMEM["Greenwich",0.0],UNIT["Degree",0.0174532925199433]]';

// Las coordenadas que llegan de la ANM son geográficas. Se declara 4686 (y no 4326)
// para que el SHP coincida exactamente con lo que muestra la tabla de coordenadas,
// que usa este mismo par de sistemas.
const SOURCE_PROJ = "EPSG:4686";

const TARGETS = {
  "4686": { proj: "EPSG:4686", prj: PRJ_4686, suffix: "EPSG-4686" },
  "9377": { proj: "EPSG:9377", prj: PRJ_9377, suffix: "EPSG-9377" },
};

export default function ExportComponent({ geoJsonData, selectedCoordinateSystem, expedientCode }) {
  const [isExportingSHP, setIsExportingSHP] = useState(false)
  const [isExportingKML, setIsExportingKML] = useState(false)

  const transformCoordinates = useCallback((coords, fromProj, toProj) => {
    const transform = (coord) => proj4(fromProj, toProj, coord);

    const transformCoords = (coordinates) => {
      if (typeof coordinates[0] === 'number') {
        return transform(coordinates);
      }
      return coordinates.map(transformCoords);
    };

    return transformCoords(coords);
  }, []);

  // Se exporta el GeoJSON que ya dibujó el mapa. Antes se volvía a consultar al
  // servidor con un `where` más restrictivo (solo TENURE_ID, sin UPPER y sin la capa
  // de Subcontratos), así que exportar fallaba para expedientes que el mapa sí había
  // encontrado.
  const requireMapData = useCallback(() => {
    if (!expedientCode) {
      throw new Error('No hay expediente para exportar');
    }
    if (!geoJsonData?.features?.length) {
      throw new Error('No hay un resultado de búsqueda para exportar. Busca un expediente primero.');
    }
    return geoJsonData;
  }, [expedientCode, geoJsonData]);

  const exportSHP = useCallback(async () => {
    setIsExportingSHP(true);

    try {
      const mapData = requireMapData();
      const target = TARGETS[selectedCoordinateSystem] ?? TARGETS["9377"];

      const transformedGeoJson: any = {
        type: "FeatureCollection",
        features: mapData.features.map(feature => {
          // Primero transformamos las coordenadas
          const transformedCoords = transformCoordinates(
            feature.geometry.coordinates,
            SOURCE_PROJ,
            target.proj
          );

          let fixedGeometry = {
            type: feature.geometry.type,
            coordinates: transformedCoords
          };

          // Luego corregimos la orientación de los anillos para que sean compatibles con ArcGIS Shapefile
          // ArcGIS requiere que los anillos exteriores sean Clockwise (sentido horario)
          // y los anillos interiores (huecos) Counter-Clockwise (antihorario).
          turf.rewind(fixedGeometry, { mutate: true, reverse: true });

          return {
            type: "Feature",
            properties: feature.properties,
            geometry: fixedGeometry
          };
        })
      };

      const folderName = `${expedientCode}_${target.suffix}`;
      const options: any = {
        folder: folderName,
        types: {
          point: 'points',
          polygon: expedientCode,
          line: 'lines'
        },
        prj: target.prj,
        outputType: 'blob'
      };

      const content = await shpwrite.zip(transformedGeoJson, options);
      saveAs(content as Blob, `${folderName}.zip`);

    } catch (error) {
      console.error('Error detallado al exportar SHP:', error);
      alert(`Hubo un error al exportar el archivo SHP: ${error.message}`);
    } finally {
      setIsExportingSHP(false);
    }
  }, [expedientCode, selectedCoordinateSystem, requireMapData, transformCoordinates]);

  const exportKML = useCallback(async () => {
    setIsExportingKML(true);

    try {
      const mapData = requireMapData();

      // KML siempre va en coordenadas geográficas, sin importar el sistema elegido
      // para la tabla y el SHP.
      const kml = buildKml(mapData, expedientCode);
      if (!kml) {
        throw new Error('El resultado no contiene geometrías que se puedan exportar a KML');
      }

      const blob = new Blob([kml], { type: 'application/vnd.google-earth.kml+xml' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `${expedientCode}.kml`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
    } catch (error) {
      console.error('Error al exportar KML:', error);
      alert(`Hubo un error al exportar el archivo KML: ${error.message}`);
    } finally {
      setIsExportingKML(false);
    }
  }, [expedientCode, requireMapData]);

  return (
    <div className="flex flex-col justify-center gap-4">
      <Button
        variant="default"
        className="w-full bg-green-500 text-white"
        onClick={exportSHP}
        disabled={isExportingSHP || isExportingKML}
      >
        {isExportingSHP ? 'Exportando...' : 'Exportar SHP'}
      </Button>
      <Button
        variant="default"
        className="w-full bg-green-500 text-white"
        onClick={exportKML}
        disabled={isExportingSHP || isExportingKML}
      >
        {isExportingKML ? 'Exportando...' : 'Exportar KML'}
      </Button>
    </div>
  )
}
