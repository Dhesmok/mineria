# Auditoría del visor — 2026-08-21

Repaso completo de la estructura buscando fallos de hoy, deudas que van a doler
mañana, y por dónde conviene crecer. Escrito después de la Fase 12.

> **Estado: aplicada.** Los doce hallazgos y las siete propuestas se
> implementaron en la Fase 13; ver `PLAN-MAPLIBRE.md`. Lo único que se dejó
> fuera, y a propósito, es la curvatura: con celdas de 30 m es sobre todo ruido.
> El documento se conserva como está —con los problemas en presente— porque su
> valor no es la lista de tareas sino el razonamiento de por qué cada cosa
> importaba y qué la delató.

Cada hallazgo lleva la evidencia con la que se encontró. Los que no se
comprobaron de verdad van marcados como sospecha, no como hecho.

---

## Parte 1 — Fallos y deudas

Ordenados por lo que costaría que salieran mal, no por lo que costaría
arreglarlos.

### 1. No hay red de seguridad contra la pantalla en blanco

**Qué pasa.** En la Fase 11 una variable se usó sin haberla sacado del hook
(`loadedFeatures`). El resultado no fue un fallo parcial: fue **la página
entera en blanco**. Ni `next build` ni las 233 pruebas lo vieron.

**Por qué se escapó.** El proyecto no tiene ESLint. La regla que atrapa esto
—`no-undef`— es de las más básicas que existen, y no está puesta. `next build`
imprime «Linting…» y no lint nada, porque no hay configuración que leer.

**Y por qué duele tanto.** No hay un límite de errores de React (*error
boundary*). En React, una excepción durante el pintado desmonta el árbol entero:
un fallo en una esquina del panel se lleva por delante el mapa, los datos y todo
lo demás. Para quien abre el visor no hay diferencia entre eso y que el sitio
esté caído.

**Arreglo.** Dos piezas pequeñas e independientes: añadir ESLint con la
configuración de Next, y envolver el visor en un límite de errores que muestre
«algo falló, recarga» en vez de nada. Son un rato de trabajo cada una y cierran
una clase entera de incidentes.

### 2. «Toda la capa» vuelve a barrer el país en cada arrastre del mapa

**Qué pasa.** Con el filtro en modo «toda la capa», cada vez que se mueve el
mapa se lanza otra vez la consulta nacional. Mover el mapa no cambia el
resultado —la consulta ignora el recuadro a propósito—, así que es tráfico y
espera para volver a recibir exactamente lo mismo.

**Evidencia.** `useMapLayersGL.refresh()` está enganchado a `moveend`, y dentro
de `refresh`, cuando `barrerCapa` es cierto, se llama a `fetchLayerFeatures` con
el recuadro en `null`. No hay nada que corte esa repetición.

**Riesgo real.** Con cuatro capas encendidas son cuatro consultas nacionales por
cada gesto. La ANM puede empezar a cortar peticiones, y entonces el visor se
queda sin datos por una razón que no tiene nada que ver con lo que el usuario
está haciendo.

**Arreglo.** En modo «toda la capa», consultar solo cuando cambia el filtro, no
cuando cambia la vista. La huella `queryFilterSignature` ya existe y ya distingue
los dos casos; falta que `moveend` no dispare cuando ese modo está activo.

### 3. El 3D no avisa cuando el modelo de elevación no llega

**Qué pasa.** Si las teselas de elevación fallan, el visor entra en 3D igual:
inclina la cámara y enseña un plano inclinado sin relieve. No dice nada.

**Evidencia.** Midiendo en el navegador se registraron doce peticiones a
`elevation-tiles-prod` y las doce fallaron (`ERR_CONNECTION_RESET`, por el proxy
de este entorno de pruebas). El visor no cambió de aspecto ni escribió nada.

**Por qué importa.** «El 3D se ve raro» y «el 3D no cargó» son problemas
distintos con soluciones distintas, y ahora mismo se ven igual. Además, el
proveedor —un bucket de S3 sin CDN— no es rápido: en este entorno cada tesela
tardó ~0,6 s por HTTP directo.

**Arreglo.** Escuchar los errores de la fuente de elevación y, si fallan varias
seguidas, avisar y volver a 2D en vez de dejar el plano inclinado.

### 4. El filtro que llega al mapa es siempre el de Minería

**Qué pasa.** El panel guarda un filtro por área, pero lo que se le entrega al
mapa —y lo que llena la tabla de resultados— es siempre el de Minería, escrito a
mano.

**Evidencia.** En `components.jsx`: `filters = { ...filtroDe("mineria"), ... }`
y `registrosVisibles` usa también `filtroDe("mineria")`.

**Hoy no se nota** porque las otras nueve capas no tienen servicio conectado.
**El día que entre la primera capa del SGC o del IGAC, sí**: filtrar Geología
filtrará Minería y nada más, sin dar ningún error. Es la peor clase de deuda:
invisible hasta que aparece disfrazada de otra cosa.

**Arreglo.** Que el filtro viaje por área, como ya viaja en el panel. Es
mecánico, y hacerlo ahora cuesta una décima parte de hacerlo cuando ya haya
capas nuevas que lo estén sufriendo.

### 5. Nada se recuerda entre visitas

Cero usos de almacenamiento del navegador en todo el proyecto. Cada recarga
devuelve el mapa base, el sistema de coordenadas, las capas encendidas, sus
colores, su orden y el tamaño de la brújula a los valores de fábrica.

Para quien usa el visor todos los días con la misma configuración, eso es
rehacer el mismo trabajo cada mañana. Guardar esas preferencias es de las
mejoras con mejor relación entre lo que cuesta y lo que se nota.

### 6. Un temporizador que queda suelto

`debounce()` en `lib/utils.ts` no devuelve forma de cancelarlo. En
`useMapLayersGL`, `debouncedRefresh` se vuelve a crear cada vez que cambia
`refresh`, y el temporizador de la versión anterior sigue en marcha: se quita el
oyente del evento, pero la cuenta atrás ya empezada no.

Hoy no rompe nada porque `refresh` comprueba que el mapa exista antes de tocarlo.
Es de las cosas que no dan la cara hasta que alguien añade un efecto secundario
dentro y entonces ocurre «a veces».

### 7. Dos mandos distintos para el sistema de coordenadas

El panel tiene el botón nuevo que abre el selector; la ventana de «Mostrar
coordenadas» conserva la lista desplegable vieja con los diez sistemas. Son el
mismo ajuste con dos aspectos distintos, y cambiar uno cambia el otro sin que se
vea. Sobra el segundo.

### 8. Un `alert()` del navegador

Queda uno, en «Mostrar coordenadas» cuando no hay ninguna. Es el único diálogo
del sistema operativo en toda la interfaz y desentona con el resto; además
bloquea la página hasta que se cierra.

### 9. `MapComponentGL.jsx` mide 1.103 líneas

Es, de lejos, el archivo más grande. Dentro conviven la creación del mapa, ocho
componentes de interfaz definidos en el propio archivo, el bloque de CSS y el
cableado de siete *hooks*. Funciona, pero es donde se cruza todo, y por eso es
donde más caro sale equivocarse —los dos fallos de la Fase 11 estaban ahí—.

No urge partirlo. Sí conviene sacar los componentes de interfaz a
`app/components/`, como ya se hizo con el panel: es un movimiento mecánico y
deja el archivo hablando solo del mapa.

### 10. No hay comprobaciones automáticas al abrir un cambio

No existe `.github/`. Nadie corre `npm test` ni `npm run build` cuando se abre un
*pull request*: depende de acordarse. Una comprobación automática es un archivo
de veinte líneas y evita mezclar un cambio que no compila.

### 11. La barra de dibujo habla otro idioma

Los tres botones de dibujo y la papelera siguen en el estilo anterior: caja
blanca de esquinas de 6, iconos grises, activo en azul claro. El resto de la
interfaz se rehízo en el lenguaje nuevo —slate, esquinas de 8, 13 px—, así que
esa esquina se ve pegada de otro sitio. Lo mismo pasa con la paleta de colores
que sale a su lado.

### 12. En el celular no cabe

El panel mide 350 px fijos, la columna de controles vive pegada a la derecha con
posición absoluta, y la barra de dibujo se pone encima de ella. En una pantalla
de 390 px de ancho eso significa que el panel tapa el mapa entero y los controles
se solapan. Hoy el visor es de escritorio, aunque el trabajo de campo sea justo
lo contrario.

---

## Parte 2 — Mejoras propuestas

En el orden en que las recomiendo, no en el orden en que se pidieron.

### A. Que el 3D sea rápido y sincero

Es lo primero porque es lo que más se nota y porque hoy falla de dos maneras a
la vez: va lento y, cuando no carga, miente.

Cuatro medidas, de más a menos rentable:

1. **Que las etiquetas se aparten mientras la cámara se mueve.** Cada etiqueta es
   un nodo del documento que MapLibre reposiciona en cada cuadro, y con terreno
   encendido cada reposicionamiento consulta además la altura del punto. Con
   ciento cincuenta etiquetas, eso es ciento cincuenta consultas de altura por
   cuadro. Ocultarlas mientras se gira y devolverlas al parar es barato y se
   nota de inmediato.
2. **No sombrear el relieve cuando el terreno 3D está levantado.** Hoy encender
   el 3D enciende también el sombreado, y son dos pasadas sobre el mismo modelo
   de elevación. En 3D el propio relieve ya da la forma; el sombreado aporta
   poco y cuesta lo mismo que en 2D.
3. **Bajar la inclinación máxima de 85° a unos 75°.** Los últimos diez grados
   son los que meten el horizonte en pantalla, y con el horizonte entran cientos
   de teselas lejanas que apenas se ven. Es el ajuste con mejor relación entre lo
   que cuesta escribirlo y lo que devuelve.
4. **Cambiar de proveedor de elevación.** El actual —terrarium en un bucket de
   S3— no tiene red de distribución y sirve teselas de 256 px, que son cuatro
   veces más peticiones que las de 512. Aquí hay que decidir con datos: merece la
   pena medir el mismo encuadre contra dos o tres alternativas antes de cambiar
   nada. Y va ligado a la decisión pendiente del DEM para las descargas, así que
   conviene resolver las dos a la vez.

   **La restricción ya está decidida, y acota la lista: tiene que ser gratuito y
   aguantar descarga masiva.** El visor es para toda Colombia, así que cualquier
   proveedor con cupo por clave o con cobro por encima de cierto tráfico queda
   fuera, por muy rápido que sea. Eso descarta de entrada las opciones de pago
   por uso y deja el terreno de los datos abiertos: el bucket actual, los
   modelos globales publicados como datos abiertos, y lo que publique el IGAC
   para Colombia, que sería además la fuente con autoridad para las descargas.
   La medición pendiente es entre esos, no entre todos.

   Y la medición hay que hacerla **desde Colombia**: lo que se mide es cuánto
   tarda el dato en llegar hasta donde está el usuario, y desde este entorno de
   desarrollo ese número no significa nada. Aquí, además, el proxy bloquea el
   servidor de elevación.

Y, se haga lo que se haga con la velocidad, **avisar cuando el modelo no carga**
(fallo 3 de arriba).

### B. Que funcione en el celular

Es la mejora que más gente nueva trae, porque el trabajo de campo se hace con el
teléfono en la mano.

No es «encoger el panel»: es decidir qué manda en cada tamaño. Lo que propongo:

- Por debajo de cierto ancho, el panel deja de ser una columna al lado del mapa y
  pasa a ser una hoja que sube desde abajo, con tres alturas —cerrada, media y
  completa—. Es el patrón que ya usan las aplicaciones de mapas y no hay que
  explicarlo.
- Los controles del mapa se agrupan: los cinco botones de la derecha, en una
  fila que se desplaza, o detrás de un único botón que los despliega.
- La barra de dibujo se va abajo, junto al pulgar, no arriba a la derecha.
- Los blancos de pulsación suben a 44 px, que es el mínimo con el que un dedo
  acierta.

Es la mejora más grande de todas las de esta lista. Conviene hacerla después del
3D, porque tocar las dos cosas a la vez complica saber qué rompió qué.

### C. Rediseñar la barra de dibujo

Aparte de unificar el estilo, hay dos cosas que hoy no se entienden:

- **Los tres botones no dicen qué miden.** Polígono da área, línea da longitud,
  punto da coordenadas, y eso solo se sabe después de usarlos. Una etiqueta
  junto al icono cuando la barra está desplegada lo resuelve.
- **La medida aparece lejos de donde se dibuja.** Sale en la figura, pero el
  total —área, perímetro, longitud— merece un sitio fijo y legible, no un texto
  pequeño encima del mapa.

Propongo una barra que se despliega: recogida, tres iconos; desplegada, tres
filas con nombre y con lo que se lleva medido. Y que el color, que hoy sale como
una tarjeta suelta al lado, viva dentro de ella.

### D. Exportar imagen

Que sirva de verdad, no que sea un botón más. Lo propongo así:

- **Una vista de exportación** en la que se elige qué entra: mapa base sí o no,
  capas encendidas, dibujo, etiquetas, escala, flecha de norte, leyenda y
  créditos. Nada de controles ni paneles en la imagen, nunca.
- **Tamaño y resolución a elegir**: pantalla, o dos y tres veces para imprimir o
  meter en un informe.
- **Con pie de página automático**: fecha, sistema de coordenadas, escala y
  fuentes de los datos. Una imagen de un título minero sin esos cuatro datos no
  sirve como soporte de nada, y ponerlos a mano es justo lo que nadie hace.

Técnicamente es asequible: MapLibre sabe entregar el lienzo, y la escala, el
norte y la leyenda se dibujan encima. Lo que hay que cuidar es que las etiquetas
—que son elementos HTML, no parte del lienzo— hay que volver a pintarlas sobre la
imagen. Es la parte que tiene trabajo.

### E. Derivados del modelo de elevación: pendiente, orientación, curvatura

Esta es la que más diferencia marca frente a cualquier otro visor, y la que hay
que plantear con más cuidado.

**Lo que se puede hacer bien.** Pendiente y orientación se calculan a partir de
las mismas teselas de elevación que ya se descargan, con la ventana de 3×3 de
toda la vida. Se puede hacer en la tarjeta gráfica, sobre las teselas que ya
están en memoria, y sale prácticamente gratis: se pinta como una capa más, con
su leyenda y su rampa de color.

**Lo que hay que decir en voz alta.** Estos resultados dependen por completo de
la resolución y la calidad del modelo. Con un modelo global de 30 m, la pendiente
sirve para leer el terreno y para descartar zonas; **no sirve para un diseño de
banco ni para un cálculo de estabilidad**, y el visor tiene que decirlo donde se
vea, no en una nota al pie. Y la curvatura, con 30 m, es sobre todo ruido: yo la
dejaría fuera de la primera versión, o detrás de un aviso claro.

**Orden que propongo.** Pendiente primero, con leyenda en grados y en porcentaje
—en minería se usan las dos—; orientación después, con la rosa de colores
habitual; y **la consulta puntual antes que las dos**: al pulsar un punto,
decir su cota, su pendiente y su orientación. Eso último es lo que de verdad se
usa en campo y es lo más barato de las tres.

### F. Recordar las preferencias

Mapa base, sistema de coordenadas, capas encendidas con su color y su orden,
tamaño de la brújula. Todo en el navegador de quien lo usa, sin cuentas ni
servidor.

Es poca cosa de escribir y cambia la sensación de la herramienta: pasa de «una
página» a «mi visor». Lo único que hay que cuidar es que una preferencia guardada
que ya no exista —un mapa base retirado, una capa que cambió de nombre— no deje
el visor roto: hay que validar lo que se lee, no confiar.

### G. La red de seguridad

ESLint, límite de errores de React, y una comprobación automática que corra las
pruebas y la compilación al abrir un cambio. Van juntas porque juntas evitan la
misma cosa: que un descuido llegue hasta la pantalla de alguien.

No es glamuroso y es lo que más veces se va a agradecer.

---

## Lo que no propongo, y por qué

- **Reescribir el panel o cambiar de biblioteca de mapas.** Funciona, la
  migración terminó hace nada y no hay ningún problema que se resuelva por ahí.
- **Partir `MapComponentGL` en muchos archivos de golpe.** Sacar los componentes
  de interfaz, sí. Reorganizar los *hooks*, no: están bien donde están y el
  archivo grande es una consecuencia, no la causa.
- **Añadir un servidor propio.** Todo lo de esta lista se hace en el navegador.
  El día que haya que recortar un DEM o guardar áreas de trabajo cambiará, pero
  ese día no es hoy y adelantarlo solo añade algo más que mantener.
