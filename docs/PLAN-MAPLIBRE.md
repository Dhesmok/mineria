# Plan: migración a MapLibre + terreno 3D

Documento de trabajo. Marca las casillas a medida que avances y actualiza el
estado al final de cada sesión, para que la siguiente sesión sepa dónde quedó.

**Estado:** Fase 0 completa. Siguiente: Fase 1 (mapa base en MapLibre).
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
| `utils/mapUtils.js`, `mapLabels.js` | Casi intacto, revisar helpers que reciban objetos Leaflet |
| `hooks/useExpedientSearch.js` | Intacto |
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

- [ ] Rama `feat/maplibre`
- [ ] `npm i maplibre-gl @mapbox/mapbox-gl-draw`
- [ ] Nuevo `MapComponentGL.jsx` en paralelo al actual — **no borres el viejo
      todavía**, se compara lado a lado
- [ ] Estilo base: teselas OSM raster para empezar (simple), vectorial después
- [ ] Portar `useMapInitialization` → `useMapInitializationGL`
- [ ] Verificar: zoom, pan, escala, coordenadas del cursor

## Fase 2 — Capas ANM

- [ ] Portar `useMapLayers`. Las capas ArcGIS `MapServer` se consumen como
      `raster` source vía `export?f=image` (rápido, no interactivo) o como
      `geojson` source vía `/query?f=geojson` (interactivo, más pesado)
- [ ] Decidir por capa: títulos y solicitudes probablemente GeoJSON con filtro
      por bbox del viewport, para poder hacer clic e inspeccionar
- [ ] Etiquetas con `symbol` layers de MapLibre (reemplaza `mapLabels.js` en su
      parte de render, la lógica de qué texto mostrar se conserva)
- [ ] Verificar que `findTenureLayerNumbers()` sigue funcionando sin cambios

## Fase 3 — Dibujo y exportación

- [ ] Portar `useDrawControl` a `mapbox-gl-draw`
- [ ] Confirmar que `exportUtils.js` recibe el mismo GeoJSON que antes
      (mapbox-gl-draw ya entrega GeoJSON estándar, debería ser directo)
- [ ] Correr los tests de exportación sin modificarlos

## Fase 4 — Terreno 3D

- [ ] Source de elevación con los terrain tiles públicos de AWS Open Data
      (codificación `terrarium`, sin API key ni autenticación)
- [ ] `map.setTerrain({ source: 'terrain', exaggeration: 1.5 })`
- [ ] Botón toggle 2D/3D + slider de exageración vertical (0.5 – 3)
- [ ] Capa `hillshade` para que el relieve se lea también en vista cenital
- [ ] `sky` layer para que el horizonte no se vea cortado en pitch alto

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
