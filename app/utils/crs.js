import proj4 from "proj4"

/**
 * Los sistemas de coordenadas en los que el visor sabe expresar un punto.
 *
 * Antes había dos, escritos a mano en tres archivos distintos: la tabla de
 * coordenadas (`components.jsx`), la exportación (`ExportComponent.tsx`) y el
 * cálculo de áreas (`measure.js`). Cada uno repetía la misma cadena de proj4, y
 * la exportación además tenía su propia lista de destinos: al añadir un sistema
 * nuevo a la tabla, el SHP se exportaba en silencio en otro sistema distinto del
 * que pedía el usuario, con un `.prj` que decía algo que no era. De ahí este
 * módulo único: quien quiera un sistema lo pide aquí y se lleva la definición y
 * su `.prj` juntos, que es justo lo que impide que se separen.
 *
 * Módulo puro: no sabe nada de mapas.
 *
 * **Los orígenes antiguos siguen aquí a propósito.** El Origen Bogotá y los
 * otros cuatro husos de MAGNA-SIRGAS ya no son el sistema oficial —lo es el
 * Origen Nacional CTM-12 desde 2020—, pero los títulos mineros inscritos antes
 * de ese cambio están en ellos, y a alguien que compara un plano viejo con el
 * mapa de hoy le hace falta poder leerlos.
 */

const GRS80 = "+ellps=GRS80 +towgs84=0,0,0,0,0,0,0"

/** Los cinco husos de MAGNA-SIRGAS comparten todo menos el meridiano central. */
const magnaZone = (centralMeridian) =>
  `+proj=tmerc +lat_0=4.596200416666666 +lon_0=${centralMeridian} +k=1 ` +
  `+x_0=1000000 +y_0=1000000 ${GRS80} +units=m +no_defs`

const magnaZonePrj = (name, centralMeridian) =>
  `PROJCS["${name}",GEOGCS["GCS_MAGNA",DATUM["D_MAGNA",` +
  `SPHEROID["GRS_1980",6378137.0,298.257222101]],PRIMEM["Greenwich",0.0],` +
  `UNIT["Degree",0.0174532925199433]],PROJECTION["Transverse_Mercator"],` +
  `PARAMETER["False_Easting",1000000.0],PARAMETER["False_Northing",1000000.0],` +
  `PARAMETER["Central_Meridian",${centralMeridian}],PARAMETER["Scale_Factor",1.0],` +
  `PARAMETER["Latitude_Of_Origin",4.596200416666666],UNIT["Meter",1.0]]`

const utmZone = (zone) => `+proj=utm +zone=${zone} +datum=WGS84 +units=m +no_defs`

const utmZonePrj = (zone, centralMeridian) =>
  `PROJCS["WGS_1984_UTM_Zone_${zone}N",GEOGCS["GCS_WGS_1984",DATUM["D_WGS_1984",` +
  `SPHEROID["WGS_1984",6378137.0,298.257223563]],PRIMEM["Greenwich",0.0],` +
  `UNIT["Degree",0.0174532925199433]],PROJECTION["Transverse_Mercator"],` +
  `PARAMETER["False_Easting",500000.0],PARAMETER["False_Northing",0.0],` +
  `PARAMETER["Central_Meridian",${centralMeridian}],PARAMETER["Scale_Factor",0.9996],` +
  `PARAMETER["Latitude_Of_Origin",0.0],UNIT["Meter",1.0]]`

/**
 * El sistema en el que llegan los datos y en el que se guarda todo internamente.
 * Los servicios de la ANM entregan geográficas y el mapa trabaja en ellas; los
 * demás sistemas son solo formas de *mostrar* o *exportar* el mismo punto.
 */
export const SOURCE_CRS = "4686"

export const CRS_LIST = [
  {
    id: "4686",
    label: "MAGNA-SIRGAS geográficas",
    hint: "Latitud y longitud en grados. Es el sistema en que responde la ANM.",
    projected: false,
    proj: `+proj=longlat ${GRS80} +no_defs`,
    prj:
      'GEOGCS["MAGNA-SIRGAS",DATUM["D_MAGNA",SPHEROID["GRS_1980",6378137.0,298.257222101]],' +
      'PRIMEM["Greenwich",0.0],UNIT["Degree",0.0174532925199433]]',
  },
  {
    id: "9377",
    label: "Origen Nacional (CTM-12)",
    hint: "El sistema plano oficial de Colombia desde 2020. Metros.",
    projected: true,
    proj:
      "+proj=tmerc +lat_0=4.0 +lon_0=-73.0 +k=0.9992 +x_0=5000000 +y_0=2000000 " +
      `${GRS80} +units=m +no_defs`,
    prj:
      'PROJCS["MAGNA-SIRGAS_2018_Origen-Nacional",GEOGCS["MAGNA-SIRGAS_2018",' +
      'DATUM["Marco_Geocentrico_Nacional_de_Referencia_2018",' +
      'SPHEROID["GRS_1980",6378137.0,298.257222101]],PRIMEM["Greenwich",0.0],' +
      'UNIT["Degree",0.0174532925199433]],PROJECTION["Transverse_Mercator"],' +
      'PARAMETER["False_Easting",5000000.0],PARAMETER["False_Northing",2000000.0],' +
      'PARAMETER["Central_Meridian",-73.0],PARAMETER["Scale_Factor",0.9992],' +
      'PARAMETER["Latitude_Of_Origin",4.0],UNIT["Meter",1.0]]',
  },
  {
    id: "3116",
    label: "Origen Bogotá (antiguo)",
    hint: "El origen más usado antes del CTM-12. Muchos títulos viejos están aquí.",
    projected: true,
    proj: magnaZone(-74.07750791666666),
    prj: magnaZonePrj("MAGNA_Colombia_Bogota", -74.07750791666666),
  },
  {
    id: "3115",
    label: "Origen Oeste (antiguo)",
    hint: "Huso occidental de MAGNA-SIRGAS. Meridiano central -77°.",
    projected: true,
    proj: magnaZone(-77.07750791666666),
    prj: magnaZonePrj("MAGNA_Colombia_West", -77.07750791666666),
  },
  {
    id: "3114",
    label: "Origen Oeste-Oeste (antiguo)",
    hint: "Huso más occidental, para San Andrés y Providencia.",
    projected: true,
    proj: magnaZone(-80.07750791666666),
    prj: magnaZonePrj("MAGNA_Colombia_West_West", -80.07750791666666),
  },
  {
    id: "3117",
    label: "Origen Este-Central (antiguo)",
    hint: "Huso oriental central. Meridiano central -71°.",
    projected: true,
    proj: magnaZone(-71.07750791666666),
    prj: magnaZonePrj("MAGNA_Colombia_East_Central", -71.07750791666666),
  },
  {
    id: "3118",
    label: "Origen Este (antiguo)",
    hint: "Huso más oriental, para la Orinoquía y la Amazonía.",
    projected: true,
    proj: magnaZone(-68.07750791666666),
    prj: magnaZonePrj("MAGNA_Colombia_East", -68.07750791666666),
  },
  {
    id: "32617",
    label: "UTM 17N (WGS84)",
    hint: "Huso 17: el occidente del país, al oeste de 78°W.",
    projected: true,
    proj: utmZone(17),
    prj: utmZonePrj(17, -81),
  },
  {
    id: "32618",
    label: "UTM 18N (WGS84)",
    hint: "Huso 18: la mayor parte del país, entre 78°W y 72°W.",
    projected: true,
    proj: utmZone(18),
    prj: utmZonePrj(18, -75),
  },
  {
    id: "32619",
    label: "UTM 19N (WGS84)",
    hint: "Huso 19: el oriente del país, al este de 72°W.",
    projected: true,
    proj: utmZone(19),
    prj: utmZonePrj(19, -69),
  },
]

const BY_ID = new Map(CRS_LIST.map((crs) => [crs.id, crs]))

/** La ficha de un sistema. Sin coincidencia, la del sistema de origen. */
export const crsById = (id) => BY_ID.get(id) ?? BY_ID.get(SOURCE_CRS)

/** Cómo se llaman los dos ejes en la interfaz, según sea plano o geográfico. */
export const axisLabels = (id) =>
  crsById(id).projected ? { first: "Norte", second: "Este" } : { first: "Latitud", second: "Longitud" }

/**
 * [lon, lat] geográficas → el sistema pedido.
 *
 * El orden de salida sigue siendo [x, y] —este/norte en los planos, lon/lat en
 * los geográficos—, que es el que espera proj4 y el que usa GeoJSON. Quien
 * muestra los números es el que decide en qué orden los enseña.
 */
export const fromGeographic = (lonLat, targetId) => {
  const target = crsById(targetId)
  if (target.id === SOURCE_CRS) return lonLat
  return proj4(crsById(SOURCE_CRS).proj, target.proj, lonLat)
}

/** El camino de vuelta: del sistema indicado a [lon, lat] geográficas. */
export const toGeographic = (coordinate, sourceId) => {
  const source = crsById(sourceId)
  if (source.id === SOURCE_CRS) return coordinate
  return proj4(source.proj, crsById(SOURCE_CRS).proj, coordinate)
}

/**
 * Un número de coordenada tal como se enseña: grados con cinco decimales y coma
 * —la convención local— o metros redondeados, que en un sistema plano es la
 * precisión que tiene sentido enseñar.
 */
export const formatCoordinate = (value, crsId) =>
  crsById(crsId).projected ? String(Math.round(value)) : value.toFixed(5).replace(".", ",")
