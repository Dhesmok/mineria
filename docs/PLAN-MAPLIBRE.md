# Plan: migración a MapLibre + terreno 3D

Documento de trabajo. Marca las casillas a medida que avances y actualiza el
estado al final de cada sesión, para que la siguiente sesión sepa dónde quedó.

**Estado:** Fases 0 a 4 completas. Siguiente: Fase 5 (descarga por bbox).
**Última actualización:** 2026-08-20

---

## Por qué migrar

Leaflet es 2D por diseño. No existe plugin que le agregue terreno real. Como el
toggle 2D→3D es una de las tres funciones centrales de la visión del proyecto,
el motor de mapa tiene que cambiar. Hacerlo ahora es barato; hacerlo después de
agregar diez capas más, no.

MapLibre GL JS además trae: renderizado vectorial por GPU (mucho más rápido con
polígonos de títulos mineros), estilo declarativo, y `setTerrain()` nativo.

## Qué sobrevive sin tocarse

Esto es el argumento de que la migración es abordable. De ~3.900 líneas, se
reescriben ~800.

| Módulo | Estado |
|---|---|
| `utils/arcgis.js` | Intacto — es `fetch` puro |
| `utils/tenureLayers.js` | Intacto |
| `utils/exportUtils.js` | Intacto |
| `utils/mapUtils.js` | Intacto, y creció: se le mudaron `shouldShowLabels` y respaldos de la ficha |
| `utils/mapLabels.js` | Reescrito para MapLibre en `mapLabelsGL.js`; el original sigue para Leaflet |
| ~~`hooks/useExpedientSearch.js`~~ | **Reescribir.** La tabla se equivocaba: usa `L.geoJSON` y `fitBounds`. Hecho en la Fase 3 |
| `components/ui/*` | Intacto |
| `hooks/useMapLayers.js` | Reescribir |
| `hooks/useDrawControl.js` | Reescribir (mapbox-gl-draw) |
| `hooks/useMapInitialization.js` | Reescribir |
| `MapComponent.jsx` | Reescribir |

**Regla:** si un test pasa antes de la migración, tiene que pasar después. Los
tests de `utils/` son la red de seguridad de todo este trabajo.

---

## Fase 0 — Limpieza (antes de tocar código)

- [x] `git rm -r --cached .next dev_server.log dev_server.pid screenshot_result.png`
      (además se añadieron al `.gitignore`, que solo cubría `.next`)
- [x] Mover `@/lib/utils.ts` → `lib/utils.ts` y borrar la carpeta `@/`
      (el `tsconfig` mapea `@/*` → `./*`, así que `lib/` debe estar en la raíz;
      la carpeta literal `@` es un accidente que va a romper en otro entorno)
- [x] Borrar `index.html` (0 bytes) y `mapa.html` (visor Leaflet suelto, obsoleto)
- [x] Quitar los comentarios `//` de `tsconfig.json` (JSON estándar no los admite)
- [x] `npm test` en verde antes de continuar — 8 suites, 69 tests, todo pasa.
      `npm run build` también compila.

## Fase 1 — Mapa base en MapLibre

- [x] Rama de trabajo (`claude/maplibre-fase-0-fc5six`, no `feat/maplibre`)
- [x] `npm i maplibre-gl @mapbox/mapbox-gl-draw` — maplibre-gl 6.4.1,
      mapbox-gl-draw 1.5.1. El de dibujo queda instalado sin usar hasta la Fase 3.
- [x] Nuevo `MapComponentGL.jsx` en paralelo al actual — **no borres el viejo
      todavía**, se compara lado a lado. Se llega por la ruta `/gl`.
- [x] Estilo base: teselas OSM raster para empezar (simple), vectorial después.
      En `utils/mapStyles.js`, como dato puro y con tests.
- [x] Portar `useMapInitialization` → `useMapInitializationGL`
- [x] Verificar: zoom, pan, escala, coordenadas del cursor — comprobado en
      Chromium con Playwright, ver notas de sesión.

## Fase 2 — Capas ANM

- [x] Portar `useMapLayers` → `useMapLayersGL`
- [x] Decidir por capa: **las cuatro van como GeoJSON** con filtro por bbox del
      viewport. Raster habría sido más rápido, pero se pierden el clic, las
      etiquetas y el slider de opacidad; sería un retroceso frente a Leaflet.
      Se pide `f=json` (formato Esri) y se convierte con `arcgisToGeoJSON`, no
      `f=geojson` — ver notas de sesión.
- [x] Etiquetas — con marcadores HTML, **no** con `symbol` layers. Ver notas de
      sesión: `symbol` exige servir archivos de glifos. La lógica de qué texto
      mostrar y dónde anclarlo se conserva intacta desde `mapUtils`.
- [x] Verificar que `findTenureLayerNumbers()` sigue funcionando sin cambios —
      se usa tal cual, sin tocar una línea.

## Fase 3 — Dibujo y exportación

- [x] Portar `useDrawControl` a `mapbox-gl-draw`
- [x] Portar `useExpedientSearch` — **el plan lo daba por intacto y no lo era**:
      está atado a Leaflet (`L.geoJSON`, `fitBounds`). Y como «Exportar» exporta
      el resultado de la búsqueda y no lo dibujado, sin portarlo no habría nada
      que exportar en `/gl`.
- [x] Confirmar que `exportUtils.js` recibe el mismo GeoJSON que antes — sí, sin
      tocar una línea. Verificado descargando el KML y el ZIP de verdad.
- [x] Correr los tests de exportación sin modificarlos — pasan tal cual.
- [x] Medición de áreas y distancias en CTM-12, con su propio módulo y tests.

## Fase 4 — Terreno 3D

- [x] Source de elevación con los terrain tiles públicos de AWS Open Data
      (codificación `terrarium`, sin API key ni autenticación)
- [x] `map.setTerrain({ source: 'terrain', exaggeration: 1.5 })`
- [x] Botón toggle 2D/3D + slider de exageración vertical (0.5 – 3)
- [x] Capa `hillshade` para que el relieve se lea también en vista cenital.
      Botón «Relieve» aparte, porque leer la topografía en plano es lo más común.
- [x] `sky` layer para que el horizonte no se vea cortado en pitch alto

## Fase 5 — Descarga por bbox (la función diferenciadora)

- [ ] Dado el rectángulo dibujado, consultar cada capa activa con
      `geometry` + `geometryType=esriGeometryEnvelope` + `f=geojson`
- [ ] Recortar DEM al bbox (evaluar: OpenTopography API vs lectura por ventana
      de COGs de Copernicus GLO-30 — la segunda no tiene cuota)
- [ ] Empaquetar todo con `jszip`, incluyendo un `README.txt` generado con:
      fuente de cada capa, URL del servicio, fecha de consulta, CRS, y nota
      sobre alturas elipsoidales del DEM
- [ ] La trazabilidad de ese README es lo que separa esto de un juguete

## Fase 6 — Nuevas entidades

Recién aquí, con la arquitectura estable. Para cada entidad: probar CORS
primero; si bloquea, API route de Next como proxy con caché.

Orden sugerido por utilidad:

- [ ] IGAC / Colombia en Mapas — cartografía básica, catastro, ortoimágenes.
      Ojo: tienen DEMs LiDAR de 1 m, 2 m y 10 m para algunos municipios. Ese es
      el dato realmente valioso y casi nadie sabe que existe.
- [ ] SGC — planchas geológicas, SIMMA (movimientos en masa), amenaza sísmica
- [ ] IDEAM — estaciones, coberturas Corine, zonificación hidrográfica
- [ ] RUNAP / Parques — áreas protegidas
- [ ] ANT / MinInterior — resguardos, consejos comunitarios
- [ ] ANLA — licencias ambientales
- [ ] DANE — MGN, DIVIPOLA

## Fase 7 — Cierre

- [ ] Borrar `MapComponent.jsx` (Leaflet) y desinstalar `leaflet`,
      `react-leaflet`, `leaflet-draw`, `esri-leaflet`, `leaflet.wms`
- [ ] Merge a `main`

---

## Notas de sesión

_(Anota aquí lo que descubras: qué entidades bloquean CORS, qué índices de capa
cambiaron, decisiones que tomaste y por qué.)_

### Fase 0 — 2026-08-20

- **Por qué la carpeta `@/` era una bomba de tiempo:** el `tsconfig` dice que
  `@/algo` significa "busca `algo` a partir de la raíz del proyecto". Los
  imports de shadcn (`@/components/ui/button`) ya funcionaban así, porque
  `components/` sí está en la raíz. Pero `utils.ts` vivía dentro de una carpeta
  llamada literalmente `@`, es decir la ruta era `@/lib/utils.ts` en disco. En
  Linux/macOS eso resuelve por casualidad; en otro entorno (o con otro
  resolvedor) se rompe. Ahora el archivo está en `lib/utils.ts`, que es donde
  el alias lo esperaba desde el principio. Ningún import tuvo que cambiar.
- **`.next` seguía versionado** (33 archivos de caché de webpack). Se sacó del
  índice con `git rm --cached`; los archivos siguen en disco, solo dejan de
  viajar al repo. El historial antiguo aún los contiene, así que el `.git`
  pesado no se arregla con esto — habría que reescribir historia, y no vale la
  pena por ahora.
- **`CLAUDE.md` y este plan no estaban en el repo**, solo en la máquina local.
  Se agregaron para que cualquier sesión futura los encuentre.
- Se dejó `test_perf.js`, `benchmark.js`, `verify.py` y `.Jules/` como están:
  son ruido, pero borrarlos no es parte de la Fase 0 y no estorban a la
  migración.

### Fase 1 — 2026-08-20

**Cómo comparar.** `npm run dev` y se abren dos pestañas: `/` es el visor
Leaflet de siempre, `/gl` es el nuevo sobre MapLibre. El panel lateral es el
mismo en las dos; lo único que cambia es el motor del mapa. `components.jsx`
recibe ahora una prop `engine` y carga uno u otro con `dynamic`, así que la
página que no se visita ni siquiera descarga el motor que no usa.

**Decisiones y trampas encontradas:**

1. **maplibre-gl 6 no tiene exportación por defecto.** `import maplibregl from
   "maplibre-gl"` compila sin una sola queja y devuelve `undefined`; el error
   solo salta al construir el mapa. Hay que importar por nombre:
   `import { Map as MapLibreMap } from "maplibre-gl"`. Casi todos los tutoriales
   que hay en internet son de la versión 3 o 4 y usan la forma vieja.

2. **El CSS de MapLibre pisa a Tailwind y el mapa colapsaba a 0 px de alto.**
   Al construir el mapa, MapLibre le añade al contenedor la clase
   `.maplibregl-map`, cuyo CSS declara `position: relative`. Esa regla y la
   clase `absolute` de Tailwind tienen la misma especificidad, así que gana la
   que se cargue de último — la de MapLibre. Con el contenedor en `relative`,
   `inset-0` deja de dimensionar nada y el div queda sin altura. Se arregla
   poniendo también `h-full w-full`, que funciona gane quien gane. Leaflet no
   sufría esto porque su CSS no toca `position` en el contenedor. Costó un rato
   porque el síntoma era raro: el mapa aparecía, pero recortado a una franja.

3. **Alternar mapa/satélite NO se hace con `setStyle()`.** `setStyle` reemplaza
   el estilo entero, y con él se irían las capas de la ANM, lo dibujado por el
   usuario y el resultado de la búsqueda. En vez de eso, las dos capas base se
   declaran desde el arranque y el botón solo cambia su `visibility`. Como la
   capa oculta no se pinta, tampoco pide teselas: no cuesta nada tenerla ahí.
   Esto hay que respetarlo al agregar capas en la Fase 2.

4. **El bug del mapa en gris de Leaflet desaparece solo.** En Leaflet había que
   poner `maxNativeZoom: 19` a mano o la capa dejaba de pedir teselas al pasarse
   de zoom. En MapLibre eso se declara en la fuente (`maxzoom: 19`) y el motor
   estira la última tesela real. Un problema menos.

5. **Coordenadas del cursor:** se agregaron abajo a la derecha (no existían en
   el visor Leaflet). Van en su propio componente porque el ratón dispara
   eventos decenas de veces por segundo y así solo se repinta ese recuadro. Se
   usa `lngLat.wrap()`; sin eso, arrastrar dando la vuelta al mundo muestra
   longitudes como -434°.

6. **El satélite sigue siendo el de Google**, heredado tal cual para que la
   comparación sea justa. Pendiente de decidir: ese uso de las teselas de Google
   está fuera de sus condiciones de servicio. Cuando toque el terreno 3D
   conviene evaluar Esri World Imagery, que sí publica condiciones de uso.

**Qué se verificó y cómo.** Con Chromium y Playwright, sobre `/gl`:
lienzo de 1280×800; zoom con la rueda (la barra de escala pasó de 200 km a
100 km); arrastre (la coordenada bajo el mismo punto de la pantalla cambió de
4°N 72°O a 2,13°N 68,26°O); control de zoom y brújula; barra de escala;
atribución; recuadro de coordenadas del cursor. El botón de satélite se
comprobó por red, no por la etiqueta: en modo mapa se pidieron 108 teselas de
OSM y 0 de Google, y tras pulsarlo, 0 de OSM y 35 de Google. Cero errores de
JavaScript. También se comprobó que `/` sigue funcionando y que ahí no se carga
MapLibre.

**Limitación del entorno:** el proxy de la sesión no deja salir a
`tile.openstreetmap.org` ni a los servidores de Google, así que las teselas
reales no se pudieron ver. Se sirvieron teselas sintéticas para confirmar que
MapLibre las pinta. **Falta mirar el mapa con teselas de verdad en tu máquina**
(`npm run dev` y abrir `/gl`).

**Lo que todavía no hace `/gl`:** capas de la ANM, búsqueda por expediente,
dibujo, medición, GPS y brújula. Los métodos que el panel lateral llama sobre el
mapa (`clearDrawings`, `clearSearchResult`, `addVertices`, `removeVertices`)
existen como funciones vacías para que el botón «Borrar» no reviente; las
fases 2 y 3 los llenan.

### Fase 2 — 2026-08-20

**Lo gordo de esta fase no fue portar las capas, fue un fallo silencioso de
MapLibre bajo Next.** Vale la pena leerlo entero porque volverá a aparecer en
cualquier cosa que use fuentes GeoJSON: el dibujo (Fase 3), los resultados de
búsqueda y el terreno (Fase 4).

1. **El worker de MapLibre no arrancaba, y sin él las capas nunca se dibujan.**
   MapLibre le pasa a un *web worker* (un hilo aparte del navegador) el trabajo
   de convertir el GeoJSON en teselas. Para encontrar el archivo de ese worker
   usa `import.meta.url`, dando por hecho que el paquete se sirve tal cual está
   en disco. Webpack —el empaquetador que usa Next— reescribe ese valor, la
   búsqueda falla y el worker no arranca.

   El síntoma fue de los peores posibles: **ni un error en consola**. El mapa
   base se veía perfecto (las teselas raster no pasan por el worker), las
   consultas a la ANM salían y volvían bien, los datos llegaban completos a la
   fuente, y hasta las etiquetas aparecían en su sitio. Solo faltaban los
   polígonos. Se localizó comparando qué sí y qué no funcionaba: todo lo que
   pasa por el worker estaba muerto, todo lo demás vivo.

   **Solución:** `scripts/copy-maplibre-worker.mjs` copia el worker a `public/`
   antes de cada `npm run dev` y cada `npm run build`, y el visor le indica la
   dirección con `setWorkerUrl()`. Se copian dos archivos porque el worker
   importa `maplibre-gl-shared.mjs` por ruta relativa. No se versionan, para que
   no queden desfasados respecto a la versión instalada.

   **Corolario:** nunca esperes a los eventos `load` ni a `isStyleLoaded()` de
   MapLibre. Ambos exigen que *todas* las fuentes terminen de cargar; con una
   sola fuente lenta o caída no llegan nunca. El visor usa `styledata`, que solo
   depende del estilo. Esto ya se corrigió también en el arranque de la Fase 1.

2. **Se pide `f=json`, no `f=geojson`.** El plan sugería GeoJSON nativo, que
   existe en ArcGIS Server desde 10.4 y sería más directo. Pero no hay forma de
   saber qué versión corre la ANM, y desde esta sesión no se alcanza el servicio
   para probarlo. `f=json` es lo que usa esri-leaflet, es decir lo único que se
   sabe que funciona hoy contra estos servidores. La conversión la hace
   `@esri/arcgis-to-geojson-utils`, la utilidad oficial de Esri que esri-leaflet
   usa por dentro; resuelve la parte espinosa, que es que Esri mete todos los
   anillos de un multipolígono en una lista plana y distingue contornos de
   huecos por el sentido de giro. **Si algún día compruebas que el servicio
   responde a `f=geojson`, esto se puede simplificar.**

3. **Las cuatro capas van como GeoJSON, ninguna como raster.** Raster sería más
   rápido, pero se pierden el clic para ver la ficha, las etiquetas y el slider
   de opacidad. Sería un retroceso frente al visor Leaflet.

4. **Etiquetas con marcadores HTML, no con `symbol` layers.** Para dibujar texto
   MapLibre no usa las fuentes del sistema, sino archivos de glifos precocinados
   (`.pbf`) que hay que servir desde algún sitio. Las opciones eran depender de
   un servidor público ajeno o montar un proceso de generación de fuentes, y
   ninguna merecía frenar la fase. Con marcadores HTML el resultado es idéntico
   al del visor Leaflet y se reutiliza el CSS que ya existía. Lo que se pierde:
   `symbol` esconde solo las etiquetas que se pisan entre sí. Leaflet tampoco lo
   hacía, así que no es un retroceso, pero es la mejora pendiente si algún día
   las etiquetas se ven amontonadas.

5. **Aviso nuevo que no existía en Leaflet:** cuando ArcGIS recorta la respuesta
   (devuelve solo las primeras N features y se calla), ahora sale un aviso. Sin
   él el usuario creería estar viendo todos los títulos del área y podría sacar
   conclusiones sobre una zona a partir de datos incompletos.

6. **Las capas se declaran vacías en el estilo desde el arranque**, igual que
   las capas base, y el hook solo les cambia visibilidad, opacidad y datos. Así
   el orden de apilamiento no depende de en qué orden pulse el usuario los
   interruptores. Cada capa son dos entradas, `fill` y `line`: MapLibre no tiene
   un "polígono con borde" como Leaflet, y esa separación es justo lo que
   permite que el slider afecte solo al relleno.

7. **`__mapa` en la consola del navegador.** En desarrollo el visor deja la
   instancia del mapa en `window.__mapa`, para poder preguntarle cosas
   (`__mapa.getZoom()`, `__mapa.getStyle()`) sin instrumentar el código. En la
   versión publicada no existe: se comprobó contra una compilación de producción.

**Qué se verificó.** 30 comprobaciones automatizadas en Chromium contra un
simulacro del servicio ArcGIS, más los tests unitarios. Entre ellas: que no se
consulta nada con las capas apagadas; que por debajo de z10 avisa en vez de
consultar; que los índices de capa se descubren en runtime (el simulacro los
publica en 2 y 5, no en 3 y 4, justamente para que algo fijo se caiga); que la
consulta lleva el recuadro visible como envelope; que los polígonos se teselan y
se pintan; que el clic abre la ficha con los atributos; que las etiquetas
aparecen a partir de z15 y desaparecen con su capa; que el slider cambia la
opacidad sin volver a consultar; que las cuatro capas conviven. Y lo mismo sobre
una compilación de producción.

### Datos reales de la ANM — 2026-08-20

Fabio abrió los servicios desde su máquina y pegó respuestas reales. De ahí
salieron dos cosas.

**1. Los tres servicios sí responden a `f=geojson`.** Aun así **se decidió no
cambiar** y seguir pidiendo `f=json` con conversión propia. Motivo: con
`f=geojson` es el servidor de la ANM quien traduce las geometrías, y ahí está
justo la trampa 4 de `CLAUDE.md` —polígonos con huecos y multiparte—. Las
muestras obtenidas eran todas de un solo anillo, así que no prueban nada sobre
huecos. Cambiar quién traduce, en el punto exacto donde el proyecto ya tuvo un
bug, a cambio de quitar una dependencia, no compensa. Queda como posible
simplificación futura: `scripts/probar-geojson.mjs` repite la comprobación, y si
alguna vez se verifica el caso de los huecos, basta cambiar `f: "json"` por
`f: "geojson"` en `anmLayers.js` y dejar de llamar a `arcgisResponseToGeoJSON`.

Confirmado de paso: los servicios sí mandan `exceededTransferLimit`, así que el
aviso de respuesta recortada funciona con el servicio real y no solo con el
simulacro.

**2. Cada capa bautiza sus campos a su manera, y la ficha emergente lo ignoraba.**
La capa de Subcontratos no trae `TITULO_ESTADO` ni `SOLICITANTES_O_TITULARES`
sino `ESTADO` y `NOMBRE_DE_TITULAR`; tampoco `PAR`, sino `GRUPO_DE_TRABAJO`. La
ficha mostraba 10 de 13 filas en "N/A", tres de ellas teniendo el dato al lado
con otro nombre —incluido el nombre del titular—. Era un fallo previo a la
migración: la ficha es código compartido, así que el visor Leaflet lo tiene
igual. Arreglado con respaldos en `createPopupContent`, con los nombres
comprobados contra respuestas reales y tests que usan esas mismas muestras.

`FECHA_DE_INSCRIPCION` **no** se usa como respaldo de `FECHA_DE_SOLICITUD`
aunque tentara: inscribir y solicitar son actos distintos, y etiquetar mal una
fecha en un expediente minero es peor que no mostrarla. Va en su propia fila, y
solo cuando existe.

Pendiente decidido pero no hecho: las capas de Subcontratos y de tenencia traen
`DEPARTAMENTOS` y `MUNICIPIOS`, que hoy no se muestran en ningún lado. Se dejó
fuera a propósito; es decisión de producto, no de código.

**3. Un bug de las fichas que solo salió al probar dos clics seguidos.** Los
popups de MapLibre se cierran solos al siguiente clic en el mapa, y ese cierre
ocurría *después* de que el manejador pusiera el contenido nuevo: al hacer clic
en un segundo polígono la ficha desaparecía en lugar de cambiar. Ahora hay un
único manejador de clic para todo el mapa, con `closeOnClick: false`, y el
cierre lo decide el código: si el clic no cae sobre ninguna capa de la ANM,
cierra; si cae, reemplaza el contenido.

### Fase 4 — 2026-08-20

**Dos funciones que comparten el mismo dato de elevación pero responden a
necesidades distintas:**

- **Relieve** (botón propio): sombrea las laderas sobre el mapa plano. Es lo que
  más se usa: leer la topografía sin inclinar nada. Se apoya en una capa
  `hillshade`.
- **3D** (botón propio): inclina la cámara a 60°, levanta el terreno con
  `setTerrain` y pone un `sky` para que el horizonte no quede cortado en seco.
  Encender el 3D enciende también el relieve —inclinado y sin sombras, un cerro y
  un valle se confunden—; volver a 2D deja el relieve puesto, porque sigue siendo
  útil y apagarlo de golpe se siente como perder información.

**La elevación sale de las Terrain Tiles de AWS Open Data**: públicas, sin clave
ni cuenta ni cuota. Por eso frente a Mapbox o Maptiler, que exigen registro.
`encoding: "terrarium"` es obligatorio y no da error si se equivoca: con la
fórmula de decodificación de otro proveedor sale un relieve inventado, montañas
donde no las hay. La fuente y la capa se declaran en el estilo desde el arranque,
apagadas; mientras el relieve esté oculto no se descarga ni una tesela.

**La trampa gorda de esta fase, y la que más importa para la Fase 5:**
`queryTerrainElevation` de MapLibre **no devuelve la altura del dato, sino la
altura ya multiplicada por la exageración vertical.** Con el slider en 3×, un
cerro de 1.880 m se reporta como 5.639 m. Nada avisa. Por eso el hook expone
`elevationAt`, que divide por la exageración y devuelve metros de verdad.
**Cualquier lectura de altura —el recorte de DEM de la Fase 5, un rótulo de cota,
un perfil— tiene que pasar por ahí, nunca por queryTerrainElevation directo.** Y
recordar, ya está en CLAUDE.md: estas alturas son elipsoidales; para cotas
ortométricas hay que aplicar geoide (se anotará en el README de las descargas).

El slider de exageración lleva un aviso al pie —"solo afecta a cómo se ve, no
cambia ninguna altura ni ningún área"— porque en un visor minero un número mal
entendido tiene consecuencias.

**Un fallo latente que la Fase 4 destapó en el dibujo:** `measurementOf` para un
punto destructuraba `[lon, lat]` de sus coordenadas y se las pasaba a
`formatDegrees`. El evento `draw.render` se dispara también mientras el punto
sigue al cursor antes del clic, con las coordenadas todavía incompletas, y ahí
`formatDegrees(undefined)` reventaba. Aparecía o no según cuándo cayera el
render, por eso pasó la Fase 3. Corregido con una guarda; el punto simplemente no
muestra medida hasta que existe de verdad.

**Verificación:** 21 comprobaciones en Chromium con teselas de elevación
sintéticas (el proxy no alcanza AWS). Entre ellas: que arranca en 2D sin
descargar elevación; que el relieve la descarga solo al encenderse y no inclina
la cámara; que el 3D levanta el terreno, inclina y pone cielo; **que la
codificación terrarium decodifica bien** (una loma sintética de altura conocida
se lee correcta a través de `elevationAt`); **que queryTerrainElevation sí viene
escalada** (2.820 = 1.880 × 1,5) mientras el helper devuelve la real; que el
slider cambia la exageración sin tocar la altura del dato; y que volver a 2D
endereza la cámara y deja el relieve puesto. Las 30 de la Fase 2 y las 24 de la
Fase 3 siguen verdes, 121 tests unitarios.

**Limitación:** como en las fases anteriores, no se pudo ver el terreno con datos
reales de AWS. **Falta abrir `/gl` en tu máquina sobre una zona montañosa
—Medellín, la cordillera— encender Relieve y luego 3D, y confirmar que el
relieve se ve.** Con el gradiente sintético de las pruebas se ve suave; sobre las
montañas de verdad debería leerse con claridad.

### Fase 3 — 2026-08-20

**Corrección al propio plan:** la tabla de "qué sobrevive sin tocarse" daba
`useExpedientSearch` por intacto, y no lo era: usa `L.geoJSON`, `fitBounds` y
capas de Leaflet. Además había que portarlo sí o sí en esta fase, porque el
botón «Exportar» exporta el resultado de la búsqueda, no lo dibujado: sin
búsqueda no hay nada que exportar.

**Dos barras se convirtieron en una.** El visor Leaflet tenía una barra para
dibujar y, aparte, dos botones de "medir distancia" y "medir área" que en
realidad también dibujaban. Eran dos juegos de herramientas para lo mismo. Ahora
toda figura muestra su medida al cerrarla: un polígono su área, una línea su
longitud, un punto sus coordenadas. Nunca se muestra menos que antes. Y la
medida se recalcula al mover un vértice, cosa que el visor anterior no hacía:
allá el globo se quedaba con el valor del momento en que se cerró la figura.

**Las áreas se calculan en CTM-12 (EPSG:9377), no sobre la esfera.** Es lo que
dice CLAUDE.md y tiene razón de ser: la tabla de coordenadas y la exportación a
SHP ya usan ese sistema, así que calcular el área de otra forma daría números
que no cuadran entre sí ni con los de la ANM. El matiz, por si algún día
importa: una fórmula geodésica sería algo más exacta en términos absolutos, pero
aquí vale más coincidir con la cifra oficial. Módulo aparte (`utils/measure.js`)
con 12 tests contra cuadrados de tamaño conocido, incluidos los casos de huecos
y de anillos con el giro invertido.

**Tres trampas de mapbox-gl-draw, las tres silenciosas:**

1. **No se puede tocar el estado del control dentro de su propio manejador de
   `draw.create`.** Al volver a modo selección ahí mismo, la librería quedaba a
   medio camino: seguía creyendo que dibujaba la figura anterior, así que cada
   figura nueva **reemplazaba** a la de antes en vez de sumarse, y los botones
   de línea y punto acababan dibujando polígonos. Se arregla aplazándolo un
   turno con `setTimeout(..., 0)`.

2. **El color se guardaba pero no se veía.** mapbox-gl-draw mantiene dos copias
   de cada figura: la del usuario y otra interna, que es la que se pinta. Las
   propiedades propias solo se copian a la segunda si se activa
   `userProperties: true`. Sin eso, el estilo buscaba `user_color`, no
   encontraba nada y todo salía del color por defecto. **Este no aparecía en los
   datos** —ahí el color estaba bien guardado, y una comprobación automática lo
   daba por bueno—; se descubrió mirando una captura de pantalla. De ahí que
   ahora haya una comprobación del color *tal como se pinta*, no solo del dato.

3. **Su CSS está escrito para las clases de Mapbox** (`.mapboxgl-map`), que en
   MapLibre se llaman distinto. Por eso el visor no usa su barra de botones
   —saldría sin estilo— sino botones propios, y hay unas reglas de CSS para que
   el cursor cambie en modo dibujo.

**Y una trampa del compilador:** dentro del bloque de CSS del componente no
pueden ir comillas invertidas, ni siquiera en un comentario. Ese CSS vive en una
plantilla de texto delimitada por ese mismo carácter, así que una sola la cierra
antes de tiempo. El compilador falla sin decir dónde ni por qué.

**Qué se verificó:** 24 comprobaciones en navegador. Dibujo de polígono, línea y
punto con sus medidas; el área contrastada contra la del rectángulo realmente
dibujado en pantalla (±1 %); el color por figura, guardado y pintado; la
papelera; la búsqueda por expediente con sus vértices y su etiqueta; la tabla de
coordenadas; **la descarga real del KML y del ZIP de shapefile**, con el
contenido del KML inspeccionado; y el botón «Borrar». Más las 30 de la Fase 2 sin
regresiones y 117 tests unitarios.

**Limitación, la misma de la Fase 1:** el proxy de la sesión no deja salir a los
servidores de la ANM, así que todo esto se probó contra un simulacro que imita
la forma de las respuestas de ArcGIS. **Falta abrir `/gl` en tu máquina, encender
las cuatro capas sobre una zona con títulos y confirmar que se ven igual que
en `/`.** Es lo único que puede confirmar que el servicio real responde como se
supone.
