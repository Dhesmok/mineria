import { useState, useCallback } from 'react'
import { Button } from "@/components/ui/button"
import { Loader2 } from "lucide-react"
import proj4 from 'proj4'
import shpwrite from '@mapbox/shp-write'
import * as turf from '@turf/turf'
import { saveAs } from 'file-saver'

// Define the coordinate systems
proj4.defs("EPSG:4326", "+proj=longlat +datum=WGS84 +no_defs");
proj4.defs("EPSG:4686", "+proj=longlat +ellps=GRS80 +towgs84=0,0,0,0,0,0,0 +no_defs");
proj4.defs("EPSG:9377", "+proj=tmerc +lat_0=4.0 +lon_0=-73.0 +k=0.9992 +x_0=5000000 +y_0=2000000 +ellps=GRS80 +towgs84=0,0,0,0,0,0,0 +units=m +no_defs");

const PRJ_9377 = 'PROJCS["MAGNA-SIRGAS_2018_Origen-Nacional",GEOGCS["MAGNA-SIRGAS_2018",DATUM["Marco_Geocentrico_Nacional_de_Referencia_2018",SPHEROID["GRS_1980",6378137.0,298.257222101]],PRIMEM["Greenwich",0.0],UNIT["Degree",0.0174532925199433]],PROJECTION["Transverse_Mercator"],PARAMETER["False_Easting",5000000.0],PARAMETER["False_Northing",2000000.0],PARAMETER["Central_Meridian",-73.0],PARAMETER["Scale_Factor",0.9992],PARAMETER["Latitude_Of_Origin",4.0],UNIT["Meter",1.0]]';


const URLS = [
  'https://annamineria.anm.gov.co/annageo/rest/services/SIGM/TenureLayers/MapServer/3',
  'https://annamineria.anm.gov.co/annageo/rest/services/SIGM/TenureLayers/MapServer/4',
  'https://annamineria.anm.gov.co/annageo/rest/services/SIGM/VisorInterno/MapServer/87'
];

export default function ExportComponent({ selectedCoordinateSystem, expedientCode }) {
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

  const fetchMapData = useCallback(async () => {
    const controller = new AbortController();
    const { signal } = controller;

    const promises = URLS.map(async (url) => {
      const params = new URLSearchParams({
        where: `TENURE_ID='${expedientCode}'`,
        outFields: '*',
        f: 'geojson'
      });

      console.log(`Fetching data from ${url}...`);
      const response = await fetch(`${url}/query?${params}`, {
        method: 'GET',
        headers: {
          'Accept': 'application/json',
        },
        signal,
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const data = await response.json();
      console.log(`Data received from ${url}:`, data);

      if (data.features && data.features.length > 0) {
        return data;
      }

      throw new Error(`No valid features found from ${url}`);
    });

    try {
      const result = await Promise.any(promises);
      controller.abort();
      return result;
    } catch (error) {
      console.error('All fetch attempts failed:', error);
      throw new Error('No se encontraron datos para el expediente especificado en ninguna de las fuentes');
    }
  }, [expedientCode]);

  const exportSHP = useCallback(async () => {
    if (!expedientCode) {
      alert('No hay expediente para exportar');
      return;
    }

    setIsExportingSHP(true);

    try {
      const mapData = await fetchMapData();

      if (!mapData.features || mapData.features.length === 0) {
        throw new Error('No se encontraron datos para el expediente especificado');
      }

      const fromProj = "EPSG:4326";
      const toProj = `EPSG:9377`;

      let transformedGeoJson: any = {
        type: "FeatureCollection",
        features: mapData.features.map(feature => {
          // Primero transformamos las coordenadas
          const transformedCoords = transformCoordinates(
            feature.geometry.coordinates, 
            fromProj, 
            toProj
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

      const folderName = expedientCode+"_EPSG-9377";
      const options: any = {
        folder: folderName,
        types: {
          point: 'points',
          polygon: expedientCode,
          line: 'lines'
        },
        prj: PRJ_9377,
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
  }, [expedientCode, selectedCoordinateSystem, fetchMapData, transformCoordinates]);

  const exportKML = useCallback(async () => {
    if (!expedientCode) {
      alert('No hay expediente para exportar');
      return;
    }

    setIsExportingKML(true);

    try {
      const mapData = await fetchMapData();

      if (!mapData.features || mapData.features.length === 0) {
        throw new Error('No se encontraron datos para el expediente especificado');
      }

      // Create KML content
      let kml = `<?xml version="1.0" encoding="UTF-8"?>
<kml xmlns="http://www.opengis.net/kml/2.2">
  <Document>
    <Style id="polygonStyle">
      <LineStyle>
        <color>ff00ffff</color>
        <width>2</width>
      </LineStyle>
      <PolyStyle>
        <color>00ffffff</color>
      </PolyStyle>
    </Style>
    <Placemark>
      <styleUrl>#polygonStyle</styleUrl>
      <name>${expedientCode}</name>
      <Polygon>
        <outerBoundaryIs>
          <LinearRing>
            <coordinates>
`;

      // Add coordinates
      const coordinates = mapData.features[0].geometry.coordinates[0];
      coordinates.forEach(coord => {
        kml += `              ${coord[0]},${coord[1]},0\n`;
      });

      kml += `            </coordinates>
          </LinearRing>
        </outerBoundaryIs>
      </Polygon>
    </Placemark>
  </Document>
</kml>`;

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
  }, [expedientCode, fetchMapData]);

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
        ) : 'Exportar SHP'}
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
        ) : 'Exportar KML'}
      </Button>
    </div>
  )
}
  