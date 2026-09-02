import { useState, useCallback } from 'react'
import { Button } from "@/components/ui/button"
import { Loader2 } from "lucide-react"
import proj4 from 'proj4'
import shpwrite from '@mapbox/shp-write'
import * as turf from '@turf/turf'
import { saveAs } from 'file-saver'
import { buildKml } from './utils/exportUtils'
import { crsById, SOURCE_CRS } from './utils/crs'

// Los sistemas ya no se declaran aquí. Había dos listas: la de la tabla de
// coordenadas y esta, con solo 4686 y 9377 y un respaldo silencioso a 9377. Al
// añadir sistemas a la tabla, elegir cualquiera de los nuevos habría exportado
// un SHP en Origen Nacional con un .prj que decía Origen Nacional — es decir,
// un archivo coherente consigo mismo y distinto de lo que pidió el usuario, que
// es la clase de error que nadie detecta hasta que los planos no cuadran.
// Ahora ambas leen utils/crs.js.

// Las coordenadas que llegan de la ANM son geográficas. Se declara 4686 (y no 4326)
// para que el SHP coincida exactamente con lo que muestra la tabla de coordenadas.
const SOURCE_PROJ = crsById(SOURCE_CRS).proj;

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
      const target = crsById(selectedCoordinateSystem);

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

      const folderName = `${expedientCode}_EPSG-${target.id}`;
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
        {isExportingSHP ? (
          <>
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            Exportando...
          </>
        ) : (
          'Exportar SHP'
        )}
      </Button>
      <Button
        variant="default"
        className="w-full bg-green-500 text-white"
        onClick={exportKML}
        disabled={isExportingSHP || isExportingKML}
      >
        {isExportingKML ? (
          <>
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            Exportando...
          </>
        ) : (
          'Exportar KML'
        )}
      </Button>
    </div>
  )
}
