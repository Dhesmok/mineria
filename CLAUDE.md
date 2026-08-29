# CLAUDE.md — Proyecto `mineria` (visor)

Contexto permanente del proyecto. Léelo completo al inicio de cada sesión.

---

## Qué es esto

Visor web de información geoespacial minera y territorial de Colombia.
Desplegado en Vercel (`mineria-phi.vercel.app`, dominio `visor.com` vía CNAME).

**Autor:** Fabio Espinosa — geólogo, sector minero, Medellín.
**Importante:** no tiene formación en programación. Explica las decisiones
técnicas en términos del problema, no del framework. No asumas que sabe qué es
un `useEffect`, un bundler o una race condition sin explicarlo.

## Visión (hacia dónde va)

Pasar de "visor de títulos mineros ANM" a una herramienta que:

1. Permita dibujar un área y **descargar todas las capas relevantes en un ZIP**
   (GeoJSON/SHP/KML + DEM recortado + README con fuentes, fechas y CRS).
2. Tenga un **toggle 2D → 3D** con terreno real, sin fricción.
3. Integre servicios de **múltiples entidades del Estado**, no solo la ANM.

El objetivo es velocidad. Colombia en Mapas (IGAC) ya agrega 12.000 datasets,
pero descargar de ahí es lento y doloroso. La ventaja competitiva de este
proyecto es "dibuja un cuadro y sal con los archivos", no ser otro visor.

## Stack actual

- Next.js 14 (App Router) + React 18
- Tailwind + shadcn/ui (Radix)
- **MapLibre GL JS** + `@mapbox/mapbox-gl-draw`
- `proj4` para reproyección, con las definiciones a mano en `utils/crs.js`
- `@turf/turf` para geometría, `polylabel` para colocar etiquetas
- `jszip`, `file-saver` y `@mapbox/shp-write` para exportar. **El KML se
  construye a mano** en `utils/exportUtils.js`; no hay librería de por medio
- `@esri/arcgis-to-geojson-utils` para traducir lo que responde ArcGIS
- Jest + Testing Library

Esta lista incluía cinco paquetes que el código no importaba en ninguna parte
—`epsg-to-proj`, `geojson2shp`, `tokml`, `shapefile`, `shpjs`—, más `@shadcn/ui`
y `shadcn-ui`, que es una herramienta de línea de comandos y no una librería.
Los ocho se quitaron: arrastraban 136 paquetes y once de las veintitrés alertas
de seguridad que tenía el proyecto. **Si añades algo aquí, que sea porque un
`import` lo usa**; una lista de dependencias que no coincide con el código
manda a quien la lee —persona o modelo— a buscar en el sitio equivocado.

**Leaflet ya no está.** La migración terminó (ver `docs/PLAN-MAPLIBRE.md`). Si
encuentras un comentario que menciona Leaflet es historia, no una dependencia:
explica por qué algo quedó como quedó.

## Estructura

```
app/
  MapComponentGL.jsx      Mapa principal (MapLibre). Es el único visor
  components.jsx          UI: panel lateral, búsqueda, controles
  ExportComponent.tsx     Exportación a KML/SHP/ZIP
  hooks/map/
    useMapInitializationGL.js
    useMapLayersGL.js     Gestión de capas ANM
    useDrawControlGL.js   mapbox-gl-draw + medidas
    useExpedientSearchGL.js Búsqueda por expediente + autocompletado
    useTerrainGL.js       Relieve, 3D y consulta de altura
    useAreaDownloadGL.js  Descarga por área (ZIP)
    useGeolocationGL.js   GPS y brújula
    useSgcLayersGL.js     Geología: encender, elegir departamento, consultar un punto
  utils/
    arcgis.js             fetch normalizado contra ArcGIS REST
    tenureLayers.js       Descubrimiento de índices de capa ANM
    exportUtils.js        KML, empaquetado
    mapStyles.js          Estilo declarativo: fuentes y capas del mapa
    anmLayers.js          Consulta de capas ANM por bbox
    bboxDownload.js       Armado del ZIP y su README
    measure.js            Áreas y distancias en CTM-12
    demTiles.js           Qué teselas del modelo de elevación hacen falta y dónde va cada una
    demTileLoader.js      Bajarlas, decodificarlas a alturas y recordarlas
    terrainRaster.js      Horn sobre el mosaico → los píxeles de la capa
    sgcLayers.js          Catálogo del SGC, direcciones y lectura de sus respuestas
    mapUtils.js, mapLabelsGL.js, drawStyles.js
  components/SgcPanel.jsx   Ficha del punto tocado y leyenda del SGC
  api/sgc/route.js        Intermediario del SGC: imagen, árbol de capas, identify y leyenda
components/ui/            shadcn
scripts/
  copy-maplibre-worker.mjs  Copia el worker de MapLibre a public/ (pre-dev y pre-build)
lib/utils.ts              cn(), debounce()
```

## Servicios externos en uso

```
https://annamineria.anm.gov.co/annageo/rest/services/SIGM/TenureLayers/MapServer
  → "Título Vigente", "Solicitud Vigente"
https://annamineria.anm.gov.co/annageo/rest/services/SIGM/VisorInterno/MapServer/87
https://geo.anm.gov.co/webgis/rest/services/ANM/ServiciosANM/MapServer/3
https://srvags.sgc.gov.co/arcgis|arcprod/rest/services/...  → geología (ver utils/sgcLayers.js)
```

**La ANM sí permite CORS desde el navegador.** No asumas lo mismo de otras
entidades (IGAC, SGC, IDEAM, ANLA): hay que probar cada una, y si bloquean,
montar un proxy en una API route de Next.

**Del SGC no se pudo comprobar**, porque el proxy de la máquina de desarrollo
bloquea `sgc.gov.co`. Por eso sus capas pasan por `app/api/sgc/route.js`, que
funciona permita CORS o no. Si algún día se comprueba que sí lo permite, quitar
el intermediario es cambiar una línea de `utils/sgcLayers.js` — y conviene, para
que sus imágenes dejen de pasar por nuestro servidor.

**Las capas del SGC van como imagen, no como polígonos**, y es a propósito: su
simbología *es* el dato —un geólogo reconoce la unidad por el color—, son miles
de polígonos, y exportar el servicio entero evita nombrar ni un índice de capa.
Ver la cabecera de `utils/sgcLayers.js`.

**Pero una imagen sola no es una capa: es un adorno.** Para que sirva hacen falta
las otras tres preguntas que el mismo servicio responde, y por eso `/api/sgc`
tiene cuatro modos y no uno: `meta` (qué contiene el servicio), `identify` (qué
hay en este punto) y `leyenda` (qué significa cada color), además de la imagen. Si
mañana se suma otra entidad que publique en ArcGIS, esos cuatro son el mínimo — se
comprobó por las malas, con cinco capas de geología que dibujaban manchas que no
se podían consultar.

**Y la imagen es una por vista, no una rejilla de teselas.** ArcGIS dibuja cada
imagen que le piden sin saber nada de las de al lado, así que rotula cada una por
separado: la grilla de planchas escribía el número de cada cuadrícula cuatro
veces, una por tesela. Con teselas eso no tiene arreglo. Ver `sgcImageUrl` en
`utils/sgcLayers.js`.

## Trampas conocidas (no las vuelvas a pisar)

1. **Los índices de capa de la ANM cambian entre despliegues.** Nunca los
   escribas fijos en el código. `findTenureLayerNumbers()` los descubre en
   runtime y cachea el resultado a nivel de módulo. Hubo un bug donde el
   autocompletado los tenía fijos en 3 y 4 mientras el resto de la app los
   descubría, y las dos vías discrepaban.

2. **ArcGIS responde HTTP 200 con cuerpo `{"error": {...}}`** cuando el `where`
   referencia un campo inexistente o el servicio está degradado. Como
   `response.ok` es `true` y `data.features` queda `undefined`, esos fallos se
   confundían con "no se encontró el expediente". Usa siempre
   `fetchArcgisJson()`, nunca `fetch` pelado contra ArcGIS.

3. **No caches resultados incompletos.** Si las peticiones de descubrimiento
   fallan todas, guardar `{}` deja las capas rotas hasta recargar la página.

4. **Al exportar KML, las geometrías no siempre son `Polygon`.** Un
   `MultiPolygon` tiene un nivel más de anidamiento y hay que respetar los
   huecos (`innerBoundaryIs`). Ya hubo un bug por asumir
   `features[0].geometry.coordinates[0]`.

5. **Nunca versiones `.next/`.** Ya se coló una vez y el repo pesaba 125 MB.

6. **Un solo archivo de dependencias: `package-lock.json`.** Convivía con un
   `pnpm-lock.yaml` viejo que no tenía MapLibre, y tanto Vercel como Netlify
   prefieren pnpm cuando ven ese archivo: los despliegues fallaron con cinco
   comprobaciones en rojo. Si aparece otro archivo de bloqueo, bórralo.

7. **El worker de MapLibre hay que copiarlo a `public/`.** MapLibre reparte
   trabajo a un hilo aparte y lo localiza con una ruta que el empaquetador de
   Next reescribe mal. Falla **en silencio**: el mapa base se ve, los datos
   llegan, las etiquetas se dibujan, y los polígonos simplemente no aparecen —
   sin un solo error en la consola. Por eso existe
   `scripts/copy-maplibre-worker.mjs`, enganchado a `predev` y `prebuild`. Si
   alguna vez desaparecen los polígonos, mira eso primero.

8. **`queryTerrainElevation()` devuelve la altura multiplicada por la
   exageración**, no la real. Con exageración 1,5 un cerro de 1.880 m reporta
   2.820. Usa siempre el helper `elevationAt()` de `useTerrainGL`, que divide.

   Y **no le preguntes alturas a MapLibre en bucle**. Con el terreno puesto,
   cada `unproject` lanza un rayo contra la malla del relieve: veinte mil
   consultas eran diez segundos y medio de navegador congelado, y repetirlas
   cada vez que llegaban teselas tumbaba la pestaña. Para cualquier cosa que
   necesite muchas alturas —una capa derivada, un recorte de DEM— usa
   `demTiles.js` + `demTileLoader.js`, que bajan las teselas del modelo y las
   dejan en un `Float32Array`. Para un puñado de puntos, `elevationAt()` está
   bien: el perfil longitudinal son 300 y no se nota.

9. **Dentro del bloque de CSS de `MapComponentGL` no pueden ir comillas
   invertidas**, ni siquiera en un comentario: ese CSS vive en una plantilla de
   texto delimitada por ese mismo carácter y una sola la cierra antes de
   tiempo. El compilador falla sin decir dónde ni por qué.

10. **Verificar con datos no basta; hay que mirar la pantalla.** Cinco bugs de
    este proyecto —el color de las figuras, el worker de arriba, la ficha del
    móvil, el ancho del panel plegado y el desfase de zoom de abajo— pasaban
    todas las comprobaciones sobre los datos y solo se vieron en una captura.
    Cuando algo es visual, compruébalo visualmente. Y **mide la magnitud de la
    que dudas, no la de al lado**: dos de esos cinco se colaron por medir el
    alto y dar por bueno el ancho.

11. **MapLibre cuenta el zoom con teselas de 512 px; las del modelo de elevación
    son de 256.** Su nivel 12 es el 13 de esas teselas. Al pedirlas a mano hay
    que sumar uno (`demZoomFor()` lo hace y explica por qué). Sin el desfase no
    falla nada visible: la capa sale bien colocada y con los colores correctos,
    solo que a la mitad de la resolución que la pantalla podía enseñar.

12. **MapLibre coloca la cámara sobre la cota del centro —como Google Earth—,
    pero solo si la conoce en ese instante.** Si `setTerrain` y el movimiento de
    cámara van seguidos, la pose se calcula con cota cero y **no la vuelve a
    tocar nunca**: comprobado dejándolo quince segundos con el suelo a 2.700 m y
    la cámara a 424. Hay que esperar a que el terreno cargue antes de mover.

    Y lo que hay que salvar al entrar en 3D **no es la cota del terreno sino
    cuánto sobresale el relieve por encima del punto que se mira**. Confundir las
    dos cosas alejaba el mapa nivel y medio de zoom de más. Lo calcula
    `camera3d.js`; si tocas la cámara del 3D, pásalo por ahí.

    Y **`queryTerrainElevation` no sirve para medirlo**: MapLibre solo tiene las
    teselas de lo que dibuja, así que con mucho zoom responde cero. La altura hay
    que sacarla del modelo, con `demTileLoader.reliefAround()`.

    Nota de método: la primera versión de este arreglo dio por hecho que la
    cámara se mide desde el nivel del mar, porque eso es lo que devolvía
    `getCameraAltitude()` **antes de que cargara el terreno**. Medir en el momento
    equivocado da un número correcto de una pregunta distinta.

13. **El SGC tiene tres instancias de ArcGIS** —`/arcgis/`, `/arcprod/` y
    `/arcpro/`— y el mismo servicio puede vivir en una y no en otra. Y el
    servicio de estado de la cartografía lleva una errata del propio SGC:
    `Estado_Catografia_Geologica`, sin la «r». Corregirla al copiarla deja la
    capa en blanco.

14. **Antes de sumar una dependencia, mira si ya existe.** El proyecto arrastró
    ocho paquetes que ningún `import` usaba. Pero al revés también cuenta:
    `maplibre-contour` (MIT) ya resuelve bajar y decodificar teselas terrarium
    en un *worker* y servirlas por `addProtocol`; si algún día la capa de
    pendiente pasa a teselas, es el sitio por donde empezar a mirar.

15. **Un servicio de ArcGIS trae encendida solo una parte de lo que tiene.**
    «Geología por departamentos» dibujaba únicamente Antioquia, y parecía un
    fallo nuestro: no lo era, es lo que el SGC trae por omisión y nosotros lo
    exportábamos tal cual. Se arregla leyendo `defaultVisibility` del árbol de
    capas y ofreciendo el resto — nunca escribiendo la lista a mano, que es la
    trampa nº 1.

    Y **al cambiar qué subcapas se piden hay que cambiar la dirección de la
    tesela**: MapLibre las guarda por URL, así que con la misma dirección sigue
    enseñando las que ya tenía por mucho que se marque otro departamento. Por eso
    la selección viaja dentro de la URL.

16. **`map.isStyleLoaded()` no sirve para esperar a estas capas.** Devuelve falso
    mientras *cualquier* fuente siga cargando, y las del SGC tardan segundos: una
    guarda con eso deja el cambio sin aplicar justo cuando el servicio va lento,
    que es siempre. La condición correcta es que exista la fuente. Es la misma
    trampa que obligó a escuchar `styledata` en vez de `load` al arrancar el mapa.

17. **En el teléfono el clic del ratón no llega, y hay que enganchar las dos
    cosas.** `mapbox-gl-draw` cancela el `touchend`, y sin él el navegador no
    genera el clic de compatibilidad. Todo lo que responda a tocar el mapa se
    engancha por partida doble: `map.on("click", …)` y `onMapTap(map, …)` de
    `utils/tapGesture`. Y el manejador recibe **`{point, lngLat}`**, como el de
    MapLibre — no un par de números.

## Convenciones

- **Comentarios en español**, y que expliquen *por qué*, no *qué*. El estilo
  actual documenta el bug que motivó cada decisión — mantenlo, es lo que hace
  el código legible para alguien sin background en programación.
- Antes de refactorizar un módulo con tests, corre `npm test` y déjalo verde.
- Los módulos de `utils/` son lógica pura, sin dependencias del motor de mapa.
  Mantén esa separación: es lo que hizo posible cambiar de Leaflet a MapLibre
  sin reescribir la parte difícil.

## CRS

- **MAGNA-SIRGAS geográficas** (EPSG:4686) para vértices y coordenadas de
  referencia.
- **CTM-12** (EPSG:9377) para cálculos de área y distancia.
- Los servicios ANM entregan en Web Mercator (EPSG:3857) o geográficas;
  verifica siempre antes de calcular áreas.
- Alturas de DEMs globales son **elipsoidales**. Para cotas ortométricas hay que
  aplicar geoide (EGM2008 o GEOCOL). Anótalo en el README de las descargas.

## Comandos

```bash
npm run dev     # servidor de desarrollo
npm run build
npm test        # Jest
```

## Trabajo pendiente inmediato

Ver `docs/PLAN-MAPLIBRE.md`.

## Riesgos abiertos

`docs/RIESGOS.md`. **Léelo antes de tocar los mapas de fondo o de sumar una
entidad nueva.** No son fallos del código: son decisiones sin tomar que pueden
obligar a apagar algo —las condiciones de uso de las teselas de Google, la falta
de licencia del repositorio, y que todos los datos vengan de un único servicio—.

Es una lista viva, no una foto: se revisa y se tacha. `docs/AUDITORIA.md` es lo
contrario, una foto fechada de agosto que se conserva por su razonamiento; ahí
adentro hay una corrección marcada de una afirmación que resultó falsa.
