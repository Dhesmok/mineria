import { useState, useCallback } from 'react'
import { Button } from "@/components/ui/button"
import proj4 from 'proj4'
import proj4List from 'proj4-list'
import shpwrite from 'shp-write'

// Define the coordinate systems
proj4.defs("EPSG:4326", "+proj=longlat +datum=WGS84 +no_defs");
proj4.defs("EPSG:4686", "+proj=longlat +ellps=GRS80 +towgs84=0,0,0,0,0,0,0 +no_defs");
proj4.defs("EPSG:9377", "+proj=tmerc +lat_0=4.0 +lon_0=-73.0 +k=0.9992 +x_0=5000000 +y_0=2000000 +ellps=GRS80 +towgs84=0,0,0,0,0,0,0 +units=m +no_defs");


const URLS = [
  'https://annamineria.anm.gov.co/annageo/rest/services/SIGM/TenureLayers/MapServer/3',
  'https://annamineria.anm.gov.co/annageo/rest/services/SIGM/TenureLayers/MapServer/4'
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

  const fixRingOrientation = useCallback((geometry) => {
    if (!geometry || geometry.type !== 'Polygon' && geometry.type !== 'MultiPolygon') {
      return geometry;
    }

    const isClockwise = (ring) => {
      let sum = 0;
      for (let i = 0; i < ring.length - 1; i++) {
        sum += (ring[i+1][0] - ring[i][0]) * (ring[i+1][1] + ring[i][1]);
      }
      return sum > 0;
    };

    const fixPolygon = (polygon) => {
      // El anillo exterior debe ser en sentido horario
      const outerRing = polygon[0];
      if (!isClockwise(outerRing)) {
        polygon[0] = outerRing.slice().reverse();
      }
      
      // Los anillos interiores (huecos) deben ser en sentido antihorario
      for (let i = 1; i < polygon.length; i++) {
        if (isClockwise(polygon[i])) {
          polygon[i] = polygon[i].slice().reverse();
        }
      }
      return polygon;
    };

    if (geometry.type === 'Polygon') {
      return {
        ...geometry,
        coordinates: fixPolygon(geometry.coordinates)
      };
    } else if (geometry.type === 'MultiPolygon') {
      return {
        ...geometry,
        coordinates: geometry.coordinates.map(fixPolygon)
      };
    }
    
    return geometry;
  }, []);

  const fetchMapData = useCallback(async () => {
    for (const url of URLS) {
      const params = new URLSearchParams({
        where: `TENURE_ID='${expedientCode}'`,
        outFields: '*',
        f: 'geojson'
      });

      try {
        console.log(`Fetching data from ${url}...`);
        const response = await fetch(`${url}/query?${params}`, {
          method: 'GET',
          headers: {
            'Accept': 'application/json',
          },
        });

        if (!response.ok) {
          throw new Error(`HTTP error! status: ${response.status}`);
        }

        const data = await response.json();
        console.log(`Data received from ${url}:`, data);
        if (data.features && data.features.length > 0) {
          return data;
        }
      } catch (error) {
        console.error(`Error fetching data from ${url}:`, error);
      }
    }

    throw new Error('No se encontraron datos para el expediente especificado en ninguna de las fuentes');
  }, [expedientCode]);

  const exportSHP = useCallback(async () => {
    if (!expedientCode) {
      alert('No hay expediente para exportar');
      return;
    }

    setIsExportingSHP(true);

    try {
      console.log("Iniciando exportación SHP...");
      
      const mapData = await fetchMapData();
      console.log("Datos obtenidos:", JSON.stringify(mapData, null, 2));

      if (!mapData.features || mapData.features.length === 0) {
        throw new Error('No se encontraron datos para el expediente especificado');
      }

      const fromProj = "EPSG:4326";
      const toProj = `EPSG:${selectedCoordinateSystem}`;

      console.log("Transformando coordenadas...");
      let transformedGeoJson = {
        type: "FeatureCollection",
        features: mapData.features.map(feature => {
          // Primero transformamos las coordenadas
          const transformedCoords = transformCoordinates(
            feature.geometry.coordinates, 
            fromProj, 
            toProj
          );
          
          // Luego corregimos la orientación de los anillos
          const fixedGeometry = fixRingOrientation({
            type: feature.geometry.type,
            coordinates: transformedCoords
          });
          
          return {
            type: "Feature",
            properties: feature.properties,
            geometry: fixedGeometry
          };
        })
      };

      console.log("GeoJSON transformado:", JSON.stringify(transformedGeoJson, null, 2));

      console.log("Verificando geometrías antes de crear Shapefile...");
      transformedGeoJson.features.forEach((feature, index) => {
        if (feature.geometry.type === 'Polygon' || feature.geometry.type === 'MultiPolygon') {
          console.log(`Verificando geometría ${index+1}/${transformedGeoJson.features.length}`);
        }
      });

      console.log("Creando Shapefile...");
      const options = {
        folder: expedientCode+"_EPSG-"+selectedCoordinateSystem,
        types: {
          point: 'points',
          polygon: expedientCode,
          line: 'lines'
        },
        prj: selectedCoordinateSystem
      };
      console.log(selectedCoordinateSystem)

      shpwrite.download(transformedGeoJson, options);

      console.log("Shapefile creado y descarga iniciada.");

    } catch (error) {
      console.error('Error detallado al exportar SHP:', error);
      alert(`Hubo un error al exportar el archivo SHP: ${error.message}`);
    } finally {
      setIsExportingSHP(false);
    }
  }, [expedientCode, selectedCoordinateSystem, fetchMapData, transformCoordinates, fixRingOrientation]);

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
  