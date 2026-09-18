"use client"

import { useCallback, useRef, useState } from "react"

import { readGeoFiles } from "../utils/fileImport"
import {
  buildUserLayer,
  bboxOfFeatureCollection,
  candidateSourceCrs,
  colorForUserLayer,
  guessSourceCrs,
  layerLabelFromFileName,
  looksGeographic,
  withSourceCrs,
} from "../utils/userLayers"
import { crsById, SOURCE_CRS } from "../utils/crs"
import { darken } from "../utils/colors"

/**
 * Las capas que carga el usuario: leer los archivos y decidir dónde van.
 *
 * Vive fuera del mapa —no toca MapLibre— porque lo que hace es de datos: leer, y
 * sobre todo **resolver en qué sistema de coordenadas está cada cosa**, que es la
 * única pregunta difícil de todo esto. Quien las dibuja es `useUserLayersGL`.
 *
 * Nada de esto se guarda entre visitas. Podría —`localStorage` aguantaría un
 * shapefile pequeño— y es mejor que no: son datos de alguien, a veces de un
 * lindero en trámite, y dejarlos en el navegador de una máquina compartida es un
 * riesgo que nadie pidió correr. Se cargan, se usan y se van al cerrar. De paso,
 * `sanitizePreferences` ya descarta lo que no reconoce (ver `preferences.js`), así
 * que el estado y el orden de estas capas se ignoran solos al guardarse.
 */

/**
 * El sistema que se le atribuye a un archivo, y con cuánta confianza.
 *
 * Tres caminos, y los tres acaban en una capa dibujada:
 *
 * 1. **El archivo lo dice y los números lo confirman.** Un KML es geográfico por
 *    definición; un shapefile con `.prj` lo reproyecta la librería de lectura. No
 *    hay nada que preguntar.
 *
 * 2. **El archivo dice que es geográfico y los números dicen que no.** Pasa más
 *    de lo que parece: `shpjs` intenta el `.prj` con proj4 y si no lo entiende
 *    **deja las coordenadas como estaban, sin avisar**. Un este de 1.043.210 no
 *    es una longitud, y por eso no se cree lo que declara el archivo sin mirar
 *    antes los números. Es la misma clase de fallo que la trampa nº 2 de
 *    CLAUDE.md: la llamada no falla, devuelve algo verosímil.
 *
 * 3. **El archivo no dice nada** —el caso del DXF— y hay que adivinar probando
 *    cuál de los diez sistemas deja el archivo dentro de Colombia. Ver
 *    `candidateSourceCrs`.
 *
 * En los casos 2 y 3 la capa se marca como suposición, y el panel lo enseña en
 * ámbar con el selector al lado. Dibujarla callando la duda sería lo peor de las
 * dos opciones: la trampa nº 34 de CLAUDE.md es justamente una plancha colocada
 * cinco kilómetros más allá sin más aviso que una raya en un panel.
 */
const resolverCrs = (capa) => {
  const bbox = bboxOfFeatureCollection(capa.featureCollection)
  const declarado = capa.crs

  if (declarado && looksGeographic(bbox)) {
    return { crsId: declarado, crsGuessed: false, warnings: [] }
  }

  const candidatos = candidateSourceCrs(bbox)
  const elegido = guessSourceCrs(bbox)

  if (!elegido) {
    // Ni geográfico ni ninguno de los diez sistemas lo deja en Colombia: un CAD
    // en coordenadas locales (origen inventado en una esquina de la mina) o un
    // archivo de otro país en un sistema que no tenemos. Se dibuja donde caiga
    // —con los números tal cual— y se dice, porque lo que no se puede hacer es
    // callarlo: una capa en el golfo de Guinea con el mapa en Antioquia parece
    // que no cargó.
    return {
      crsId: SOURCE_CRS,
      crsGuessed: true,
      warnings: [
        "No se pudo deducir el sistema de coordenadas: los números no son grados y no cuadran con ninguno de los sistemas de Colombia. " +
          "Si el CAD está en coordenadas locales, hay que georreferenciarlo antes; si no, elige el sistema a mano.",
      ],
    }
  }

  const aviso = declarado
    ? `El archivo decía venir en coordenadas geográficas, pero sus números no son grados: se dibuja como ${crsById(elegido).label}. ` +
      "Suele significar que el .prj no se pudo interpretar."
    : `El archivo no dice en qué sistema de coordenadas está. Se dibuja como ${crsById(elegido).label}, que es el que lo deja dentro de Colombia.`

  const ambiguo =
    candidatos.length > 1
      ? ` Hay ${candidatos.length} sistemas que también encajarían: comprueba que la capa caiga donde debe y cámbialo si no.`
      : ""

  return { crsId: elegido, crsGuessed: true, warnings: [aviso + ambiguo] }
}

/**
 * @param {(layer: object) => void} onLayerAdded  para que el panel le dé estado
 *   (encendida, opacidad, color) y la ponga arriba en el orden de pintado
 * @param {(key: string) => void} onLayerRemoved
 */
export const useUserLayers = ({ onLayerAdded, onLayerRemoved } = {}) => {
  const [userLayers, setUserLayers] = useState([])
  const [loading, setLoading] = useState(false)
  const [problems, setProblems] = useState([])
  // Un contador para las claves, y no el nombre del archivo: cargar dos veces el
  // mismo plano —cosa que se hace al corregirlo y volver a exportarlo— daría dos
  // capas con la misma clave, y la segunda pisaría a la primera en el mapa.
  const siguienteIdRef = useRef(1)
  // Cuántas se han cargado en total, para que el color no se repita al quitar y
  // volver a cargar.
  const cargadasRef = useRef(0)

  const importFiles = useCallback(
    async (files) => {
      const lista = Array.from(files ?? [])
      if (lista.length === 0) return []

      setLoading(true)
      setProblems([])

      try {
        const { layers, problems: fallos } = await readGeoFiles(lista)

        const nuevas = layers.map((capa) => {
          const { crsId, crsGuessed, warnings } = resolverCrs(capa)
          const color = colorForUserLayer(cargadasRef.current)
          cargadasRef.current += 1

          return buildUserLayer({
            id: String(siguienteIdRef.current++),
            label: layerLabelFromFileName(capa.name),
            source: capa.name,
            featureCollection: capa.featureCollection,
            crsId,
            crsGuessed,
            warnings: [...(capa.warnings ?? []), ...warnings],
            fillColor: color,
            lineColor: darken(color, 0.35),
          })
        })

        setProblems(fallos)
        if (nuevas.length > 0) {
          setUserLayers((actuales) => [...nuevas, ...actuales])
          nuevas.forEach((capa) => onLayerAdded?.(capa))
        }

        return nuevas
      } catch (error) {
        // `readGeoFiles` no lanza —cada archivo trae su propio fallo— así que
        // llegar aquí es un error nuestro. Se enseña igual: quedarse en «cargando»
        // para siempre es la peor forma de fallar.
        setProblems([{ name: "Carga de archivos", message: error?.message || "No se pudieron leer los archivos." }])
        return []
      } finally {
        setLoading(false)
      }
    },
    [onLayerAdded],
  )

  const removeLayer = useCallback(
    (key) => {
      setUserLayers((actuales) => actuales.filter((capa) => capa.key !== key))
      onLayerRemoved?.(key)
    },
    [onLayerRemoved],
  )

  /**
   * Cambiar el sistema de origen de una capa ya cargada.
   *
   * Se reproyecta **desde el archivo**, no desde lo que se está dibujando: ver
   * `reprojectFeatureCollection`. Y se le quita el aviso de suposición, porque
   * elegirlo a mano es exactamente lo contrario de una suposición.
   */
  const setLayerCrs = useCallback((key, crsId) => {
    setUserLayers((actuales) =>
      actuales.map((capa) => (capa.key === key ? withSourceCrs(capa, crsId) : capa)),
    )
  }, [])

  const clearProblems = useCallback(() => setProblems([]), [])

  return { userLayers, loading, problems, importFiles, removeLayer, setLayerCrs, clearProblems }
}
