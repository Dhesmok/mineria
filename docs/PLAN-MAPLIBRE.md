# Plan: migración a MapLibre + terreno 3D

Documento de trabajo. Marca las casillas a medida que avances y actualiza el
estado al final de cada sesión, para que la siguiente sesión sepa dónde quedó.

**Estado:** migración terminada (fases 0–7) y en `main`; Leaflet ya no existe.
Hechos también los ajustes de uso (Fase 8), el panel por áreas (Fase 9) y los de
lectura (Fase 10). Pendiente: recorte de DEM (Fase 5, fuente ya decidida), las
entidades nuevas (Fase 6, faltan sus direcciones) y filtrar por departamento y
municipio (Fase 8, falta sondear qué campos traen los servicios).
**Última actualización:** 2026-08-21

---

## Por qué migrar

Leaflet es 2D por diseño. No existe plugin que le agregue terreno real. Como el
toggle 2D→3D es una de las tres funciones centrales de la visión del proyecto,
el motor de mapa tiene que cambiar. Hacerlo ahora es barato; hacerlo después de
agregar diez capas más, no.

MapLibre GL JS además trae: renderizado vectorial por GPU (mucho más rápido con
polígonos de títulos mineros), estilo declarativo, y `setTerrain()` nativo.

## Qué sobrevive sin tocarse

Esto era el argumento de que la migración era abordable. **Cerrado en la Fase 7:**
la columna de estado ya no es un pronóstico, es lo que pasó.

| Módulo | Estado final |
|---|---|
| `utils/arcgis.js` | Intacto — es `fetch` puro |
| `utils/tenureLayers.js` | Intacto |
| `utils/exportUtils.js` | Intacto |
| `utils/mapUtils.js` | Intacto, y creció: se le mudaron `shouldShowLabels` y los respaldos de la ficha |
| `components/ui/*` | Intacto |
| `utils/mapLabels.js` | → `mapLabelsGL.js`. **Borrado** |
| `utils/drawOptions.js` | → `drawStyles.js`. **Borrado** |
| `hooks/useExpedientSearch.js` | → `useExpedientSearchGL.js`. **Borrado** (la tabla original se equivocaba al darlo por intacto: usaba `L.geoJSON` y `fitBounds`) |
| `hooks/useMapLayers.js` | → `useMapLayersGL.js`. **Borrado** |
| `hooks/useDrawControl.js` | → `useDrawControlGL.js` (mapbox-gl-draw). **Borrado** |
| `hooks/useMapInitialization.js` | → `useMapInitializationGL.js`. **Borrado** |
| `hooks/useGeolocation.js` | → `useGeolocationGL.js` (GPS + brújula). **Borrado** |
| `MapComponent.jsx` | → `MapComponentGL.jsx`. **Borrado** |

Nuevos, sin equivalente en el visor viejo: `utils/mapStyles.js`,
`utils/anmLayers.js`, `utils/measure.js`, `utils/bboxDownload.js`,
`hooks/map/useTerrainGL.js`, `hooks/map/useAreaDownloadGL.js`.

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

- [x] Dado el polígono dibujado, consultar cada capa activa por su envolvente
      (`geometryType=esriGeometryEnvelope`). Se reusa `fetchLayerFeatures` de la
      Fase 2, así que la salida es GeoJSON aunque el cable vaya en `f=json`.
- [~] Recortar DEM al bbox — pendiente de implementar, **pero la fuente ya está
      decidida: Copernicus GLO-30.** Fabio puso la condición de que fuera
      gratuita para mucha gente, y eso descarta OpenTopography, que es gratis
      pero exige una clave por usuario y tiene cuota diaria: en cuanto el visor
      lo use más de un puñado de personas, la cuota se agota y las descargas
      empiezan a fallar sin que el usuario entienda por qué. GLO-30 son COGs
      públicos en S3 (registro de datos abiertos de AWS), sin clave, sin cuota y
      con licencia que permite redistribuir; 30 m de resolución en todo el país.
      El README ya reserva su sección y advierte de las alturas elipsoidales.
- [x] Empaquetar todo con `jszip`: README.txt + el polígono dibujado
      (`area.geojson`) + un `.geojson` y un `.kml` por capa. El README lleva
      fuente, URL del servicio, fecha de consulta, número de registros, aviso de
      recorte, los dos CRS y la nota del DEM elipsoidal.
- [x] La trazabilidad de ese README es lo que separa esto de un juguete.

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

- [x] Borrar `MapComponent.jsx` (Leaflet) y desinstalar `leaflet`,
      `react-leaflet`, `leaflet-draw`, `esri-leaflet`, `leaflet.wms`
- [x] Borrar los seis hooks y los dos módulos de utilidades que dependían de Leaflet
- [x] Borrar la ruta `/gl`: el visor MapLibre pasa a servirse en `/`
- [x] Portar los tests de regresión que vivían en los módulos borrados
- [x] Merge a `main`

## Fase 8 — Ajustes de uso

Once observaciones de Fabio tras usar el visor con datos reales. No son fases del
plan original: son lo que se ve cuando alguien de verdad trabaja con la
herramienta.

- [x] La herramienta de dibujo no se podía apagar. Ahora se apaga pulsándola otra
      vez o con Escape.
- [x] El botón de color estaba siempre a la vista y no se entendía sobre qué
      actuaba. Ahora la paleta sale dentro de la barra de dibujo, solo cuando hay
      algo que colorear, y dice si va a pintar lo que se dibuje o lo
      seleccionado.
- [x] Un punto marcado no se veía: la etiqueta con sus coordenadas iba centrada
      justo encima del círculo y lo tapaba entero.
- [x] Solo se podía marcar un punto por pulsación. La herramienta de punto ahora
      se queda encendida.
- [x] No se podía escribir una coordenada. Hay un campo en el panel que entiende
      decimales con punto o con coma, grados-minutos-segundos y metros en
      cualquiera de los diez sistemas.
- [x] Cambiar el sistema de coordenadas: de dos a diez, incluidos los orígenes
      antiguos donde están inscritos los títulos viejos.
- [x] La brújula del zoom es pequeña e incómoda para el 3D. Los botones de
      MapLibre pasan de 29 a 36 px y, sobre todo, hay deslizadores grandes de
      giro e inclinación con un botón de "norte arriba".
- [x] Aviso en el navegador de que se gira manteniendo Ctrl, solo la primera vez
      y solo con ratón.
- [x] La brújula 360° aparece solo con el GPS activo, y se puede agrandar o
      achicar.
- [x] La ficha de un polígono salía con un renglón en blanco entre cada dato.
- [x] Recuperar el botón de LinkedIn, que se perdió al reescribir el visor.
- [x] **Filtros** por estado, modalidad, etapa, clasificación y área mínima. Las
      opciones se leen de los datos cargados, no de una lista escrita a mano.
- [ ] Filtrar por **departamento y municipio**: esos campos no aparecen en
      ninguna respuesta observada. `scripts/probar-campos.mjs` los sondea desde
      una máquina con internet para decidir entre pedírselos al servicio o
      cruzar con el mapa municipal del DANE.

## Fase 10 — Ajustes de lectura

- [x] El sistema de coordenadas gobierna toda lectura de posición, no solo la
      tabla: la del cursor y las etiquetas de los puntos dibujados incluidas.
- [x] La lectura del cursor se va al centro abajo, donde no compite con nada.
- [x] Escribir una coordenada sale del panel y pasa al mapa, con la herramienta
      de punto: dos casillas y un botón «Ir», visibles solo con esa herramienta.
- [x] Giro en bucle, con play y stop en el mismo botón.
- [x] Separadores en la ficha del expediente.
- [x] Brújula legible: rótulos derechos, grados cada 45°, banda oscura para que
      se lean sobre el mapa claro, y la lectura del rumbo dentro de la rosa.
- [x] Los botones del mapa comparten tipografía, color y forma con el panel.

## Fase 13 — La auditoría, aplicada

Todo lo que salió de `docs/AUDITORIA.md`, hecho.

- [x] **Red de seguridad**: ESLint con `no-undef`, un límite de errores de React
      que evita la pantalla en blanco, y comprobaciones automáticas en cada
      pull request.
- [x] El filtro que llega al mapa es el del área de cada capa, no el de Minería
      para todas.
- [x] «Toda la capa» deja de rebarrer el país en cada arrastre del mapa.
- [x] El 3D avisa cuando el modelo de elevación no llega, y vuelve a 2D.
- [x] **3D más rápido**: las etiquetas se apartan mientras la cámara se mueve
      sobre terreno, entrar en 3D ya no enciende el relieve, y la inclinación
      máxima baja de 85° a 72°.
- [x] El visor recuerda las preferencias entre visitas.
- [x] Barra de dibujo nueva: dice qué mide cada herramienta y cuánto llevas.
- [x] `MapComponentGL` baja de 1.103 a menos de 800 líneas.
- [x] **Responsive**: el panel es una hoja inferior en el teléfono, los
      controles se quedan con el icono, y nada baja de 44 px en táctil.
- [x] **Exportar imagen**, sin controles, eligiendo qué entra y con pie
      automático de capas, sistema, fecha y fuentes.
- [x] **Derivados del modelo de elevación**: consulta puntual de cota, pendiente
      y orientación, y las dos capas de color con su leyenda y su aviso de
      precisión.
- [x] Fuera el último `alert()` y la segunda lista de sistemas de coordenadas.
- [ ] La curvatura queda fuera a propósito: con celdas de 30 m es sobre todo
      ruido, y un número que parece dato y no lo es hace más daño que no darlo.

## Fase 12 — Espacio, textos y etiquetas

- [x] Fuera el título «Títulos y Solicitudes»: el panel ya no es solo de la ANM.
      Ocultar y mostrar pasan a ser una pestaña pegada al costado del panel, un
      solo mando en un solo sitio.
- [x] Las explicaciones del alcance del filtro, en castellano llano.
- [x] «Borrar» deshace la búsqueda sin mover la vista. Antes volaba al centro
      del país y quien miraba el detalle de una vereda perdía su sitio.
- [x] El aviso de «Ctrl + arrastrar» al entrar en 3D, en el lenguaje del resto
      de la interfaz.
- [x] El fondo de partida es el gris claro de CARTO, con nombres. Nombres y
      descripciones de los cinco fondos reescritos.
- [x] El botón «Mapa base» baja hasta encima de la firma: se toca una vez.
- [x] **Las etiquetas ya no dependen de un umbral de zoom.** Se etiqueta el
      polígono en el que la etiqueta cabe, y se descarta la que chocaría con
      otra ya puesta.

## Fase 11 — Tabla de resultados, mapas base y espacio en el panel

- [x] Tabla de atributos de los resultados del filtro, como la de un SIG de
      escritorio: se ordena por cualquier columna y **al pulsar una fila se
      cierra y el mapa vuela hasta ese polígono**.
- [x] Filtrar solo lo que hay en pantalla o toda la capa. Lo segundo le pregunta
      al servicio con una cláusula SQL, porque los que cumplen pueden estar a
      mil kilómetros de donde se está mirando.
- [x] El panel de ajustes del 3D se puede guardar en un botón, y tanto el panel
      como el botón se arrastran a donde estorben menos. El aviso de que la
      exageración no cambia ningún dato se fue al título de la etiqueta.
- [x] Las áreas del panel se pliegan y despliegan, una a la vez.
- [x] Cinco mapas base —Google, Esri World Imagery, OpenTopoMap, CARTO Positron
      y OpenStreetMap—. **Pulsar el que ya está puesto quita o pone sus
      nombres**, con un distintivo «Aa» que lo anuncia. El botón se llama ahora
      «Mapa base».
- [x] El sistema de coordenadas pasa de lista desplegable con su párrafo de
      ayuda a un botón de un renglón; la explicación de cada sistema vive dentro
      del selector, que es donde hace falta.
- [x] Dos botones en el encabezado de cada área, del color del área: filtrar y
      buscar. El buscador de expedientes sale del panel y vive detrás de la lupa
      de Minería, la única área donde tiene sentido.

## Fase 9 — Panel de capas por áreas

- [x] Agrupar las capas por área temática: Minería, Geología, Hidrocarburos,
      Catastro. Se diseñaron tres paneles y Fabio eligió la lista continua.
- [x] Cambiar el color de una capa desde el panel, con el contorno derivado.
- [x] Arrastrar en "Activas" para decidir qué capa tapa a cuál, en la lista y en
      el mapa.
- [ ] Conectar los servicios de SGC, ANH e IGAC. Las nueve capas ya están en el
      panel, deshabilitadas: falta la dirección pública de cada una, que Fabio
      está buscando. Añadir una es ponerle `url` en `utils/themeAreas.js` y
      quitarle `pending`.

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

### GPS y brújula — 2026-08-20 (sesión autónoma)

Portado `useGeolocation` → `useGeolocationGL`. **Con esto `/gl` hace ya todo lo
que hace el visor Leaflet**, que era el requisito para poder borrarlo en la Fase
7. No era una fase del plan, pero sin esto la Fase 7 no se puede hacer.

El marcador —el punto azul con su pulso, la rosa de los vientos de 250 px y la
aguja que gira con la orientación del celular— se conserva idéntico: mismo SVG,
mismo CSS. Lo único que cambió es el motor: `Marker` de MapLibre con un elemento
HTML en vez de `L.divIcon`, `setLngLat` en vez de `setLatLng` (con el eterno
cuidado del orden [lon, lat]), y `flyTo({center, zoom})` en vez de la firma de
Leaflet. La lectura de `deviceorientation` va igual, es API del navegador.

Verificado en Chromium con geolocalización simulada (Playwright puede conceder el
permiso y fijar una posición): 14 comprobaciones. El marcador aparece anclado
exactamente sobre la ubicación (a menos de 20 px de su proyección), el mapa vuela
a ella, la brújula agranda el marcador y la aguja gira al rumbo correcto al
simular un evento de orientación (alpha 90 → rumbo 270), y apagar cada cosa
limpia lo suyo. Las fases 2–5 siguen verdes.

Con esto la única deuda de paridad con Leaflet que queda es ninguna: lo pendiente
son cosas nuevas (el DEM de la Fase 5 y las entidades de la Fase 6), no cosas que
el visor viejo tuviera y el nuevo no.

### Fase 5 — 2026-08-20 (sesión autónoma)

Hecha de madrugada con autorización previa de Fabio para seguir con todas las
fases. **La descarga por área ya funciona: dibujas un polígono, enciendes las
capas que quieras y sale un ZIP con los archivos de esa área.** Es la ventaja
competitiva del proyecto —"dibuja un cuadro y sal con los archivos"— y ya está
en pie.

**Qué trae el ZIP:** un `.geojson` y un `.kml` por cada capa encendida (lo que
cae dentro de la envolvente del polígono), el propio polígono como
`area.geojson`, y un `README.txt` con la trazabilidad completa: fuente de cada
capa, URL exacta del servicio, fecha y hora de consulta en UTC, número de
registros, aviso si el servicio recortó la respuesta, los dos CRS del proyecto
(4686 para geometrías, 9377 para cálculos) y la advertencia de que las alturas
de un DEM son elipsoidales. Ese README es lo que vuelve la descarga un insumo
para un informe y no un archivo suelto sin procedencia.

**Reutiliza todo lo de antes:** las consultas van por `fetchLayerFeatures` (Fase
2), así que heredan el manejo de los errores HTTP-200 de ArcGIS, la detección de
recorte y el descubrimiento de índices en runtime. El KML sale de `buildKml`
(intacto desde antes de la migración). Nada de esto se reescribió.

**El DEM recortado NO se hizo, y es una decisión, no un olvido.** El plan mismo
deja la fuente del DEM "por evaluar" (OpenTopography, con cuota y clave, frente a
los COG de Copernicus GLO-30, sin cuota pero con más trabajo de implementación).
Esa elección es de Fabio, no mía, y además desde el entorno de desarrollo no se
alcanza ninguna de las dos para probar que funcione. Meter código sin poder
verificarlo y decidiendo por él una cosa que dejó abierta habría sido justo lo
contrario de lo prudente. En su lugar: el pipeline de empaquetado está armado
para que añadir el DEM sea enchufar una función más (una que devuelva el archivo
del DEM recortado), el README ya tiene su sección diciendo que está pendiente, y
la advertencia de alturas elipsoidales ya está escrita. Cuando Fabio decida la
fuente, es un añadido acotado.

**Detalle de UI que salió al verificar:** el botón "Descargar área" estaba al
principio pegado bajo la barra de dibujo y se solapaba con el botón de la
papelera —un clic en "Borrar" caía sobre el de descarga—. Lo delató la Fase 3 al
reventar con un timeout de Playwright, no un fallo de lógica. Se movió a la
columna de acciones de abajo a la izquierda (con Satélite/Relieve/3D), que es su
sitio permanente; el banner de fase de arriba es temporal y no había que diseñar
alrededor de él.

**Verificación:** 16 comprobaciones en Chromium, **descargando el ZIP de verdad
y abriéndolo** para revisar su contenido: que trae README + área + un archivo por
capa en los dos formatos, que el README nombra cada servicio con su fecha y sus
CRS y la nota del DEM, y que el GeoJSON descargado tiene polígonos reales con los
atributos de la ANM. Que sin área dibujada el botón no aparece, y que sin capas
encendidas avisa en vez de generar un ZIP vacío. Las fases 2, 3 y 4 siguen
verdes (30, 24 y 21). 140 tests unitarios (19 nuevos, de `bboxDownload`).

**Pendiente que arrastro desde la Fase 3 y sigo sin cerrar:** el GPS y la brújula
360° (`useGeolocation`) no están portados a MapLibre. No son ninguna fase del
plan, pero hacen falta antes de borrar el visor Leaflet en la Fase 7.

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

### Fase 7 — 2026-08-20

**Leaflet ya no está en el proyecto.** Se borró después —no antes— de que Fabio
probara el visor MapLibre contra los servicios reales de la ANM y confirmara
que funciona. Ese orden importa: mientras el visor viejo siguiera montado había
a dónde volver, y borrarlo antes de la prueba con datos reales habría sido
quemar el bote sin haber tocado tierra.

**Qué se borró** (11 archivos): `MapComponent.jsx`, la ruta `app/gl/page.js`,
los seis hooks de `hooks/map/` que dependían de Leaflet —incluido el archivo de
tests de `useExpedientSearch`—, y `utils/drawOptions.js`, `utils/mapLabels.js`
con su test. Y del `package.json` salieron cinco dependencias: `leaflet`,
`react-leaflet`, `leaflet-draw`, `esri-leaflet` y `leaflet.wms`. npm se llevó
26 paquetes en total contando lo que arrastraban.

**El visor MapLibre pasó a `/`.** Durante la migración vivía en `/gl` para poder
comparar los dos lado a lado; ya no hay con qué comparar, así que `components.jsx`
quedó con un solo import dinámico y sin la propiedad `engine` que elegía motor.
También se quitó el aviso ámbar de "versión en pruebas".

**Los tests que vivían en los módulos borrados se portaron, no se perdieron.**
Las seis regresiones de `useExpedientSearch` —la búsqueda que llega tarde, el
aborto de la anterior, los vértices del expediente previo, el servicio caído
frente al expediente inexistente, la capa que rechaza uno de los dos campos, y
el vértice de cierre duplicado— están ahora en `useExpedientSearchGL.test.js`,
más una séptima nueva: que el resultado se pinta con el color de la capa donde
apareció. Las dos de `shouldShowLabels` se mudaron a `mapUtils.test.js`, que es
donde vive ahora esa función. **Ninguna de estas regresiones documenta un bug
teórico: cada una es un fallo que este proyecto ya tuvo.** Borrarlas junto con
Leaflet habría sido perder la memoria de los errores.

**Una trampa nueva de Jest:** `maplibre-gl` 6 se publica solo como módulo ESM y
el resolvedor de Jest es CommonJS, así que `jest.mock("maplibre-gl", ...)` falla
con "Cannot find module" —ni siquiera llega a sustituirlo—. La solución es
`{ virtual: true }`, que le dice a Jest que registre el doble sin buscar el
original. Queda anotado en el propio archivo de tests.

**Qué se verificó:** 134 tests unitarios en verde (11 suites), `npm run build`
compila sin rastro de Leaflet, y las cinco baterías de navegador se repitieron
apuntando a `/` en vez de `/gl`: 30 de la Fase 2, 24 de la Fase 3, 21 de la
Fase 4, 16 de la Fase 5 y 14 de GPS y brújula. **105 comprobaciones, todas en
verde después del borrado.** Y un barrido de texto por todo el código: las
únicas menciones a Leaflet que quedan son comentarios que explican por qué algo
está como está —que es justo lo que pide CLAUDE.md—, no código que dependa de él.
De paso se corrigieron los comentarios que hablaban del visor Leaflet en
presente, porque ya no existe.

**Lo que queda pendiente no es deuda de la migración**, es trabajo nuevo: el DEM
recortado de la Fase 5 (falta que Fabio elija la fuente) y las entidades de la
Fase 6 (falta que diga cuáles). La paridad con el visor viejo está completa.

### Fase 8, ajustes de uso — 2026-08-20

Once observaciones de Fabio después de usar el visor con datos reales. Diez
resueltas; la undécima —los filtros— necesita información que desde aquí no se
puede conseguir. Aparte, quedó decidida la fuente del DEM.

**El DEM: Copernicus GLO-30.** La condición era que fuera gratuito "para que lo
usen muchas personas", y esa frase decide la comparación. OpenTopography también
es gratis, pero por usuario: hay que sacar una clave y hay cuota diaria. Un visor
público con clave compartida agota la cuota el día que lo usen veinte personas, y
lo hace de la peor manera —descargas que fallan sin explicación—. GLO-30 se
sirve como COGs públicos en S3, sin clave y sin cuota, con licencia que permite
redistribuir. Son 30 m, la mitad de detalle que el LiDAR del IGAC, pero cubre el
país entero y no se rompe al crecer. El LiDAR del IGAC puede añadirse después
como opción donde exista, sin sustituir a este.

**Dos cosas que las comprobaciones daban por buenas y estaban mal.** Ambas se
vieron mirando capturas, no leyendo datos; es la tercera vez que pasa en este
proyecto y ya conviene tomárselo como norma.

La primera: el punto marcado no se veía. El símbolo estaba bien —círculo de
color con halo blanco, y los datos lo confirmaban—, pero la etiqueta con las
coordenadas se ancla por defecto *centrada* en el punto, y su recuadro oscuro es
mucho mayor que el círculo. El visor decía las coordenadas del sitio sin señalar
el sitio. Se arregla anclando la etiqueta por abajo y subiéndola 14 px.

La segunda: al encender el 3D, la columna de botones creció tanto que se montó
encima del panel lateral. Y al añadir el campo de coordenadas, el panel creció
hacia abajo hasta meterse debajo de esa columna, que al estar por encima se comía
los clics de sus botones "Borrar" y "Exportar" —eso lo detectó la batería de la
Fase 3, que se quedó esperando un botón que estaba visible pero era imposible de
pulsar—. La causa de fondo era que panel y controles compartían el lado
izquierdo. Ahora el panel se queda con la izquierda entera y tiene un alto máximo
con desplazamiento propio; los controles del mapa se van todos a la derecha.
Ajustar alturas habría durado hasta el siguiente añadido.

**El interlineado de la ficha tenía una causa concreta.** No era una cuestión de
gusto: había una regla `white-space: pre-line` aplicada a *todos* los globos. El
HTML de la ficha se arma con una plantilla de texto, que trae un salto de línea y
su sangría entre etiqueta y etiqueta, y con esa regla esos saltos se dibujaban
como líneas de verdad. Cada renglón medía 48 px en vez de 17. La regla la
necesitaba solo el globo de un vértice, cuyo texto sí lleva saltos deliberados,
así que ahora va contra su clase.

**Los sistemas de coordenadas pasaron de dos a diez**, y eso destapó una trampa.
La exportación tenía su propia lista con solo dos, y un respaldo silencioso a
Origen Nacional. Añadir sistemas a la tabla sin tocar la exportación habría
producido shapefiles en un sistema distinto del elegido, con un `.prj` coherente
consigo mismo y equivocado: un archivo que se abre sin errores y coloca los
polígonos donde no van. Ahora las dos leen `utils/crs.js`, que entrega definición
y `.prj` juntos precisamente para que no se puedan separar.

Se incluyeron los cinco orígenes antiguos de MAGNA-SIRGAS además del CTM-12
porque los títulos inscritos antes de 2020 están en ellos, sobre todo en Origen
Bogotá. Las coordenadas de referencia de las pruebas no salen de ejecutar el
código y copiar el resultado —eso no probaría nada—: se calcularon aparte con la
serie del arco meridiano y coinciden con proj4 dentro de 3 m.

**El campo de coordenadas y la coma.** En español la coma separa decimales; en
casi todo sitio de donde se copia una coordenada, separa los dos números. No se
puede decidir mirando una coma suelta, así que se decide mirando la cadena
entera: primero se parte por espacios, que nunca son ambiguos, y solo si no hay
espacios se recurre a las comas (dos trozos = separador, cuatro = decimales).
Entiende también grados-minutos-segundos, con N/S/E/W y con la O de Oeste. Si el
punto cae fuera de Colombia avisa sin impedirlo: casi siempre significa haber
intercambiado los dos números, pero puede ser a propósito.

**Un fallo que introdujo el modo de punto continuo.** Al dejar la herramienta
encendida entre punto y punto, casi siempre hay una figura a medio hacer:
mapbox-gl-draw mete en su almacén el punto que se *va* a dibujar, todavía sin
coordenadas, y `getAll()` lo devuelve como uno más. Eso se colaba en la descarga
por área, y un punto sin coordenadas dentro de un GeoJSON no es GeoJSON válido.
`getDrawnFeatures` ahora filtra las figuras incompletas.

**Los filtros quedan pendientes, y no por falta de tiempo.** Filtrar por área,
clasificación, etapa o modalidad es sencillo: esos campos vienen en la respuesta
y ya se muestran en la ficha, así que se puede filtrar en el navegador sobre lo
que ya está cargado, sin consultar nada más. Departamento y municipio son otra
cosa: no aparecen en las respuestas que se han visto, y hay dos caminos —pedirle
al servicio que los devuelva, si es que los tiene, o cruzar con el MGN del DANE—
que se eligen según lo que resulte que traen los servicios. Averiguarlo requiere
preguntarles, y desde este entorno no hay salida a internet. Es exactamente el
mismo caso de `scripts/probar-geojson.mjs`: lo sensato es sondear primero y
diseñar después, no construir a ciegas un panel de filtros sobre campos que
a lo mejor no existen.

**Comprobado**: 156 pruebas unitarias (34 nuevas, entre los sistemas de
coordenadas y el lector de coordenadas escritas) y 137 comprobaciones en
navegador —las 105 de regresión de las fases anteriores, todas en verde, más 32
nuevas para estos ajustes—, con capturas de la ficha, del punto marcado, de la
paleta, del panel de 3D y de la brújula en sus dos tamaños.

### Fase 9, panel por áreas — 2026-08-20

Se diseñaron tres paneles alternativos en un lienzo aparte —acordeón, pestañas y
lista continua— y Fabio eligió la lista continua. Se implementó esa, con dos
añadidos que pidió: cambiar el color de una capa y reordenarlas arrastrando.

**El orden de la lista es el orden de pintado.** Es la parte con más miga.
MapLibre dibuja las capas en el orden en que están en el estilo, y `moveLayer(id,
antesDe)` coloca una *debajo* de otra. Para que "arriba en la lista" signifique
"encima en el mapa" se recorre la lista al revés, de abajo arriba, empujando cada
capa justo antes del resultado de la búsqueda: cada llamada deja su capa por
encima de la anterior, y al terminar la primera de la lista quedó arriba del
todo. El resultado de la búsqueda se queda siempre por encima de las demás, que
es lo que el usuario acaba de pedir expresamente.

**En "Activas" la lista es plana, y no es un descuido.** En "Todas" las filas van
agrupadas por área con los encabezados pegados arriba; ahí no se puede arrastrar,
porque un orden de pintado global y un agrupamiento por área se contradicen: la
tercera fila de Geología no tiene un puesto en la pila. En "Activas" desaparecen
los encabezados y queda una sola lista ordenable, con una franja del color del
área en el borde izquierdo de cada fila para no perder de dónde viene cada capa.

**Arrastrar mueve dentro de un subconjunto.** El usuario ordena entre las capas
encendidas, que son unas pocas de las trece. `moveWithinSubset` reordena solo
esas y devuelve cada una a los huecos que ocupaban las activas dentro de la lista
completa, así que las apagadas conservan su sitio exacto: al volver a encender
una, reaparece donde el usuario la había dejado y no al final de la pila.

**El arrastre va con eventos de puntero y no con la API de arrastre de HTML.**
Aquella no existe en pantallas táctiles y el visor se usa en campo desde el
celular. La cuenta de en qué posición cae el puntero se compara contra el
*centro* de cada fila, no contra su borde: con los bordes, arrastrar un puesto
nunca llegaba a mover nada.

**Un fallo evitado a tiempo:** la fila estaba definida dentro del componente del
panel. Un componente definido dentro de otro es un tipo nuevo en cada render, así
que React desmonta y vuelve a montar todas las filas ante cualquier cambio — y
eso rompe justo las dos funciones nuevas: el arrastre pierde el elemento que
tenía agarrado y el deslizador de opacidad pierde el foco a media pulsación. Se
sacó a nivel de módulo.

**El color se elige uno y se derivan dos.** El usuario escoge el relleno y el
contorno sale de oscurecerlo un 35 %. Pedir los dos sería más exacto y bastante
más pesado, y la pareja "relleno claro, borde oscuro" es la que hace legible un
polígono sobre satélite y sobre mapa claro por igual. El selector se queda
abierto al elegir, a propósito: escoger el color de una capa es compararlo contra
el mapa, y cerrarse en el primer clic obliga a reabrirlo por cada prueba.

**Una consulta que se disparaba de más.** El estado de las capas pasó de ocho
props sueltas a un solo objeto por clave. Como ese objeto cambia también al mover
la opacidad o elegir un color, el efecto que consulta a la ANM habría lanzado una
petición por cada roce del deslizador. Se le puso una huella —una cadena de unos
y ceros con qué capas están encendidas— y solo eso dispara la consulta.

**Las nueve capas nuevas están en el panel pero deshabilitadas.** Geología,
Hidrocarburos y Catastro se ven con su interruptor apagado y sin poder pulsarse,
porque todavía no se conocen las direcciones públicas de SGC, ANH e IGAC. Es
deliberado: enseña a dónde va el panel sin fingir que ya funciona. Conectar una
es ponerle `url` en `utils/themeAreas.js` y quitarle `pending`.

**Dos comprobaciones de las suites viejas se actualizaron, y ninguna era una
regresión.** La de la opacidad usaba la escala vieja del deslizador (iba de 0 a 1
y ahora va de 0 a 100). La de la línea dibujaba en un punto que el panel, ahora
más alto, tapa: el clic no llegaba al mapa. La segunda vale como aviso — el panel
ocupa bastante más alto que las cuatro filas de antes—, pero el panel lateral
tiene tope y desplazamiento propio, y su botón de ocultar sigue ahí.

**Comprobado**: 200 pruebas unitarias (44 nuevas: colores, reordenamiento,
registro de áreas y el panel) y 159 comprobaciones en navegador — las 137
anteriores en verde más 22 nuevas—, incluida la prueba que de verdad importa:
`queryRenderedFeatures` devuelve las capas en el orden en que MapLibre las va a
dibujar, y tras arrastrar devuelve el orden nuevo. Con capturas de la lista, del
selector de color, del arrastre a medias y del mapa repintado.

### Fase 10, ajustes de lectura — 2026-08-21

Siete observaciones de Fabio sobre lo que se lee y dónde se lee.

**El sistema de coordenadas solo mandaba en la tabla.** Alguien trabajando en
Origen Nacional veía la tabla en metros y todo lo demás en grados: la lectura del
cursor y las etiquetas de los puntos que él mismo acababa de marcar. Ahora ese
selector gobierna las cuatro lecturas —tabla, exportación, cursor y etiquetas— y
subió al panel principal, porque ya no es un ajuste de una tabla escondida en un
modal.

**Escribir una coordenada se mudó al mapa.** Estaba en el panel, siempre a la
vista, ocupando sitio permanente para algo que se usa de vez en cuando. Ahora
sale abajo al centro, con la herramienta de punto: ese botón sirve para las dos
formas de marcar un punto —con el ratón o escribiéndolo—, que son la misma tarea.
Y son dos casillas en vez de una: separar la ordenada de la abscisa elimina de
raíz la ambigüedad de la coma que obligaba a adivinar dónde partía el par, sin
perder que dentro de cada casilla se pueda escribir con coma decimal o en grados,
minutos y segundos.

**Un fallo del giro en bucle, evitado antes de que se viera.** Cada `jumpTo` del
bucle dispara un `moveend`, y ese evento actualiza el estado que mueve el
deslizador de giro: tal cual, el visor entero se repintaría sesenta veces por
segundo. El bucle publica el rumbo cuatro veces por segundo, que basta para que
el control se vea vivo, y el manejador de `moveend` se aparta mientras gira.

**La brújula tenía un problema de fondo, no de gusto.** Los rótulos se colocaban
girando el texto hasta su ángulo, y eso gira también las letras: a 225° el número
salía boca abajo, y la E y la O de los costados se leían como una "m" y un "0".
Ahora se calcula con trigonometría dónde cae cada rótulo y se pinta derecho, que
es como se lee una brújula de verdad. Los grados pasan de cada 10° —36 números de
10 px pegados, un borrón— a cada 45°, con marcas cada 5 y realces cada 15. Y se
le añadió una banda oscura bajo el anillo: la rosa se había diseñado pensando en
la imagen de satélite, que es oscura, y sobre el mapa claro el texto blanco
desaparecía. Eso solo se vio mirando una captura de cerca.

**Los filtros, por fin.** Se puede filtrar por estado, modalidad, etapa,
clasificación y área mínima, y el efecto es esconder lo que no cumple sin volver
a consultar nada: las capas ya traen todos sus atributos. La decisión de fondo es
que **las opciones se leen de los datos que hay en pantalla**, no de una lista
escrita en el código: nadie se sabe de memoria las etapas que usa la ANM ni cómo
las escribe, y una lista inventada acabaría ofreciendo "Exploración" donde el
servicio dice "EXPLORACION". Solo se ofrecen los campos con más de un valor
distinto, porque un filtro con una sola opción no filtra nada.

Departamento y municipio siguen fuera, y no por falta de ganas: no aparecen en
ninguna respuesta observada de los cuatro servicios. `scripts/probar-campos.mjs`
pregunta a los metadatos de cada capa qué campos declara y busca los que suenen a
división territorial. Según lo que conteste, filtrar por ellos es añadir una línea
o es cruzar cada polígono con el mapa municipal del DANE, que es bastante más
trabajo. Se decide con el dato delante, no antes.

**Los botones del mapa hablaban otro idioma.** Venían del componente genérico de
la aplicación mientras el panel se rediseñó aparte, así que convivían dos
tipografías, dos tamaños y dos grises en la misma pantalla. Ahora hay un único
botón compartido con el lenguaje del panel: 13 px, colores slate, esquinas de 8.

**Tres comprobaciones de las suites viejas se actualizaron, ninguna era una
regresión.** La lectura del cursor cambió de texto —ahora nombra los ejes según
el sistema—, la caja de coordenadas se mudó del panel al mapa, y las filas de la
ficha miden un poco más porque llevan su separador.

**Comprobado**: 215 pruebas unitarias (15 nuevas para los filtros) y 187
comprobaciones en navegador —las 159 anteriores en verde más 28 nuevas—, con
capturas de la ficha, de la caja de coordenadas, de los filtros y un primer plano
de la brújula. El simulacro de la ANM ahora varía los atributos entre figuras: sin
eso no habría nada por lo que filtrar y la comprobación no probaría nada.

### Fase 11, tabla y mapas base — 2026-08-21

Siete peticiones de Fabio, y cuatro fallos que solo se vieron en el navegador.

**La tabla de resultados es el puente que faltaba.** Un mapa sirve para mirar;
una tabla sirve para leer de corrido, ordenar por área y encontrar un expediente
entre doscientos. Al pulsar una fila la tabla se cierra y el mapa vuela hasta ese
polígono, que es el gesto que une las dos vistas. Enseña exactamente lo que el
filtro dejó pasar, y se calcula en JavaScript en vez de preguntarle al mapa qué
está pintando: en modo "toda la capa" hay resultados que ni siquiera están en
pantalla, y llegar a ellos por la tabla es justamente la gracia.

**Filtrar en pantalla y filtrar toda la capa son dos cosas distintas de verdad,
no dos formas de decir lo mismo.** En pantalla se esconde lo que ya está
cargado y es inmediato. En toda la capa hay que armar la misma condición en SQL
y preguntársela al servicio, sin recuadro. El respaldo entre nombres de campo
—TITULO_ESTADO en unas capas, ESTADO en otras— se traduce a un `OR`: preguntar
solo por el primero devolvería cero en la mitad de las capas sin decir por qué.

**Cinco mapas base, y el segundo satélite no es un capricho.** Esri publica
imágenes de otras fechas de toma que Google: comparar las dos delata actividad
reciente en un título, que es exactamente lo que se mira en este oficio. Pulsar
el fondo que ya está puesto quita o pone sus nombres, con un distintivo «Aa» que
lo anuncia para que no haya que descubrirlo. Cada fondo resuelve los nombres a su
manera y por eso no hay un único mecanismo: Google y CARTO publican dos
direcciones distintas, Esri superpone una capa aparte, y OSM y OpenTopoMap los
traen pintados dentro de la tesela y no se pueden quitar — ahí el visor lo dice
en vez de ofrecer un interruptor que no haría nada.

**Cuatro fallos que pasaron la compilación y las 233 pruebas, y que solo se
vieron abriendo el visor.** Van juntos porque la lección es una sola.

1. `loadedFeatures` se usaba sin haberla sacado del hook. La página no se
   pintaba: un `ReferenceError` en cada render y la pantalla en blanco. Ni
   `next build` ni Jest lo vieron, porque el proyecto no tiene ESLint y la
   pantalla en blanco no la mira nadie más que un navegador.
2. Al pulsar una fila de la tabla, el mapa no se movía. `bboxOfGeometry`
   devuelve un objeto con nombres, no la tupla `[oeste, sur, este, norte]` de
   GeoJSON, y leerlo como arreglo dejaba los cuatro valores en `undefined`;
   `fitBounds` no se quejó. La tabla se cerraba y el mapa se quedaba donde
   estaba, que es indistinguible de "no pasó nada".
3. La X del panel flotante no lo guardaba y el botón guardado no lo reabría. El
   arrastre llamaba a `preventDefault()` en `pointerdown`, y eso cancela los
   eventos de ratón que vienen detrás, **incluido el clic**. Arrastrar
   funcionaba; pulsar, no. Ahora el arrastre no cancela nada —el texto se
   protege con `select-none`— y un umbral de cuatro píxeles distingue un clic de
   un arrastre.
4. El visor arrancaba con el callejero de OSM mientras el botón anunciaba
   «Satélite»: el estilo se creaba con `"osm"` fijo desde cuando solo había dos
   fondos. Se notaba comparando la atribución de la esquina con lo que decía el
   botón, y no antes.

**La medición del color de fondo también se equivocó la primera vez**, y merece
quedar escrito: se muestreaba un recuadro del mapa con los títulos encendidos, y
el marrón de los polígonos cubría más de la mitad. El color medio salía mezclado
y dos fondos "fallaban" estando bien. Se apagan las capas antes de medir.

**Comprobado**: 233 pruebas unitarias y 33 comprobaciones en navegador para esta
tanda —acordeón, botones del encabezado, filtro por área, tabla y su vuelo,
alcance por servicio, sistema de coordenadas, los cinco fondos medidos por el
color que pintan, el distintivo de nombres, y el panel del 3D guardado, arrastrado
y reabierto—, con capturas de cada una.

### Fase 12, espacio y etiquetas — 2026-08-21

**El panel perdió su encabezado y ganó una pestaña.** «Títulos y Solicitudes»
nombraba a una de las cuatro áreas que ahora agrupa el panel, así que orientaba
mal; sin él se ganan 44 px de alto. Y los dos mandos de ocultar y mostrar —una X
dentro del panel, un botón redondo en la esquina de la pantalla— se fundieron en
una pestaña pegada al costado que se desliza con él: un solo mando, siempre en
el mismo punto, con la flecha diciendo hacia dónde va.

La cuenta del desplazamiento tiene truco y quedó anotada en el código: el bloque
mide panel más pestaña, así que correrlo «100 % menos la pestaña» —que es lo que
parece— deja una franja de 16 px del panel asomando. Leyendo el código no se ve;
en una captura, sí.

**«Borrar» ya no mueve la vista.** Volaba al centro del país, de modo que
deshacer una búsqueda deshacía también toda la navegación: quien estaba mirando
el detalle de una vereda tenía que volver a buscarla a mano. Borrar es quitar el
polígono, sus vértices y los botones de la búsqueda; nada más.

**Las etiquetas dejaron de depender de un umbral de zoom.** Salían a partir del
15 y los polígonos se cargan desde el 10: entre esos dos zooms se veían las
figuras sin poder saber de qué expediente era cada una. El umbral existía por
una razón real —apiñadas son un borrón—, pero trata igual a un título de 5.000 ha
y a uno de 20.

La regla nueva cabe en una frase: **se etiqueta el polígono en el que la etiqueta
cabe**. Si el código no cabe dentro de la figura en pantalla, la etiqueta se
saldría por fuera y señalaría a otro sitio. Y entre dos que se pisan sobrevive la
de mayor superficie, porque superpuestas no se lee ninguna de las dos. El efecto
es el natural: al alejarse desaparecen primero las pequeñas, al acercarse van
apareciendo. Vive en `utils/labelPlacement.js`, es puro y tiene sus pruebas; es
lo que MapLibre hace solo con sus capas `symbol`, que aquí no se pueden usar
—ver el encabezado de `mapLabelsGL.js` para el porqué—.

Dos detalles que hacen que salga barato: el punto y el recuadro de cada figura se
calculan una sola vez al llegar los datos —encontrar un punto interior de un
polígono con huecos es lo caro de todo esto—, y las etiquetas se recolocan al
terminar un zoom sin volver a consultar a la ANM, porque los polígonos son los
mismos, solo se ven de otro tamaño.

**El fondo de partida ahora es el gris claro de CARTO.** Lo primero que este
visor tiene que dejar ver son los títulos, y sobre la imagen de satélite un
polígono marrón semitransparente compite con el terreno y sus contornos se
pierden. La imagen se enciende cuando ya se sabe dónde mirar. De paso se
reescribieron los cinco nombres y las cinco descripciones, que tenían un tono
de conversación —«el callejero de siempre»— y decían cosas que no interesan.

**Un fallo del simulacro, no del visor, que conviene tener anotado.** El buscador
de expedientes pide `f=geojson`, que ArcGIS sabe devolver directamente, mientras
que las capas piden `f=json` y traducen. El simulacro contestaba siempre en el
formato de Esri, así que el resultado de la búsqueda llegaba sin `geometry.type`:
no se dibujaban los vértices y la etiqueta reventaba. El servicio real sí
distingue, pero un simulacro que miente en el formato esconde justo la parte que
había que comprobar.

**Comprobado**: 240 pruebas unitarias (9 nuevas para la colocación de etiquetas)
y 30 comprobaciones en navegador para esta tanda, con capturas.

### Fase 13, la auditoría aplicada — 2026-08-21

Doce hallazgos y siete propuestas de `docs/AUDITORIA.md`, hechos. Lo que merece
quedar escrito no es la lista —esa está arriba— sino lo que se aprendió.

**Cuatro fallos que ninguna prueba habría visto, y cómo salieron.**

1. `metersPerPixel` usaba 156.543, la cifra de los mapas de teselas de 256 px.
   MapLibre define su zoom con teselas de 512, así que a un mismo zoom su escala
   es la mitad. La barra de escala de la imagen exportada decía «1 km» sobre un
   tramo de 500 m, y la capa de pendiente daba 30° donde el terreno tenía 50.
   Salió al pintar un terreno sintético de pendiente conocida y ver que los
   colores no cuadraban.
2. Las preferencias rompían la hidratación de Next: el servidor no tiene
   almacenamiento del navegador, así que pintaba los valores de fábrica mientras
   el navegador pintaba los guardados, y React tiraba la página entera.
3. `maxPitch` seguía fijo en 85 mientras el deslizador ya usaba `PITCH_MAX`, de
   modo que bajar la constante no bajaba nada: con Ctrl se seguía llegando a 85.
4. `window.matchMedia` no existe en jsdom, y una línea sin comprobarlo tumbó
   catorce pruebas de golpe.

Los cuatro comparten forma: **el código se lee bien y hace otra cosa**. Es la
misma familia que el worker de MapLibre y el color de las figuras, y la razón de
que en este proyecto toda tanda termine con un navegador abierto.

**Lo que el límite de errores ya se ganó.** Al conectar la consulta de terreno,
su estado quedó declarado después del hook que lo lee, y eso da «Cannot access
before initialization». Antes habría sido una pantalla en blanco sin más pista;
ahora salió una tarjeta con la traza y el arreglo llevó un minuto.

**Sobre lo que se pinta del terreno.** Pendiente y orientación no se le piden a
nadie: se derivan del modelo de elevación en el propio navegador, muestreando la
pantalla en una rejilla de 8 px. La rejilla es de pantalla y no de terreno para
que el coste no dependa del zoom. Solo se dibujan con el mapa plano, porque la
imagen se coloca sobre el rectángulo que se ve y con la cámara inclinada ese
rectángulo no es un rectángulo en el terreno: la capa saldría estirada señalando
pendientes donde no las hay. Y llevan pegado, donde se ve, el aviso de que con un
modelo global de 30 m esto sirve para leer terreno y descartar zonas, no para
diseño de bancos ni cálculos de estabilidad.

**Comprobado**: 310 pruebas unitarias y cuatro suites de navegador nuevas —
teléfono, exportación de imagen, consulta de terreno y capas derivadas—, estas
dos últimas sobre superficies sintéticas de pendiente conocida, porque el proxy
de la máquina de desarrollo bloquea las teselas de elevación reales.
