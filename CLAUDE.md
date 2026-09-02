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
- `pdfjs-dist` para abrir las planchas del SGC, que se publican en PDF. Se carga
  con `import()` solo cuando alguien pide una: pesa más de un mega y el paquete
  inicial del visor no lo lleva
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
    usePlanchaGL.js       Traer la plancha en PDF y colocarla sobre el mapa
  utils/
    arcgis.js             fetch normalizado contra ArcGIS REST
    tenureLayers.js       Descubrimiento de índices de capa ANM
    exportUtils.js        KML, empaquetado
    mapStyles.js          Estilo declarativo: fuentes y capas del mapa
    anmLayers.js          Consulta de capas ANM por bbox
    bboxDownload.js       Armado del ZIP y su README
    measure.js            Áreas y distancias en CTM-12 (las definiciones, de crs.js)
    layerFields.js        Qué campos declara una capa ANM, preguntados en runtime
    demTiles.js           Qué teselas del modelo de elevación hacen falta y dónde va cada una
    demTileLoader.js      Bajarlas, decodificarlas a alturas y recordarlas
    terrainRaster.js      Horn sobre el mosaico → los píxeles de la capa
    sgcLayers.js          Catálogo del SGC, direcciones y lectura de sus respuestas
    planchaGeo.js         Georreferenciar una plancha por la cuadrícula que trae dibujada
    planchaPdf.js         Abrir el PDF con pdf.js, medirlo y recortarle el mapa
    planchaUrl.js         Cuál de los enlaces de la ficha es la plancha, y cuál se deja pasar
    panelSize.js          Topes del panel de capas, que se puede redimensionar
    mapUtils.js, mapLabelsGL.js, drawStyles.js
  components/SgcPanel.jsx   Ficha del punto tocado y leyenda del SGC
  components/PlanchaPanel.jsx  La plancha colocada: opacidad, encuadre y con qué error se ajustó
  api/sgc/route.js        Intermediario del SGC: imagen, árbol de capas, campos, identify y leyenda
  api/plancha/route.js    Intermediario para el PDF de una plancha, con lista de dominios permitidos
components/ui/            shadcn
scripts/
  copy-workers.mjs        Copia los workers de MapLibre y pdf.js a public/ (pre-dev y pre-build)
lib/utils.ts              cn(), debounce()
```

## Servicios externos en uso

```
https://annamineria.anm.gov.co/annageo/rest/services/SIGM/TenureLayers/MapServer
  → "Título Vigente", "Solicitud Vigente"
https://annamineria.anm.gov.co/annageo/rest/services/SIGM/VisorInterno/MapServer/87
https://geo.anm.gov.co/webgis/rest/services/ANM/ServiciosANM/MapServer/3
https://srvags.sgc.gov.co/arcgis|arcprod/rest/services/...  → geología (ver utils/sgcLayers.js)
recordcenter.sgc.gov.co, www2.sgc.gov.co  → los PDF de las planchas (vía /api/plancha)
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
tiene cinco modos y no uno: `meta` (qué contiene el servicio), `identify` (qué hay
en este punto), `leyenda` (qué significa cada color) y `campos` (cómo se llama
cada campo y qué significa cada código), además de la imagen. Si mañana se suma
otra entidad que publique en ArcGIS, esos son el mínimo — se
comprobó por las malas, con cinco capas de geología que dibujaban manchas que no
se podían consultar.

**Los códigos que devuelve ArcGIS no se enseñan pelados.** Una ficha que dice
`COD: Qal` obliga a saberse la tabla de memoria. El propio servicio publica esa
tabla en la simbología de cada capa —`MapServer/<capa>?f=json`, en
`drawingInfo.renderer.uniqueValueInfos`—, así que `Qal` se enseña como «Qal —
Depósitos aluviales» sin ningún diccionario nuestro que mantener. El código no se
sustituye, se acompaña: es lo que aparece en los informes y en los mapas
impresos.

**La plancha de verdad está en un PDF, y ahora se puede poner sobre el mapa.**
La ficha de «Estado cartográfico» trae en `ECG_URL_PL` el enlace a la hoja
1:100.000 más actualizada —más que el servicio de teselas, que va por detrás—, y
hasta ahora eso solo se podía abrir en otra pestaña. **Ese PDF no viene
georreferenciado**: es una impresión a PDF, sin `/Measure` ni `/VP` ni `/LGIDict`.
Pero lleva dibujada su cuadrícula plana y rotulada en los márgenes, que es un
juego de puntos de control gratis: se leen los rótulos de la capa de texto, se
buscan sus líneas en la imagen, se ajusta una recta y se recorta el marco. Sobre
la plancha 132 el ajuste queda en ±12 m. Todo eso está en `utils/planchaGeo.js`,
con las dos trampas que costó (la 19 y la 20 de más abajo).

**Y el gestor documental del SGC publica sus enlaces en `http` pelado.** La
primera versión de `/api/plancha` exigía `https` —que parecía lo obvio— y no
colocó ni una hoja: devolvía un 400 diciendo «esa dirección no es un PDF de un
servicio del Estado» sobre direcciones que lo eran. Se aceptan los dos esquemas,
se pide primero cifrado y se baja a `http` solo si el SGC no atiende así.

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

   Y **el campo inexistente no es hipotético**: el filtro «toda la capa»
   traducía el respaldo entre nombres —el estado es `TITULO_ESTADO` en unas
   capas y `STATUS` o `ESTADO` en otras— a un `OR` de los tres, así que en cada
   capa nombraba dos que no tenía. El respaldo pensado para que ninguna capa se
   quedara sin filtrar era lo que las rompía todas. Se pregunta antes qué campos
   declara la capa (`utils/layerFields.js`), que es la trampa nº 1 otra vez: no
   escribir a mano lo que el servicio dice de sí mismo.

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

7. **Los workers de MapLibre y de pdf.js hay que copiarlos a `public/`.**
   MapLibre reparte trabajo a un hilo aparte y lo localiza con una ruta que el
   empaquetador de Next reescribe mal. Falla **en silencio**: el mapa base se ve, los datos
   llegan, las etiquetas se dibujan, y los polígonos simplemente no aparecen —
   sin un solo error en la consola. Por eso existe
   `scripts/copy-workers.mjs`, enganchado a `predev` y `prebuild`. Si alguna vez
   desaparecen los polígonos, mira eso primero. pdf.js tiene exactamente el mismo
   problema, y por eso el script copia los dos.

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

17. **Un control que se arrastra escucha el «soltar» en la ventana, no en sí
    mismo.** La barra de opacidad perdía el valor elegido si se soltaba el ratón
    fuera de ella, y el tirador del panel no funcionaba en absoluto con el
    puntero capturado. Los dos se arreglaron igual: `window.addEventListener`
    para `pointerup` y `pointercancel`, y leer el valor final del propio
    elemento. Un `pointerup` colgado del control no llega si el dedo ya no está
    encima.

    Y **la barra de desplazamiento se lleva el clic**: el tirador del panel
    estaba montado sobre su borde derecho, donde aparece la barra en cuanto la
    lista crece. Funcionaba con el panel corto y dejaba de funcionar justo cuando
    hacía falta agrandarlo. Va por fuera, con `left-full`.

18. **Un tope declarado en el estilo no se entera de que el código lo levantó.**
    Las capas de la ANM llevan `minzoom: 10` en `mapStyles.js`, y `useMapLayersGL`
    desactiva ese tope a propósito cuando el filtro barre la capa entera —lo que
    cumple puede estar lejísimos de lo que se está mirando—. Pero solo lo
    desactivaba *para consultar*: el tope del estilo seguía puesto, así que el
    visor pedía los polígonos, los recibía, los guardaba… y MapLibre se negaba a
    pintarlos. El panel decía «37 de 412» sobre un mapa vacío, y sin el aviso de
    «acerca el mapa», que en ese modo tampoco sale. Lo levanta ahora
    `setLayerZoomRange`. Ojo con el otro extremo: MapLibre esconde la capa **a
    partir** de su `maxzoom`, así que pasarle el zoom máximo del mapa la apagaría
    justo al llegar a él.

    Es otra vez la trampa nº 10: los datos llegaban y se guardaban bien, y
    ninguna prueba sobre ellos podía verlo. Se vio en una captura.

19. **En una hoja antigua, la cuadrícula plana y la retícula geográfica no dicen
    lo mismo.** La plancha 132 lleva las dos rotuladas —`880.000 m.E` abajo,
    `74°55'W` un poco más abajo— y **discrepan unos 300 m en longitud**. No es un
    error de lectura: la hoja es de 1975, del datum Bogotá de entonces, y en 2013
    le transformaron la cuadrícula plana a MAGNA-SIRGAS y le dejaron la retícula
    geográfica vieja. Los 300 m son el salto de datum. Lo dice la propia carátula
    —«Transformada a datum MAGNA SIRGAS, 2013»—, pero hay que leerla sabiendo qué
    significa. **Se georreferencia por la cuadrícula plana**, que es la que lleva
    fecha de revisión; la geográfica se ignora aunque parezca el camino corto por
    venir ya en grados. Ver la cabecera de `utils/planchaGeo.js`.

20. **Un rótulo no está donde está su línea.** Va centrado debajo, así que su
    ancla en la capa de texto del PDF queda corrida media palabra: unos 7 pt, que
    a 1:100.000 son 250 m. La *separación* entre rótulos sí es exacta, porque
    todos miden lo mismo. O sea que los rótulos solos dan bien la escala y mal el
    origen, y colocar la hoja solo con ellos la deja un cuarto de kilómetro
    corrida sin que nada falle. Hay que buscar las **líneas** en la imagen y
    usar los rótulos únicamente para ponerles nombre.

21. **En el teléfono el clic del ratón no llega, y hay que enganchar las dos
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
