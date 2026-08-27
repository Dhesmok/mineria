# Riesgos abiertos

Lo que puede obligar a apagar el visor, o dejarlo sin datos, y hoy no está
resuelto. **No es una auditoría**: una auditoría es una foto de un momento y se
queda vieja. Esto es una lista viva, que se revisa y se tacha.

Ninguno de estos riesgos es un fallo del código. Son decisiones pendientes, y
casi todas necesitan que las tome Fabio, no un programador.

Última revisión: 2026-08-22.

---

## 1. Las teselas de Google, sin condiciones de uso resueltas

**Estado:** abierto. Es el mayor riesgo no técnico del proyecto.

**Actualización de agosto de 2026: este fondo pasó a ser el de partida.** Antes
era uno de seis y había que elegirlo; ahora es lo que ve todo el que abre el
visor. El riesgo no cambió de naturaleza, pero sí de tamaño: lo que antes era
«se apaga un fondo» ahora es «el visor arranca en blanco». El motivo del cambio
fue que CARTO —el fondo de partida anterior— empezó a exigir clave; ver el
riesgo 4.

El fondo «Imagen satelital» pide las imágenes a `mt0-3.google.com/vt`. **Eso es
un extremo interno de Google, no su API publicada.** Funciona, lo usan muchos
visores, y ninguna de las dos cosas lo convierte en permitido: la API que Google
publica para esto es Google Maps Platform, que exige clave, cobra por uso y trae
sus propias condiciones.

**Por qué importa aquí más que en otros proyectos.** Un visor privado que hace
cien peticiones al día pasa desapercibido. Un visor público para toda Colombia,
con dominio propio, no. Y el daño no es una multa: es que un día deje de
responder, o llegue una carta, y haya que apagar el fondo que más se usa.

**Qué hacer, y en qué orden:**

1. Leer las condiciones de Google Maps Platform con la pregunta concreta
   delante: ¿puede un tercero pedir teselas a `mt*.google.com` sin clave?
2. Si la respuesta es no —que es lo probable—, decidir entre pagar la API, o
   quitar ese fondo y quedarse con los que sí son libres. Y ahora, además,
   devolver el fondo de partida a uno que no dependa de Google. **El visor ya funciona
   sin él**: Esri, CARTO, OpenTopoMap y OSM están puestos y probados.
3. Mientras tanto, no anunciar «imágenes de Google» en ningún material.

**Ojo con la misma familia.** OpenTopoMap y las teselas de OpenStreetMap tienen
políticas de uso pensadas para volumen bajo. «Toda Colombia» no es volumen bajo.
Es la misma restricción que ya se decidió para el modelo de elevación —gratuito y
que aguante descarga masiva—, y a los mapas de fondo nadie se la ha aplicado
todavía. Si el visor crece, esto se convierte en un problema antes que el de
Google, porque esos dos servicios sí avisan y sí cortan.

---

## 2. El repositorio no tiene licencia

**Estado:** abierto. Es el más barato de cerrar de toda la lista.

No hay archivo `LICENSE`. Eso no significa «de uso libre»: significa lo
contrario. Sin licencia, por defecto nadie más que el autor tiene permiso para
copiar, modificar ni reutilizar el código —ni siquiera para arreglarle un fallo y
devolverlo—.

**Las tres salidas, en términos de lo que permiten:**

- **MIT o Apache 2.0**: cualquiera puede usarlo, modificarlo y hasta venderlo,
  siempre citando al autor. Es lo que se pone cuando lo que se quiere es que la
  herramienta se use y se cite.
- **AGPL**: cualquiera puede usarlo, pero si monta un servicio con él, tiene que
  publicar sus cambios. Es lo que se pone cuando preocupa que alguien coja el
  trabajo, lo cierre y lo cobre.
- **Ninguna, a propósito**: todos los derechos reservados. Legítimo, pero
  conviene que sea una decisión y no un olvido, y decirlo en el README.

No es solo formalidad: sin licencia, una entidad pública que quiera usar el visor
no puede, aunque quiera, porque su oficina jurídica no la deja.

---

## 3. Todo depende de un solo proveedor de datos

**Estado:** abierto, y ya se materializó una vez.

Las cuatro capas conectadas vienen de la ANM. Si ese servicio se cae, el visor se
queda sin nada que enseñar. Y no es una hipótesis: la trampa nº 1 del `CLAUDE.md`
existe porque **los índices de las capas de la ANM ya cambiaron entre despliegues
sin avisar**, y el visor tuvo que aprender a descubrirlos en marcha.

Lo que el visor ya hace bien:

- Descubre los índices de capa en cada arranque en vez de llevarlos fijos.
- Distingue un error del servicio de un «no se encontró nada» (trampa nº 2).
- Avisa cuando la respuesta viene recortada, para que nadie saque conclusiones
  de datos incompletos.

Lo que **no** hace, y sería lo siguiente:

- **Decir con claridad «el servicio de la ANM no responde»** cuando se cae, en
  vez de un mapa vacío que se parece demasiado a «aquí no hay títulos».
- **Guardar la última respuesta buena** para poder seguir mirando algo mientras
  el servicio vuelve.
- **Notar que los campos cambiaron de nombre.** Hoy, si la ANM renombra
  `CODIGO_EXPEDIENTE`, la búsqueda devuelve cero sin explicar por qué.

---

## 4. Los mapas de fondo no tienen alternativa declarada

**Estado:** abierto — y **ya pasó una vez**, en agosto de 2026.

Este riesgo estaba escrito así: «si CARTO deja de servir —es el fondo por
defecto—, el visor arranca con el mapa gris y sin decir nada». Ocurrió, y peor
que en gris: CARTO empezó a devolver sus teselas **atravesadas por un rótulo de
"API KEY REQUIRED"**, de lado a lado del mapa. No fue una caída ni un aviso
previo; fue un cambio de producto de un día para otro. Como era el fondo de
partida, todo el que abría el visor lo veía marcado.

Se resolvió cambiando ese fondo por el **lienzo gris claro de Esri**, del mismo
servicio que ya sirve la imagen de satélite: sin cuenta, sin proveedor nuevo y
sin permiso nuevo en la política de seguridad. Pero eso es tapar el agujero, no
cerrarlo: **el riesgo sigue abierto y ahora apunta a Esri**, que puede hacer
exactamente lo mismo.

Lo que la experiencia deja claro es que el aviso no basta: cuando pasó, las
teselas **llegaban con un 200**. Un mapa marcado no es un fallo de red y ningún
contador de errores lo habría detectado. Las dos cosas que sí ayudarían:

1. **Un fondo de respaldo declarado por cada fondo**, para poder cambiar de
   proveedor con una línea el día que haga falta —que es lo que costó esta vez, y
   fue barato justamente porque el módulo de fondos es una lista de datos.
2. **Mirar el visor de vez en cuando.** Suena a poco, pero esto se detectó porque
   alguien abrió la página, no porque saltara nada.

---

## 5. Concesión conocida en las cabeceras de seguridad

**Estado:** anotado a propósito, no urgente.

La política de contenido de `next.config.js` permite guiones incrustados
(`'unsafe-inline'` en `script-src`). Es lo que Next necesita para arrancar la
aplicación sin montar un intermediario que firme cada respuesta con un número de
un solo uso.

No es un agujero por sí solo —hace falta que además haya por dónde colar
contenido ajeno—, pero es la parte floja de una política que en todo lo demás es
estricta. Es la mejora natural el día que haya tiempo.

---

## Lo que ya se cerró

- **Cabeceras de seguridad.** El visor salía sin ninguna. Puestas y comprobadas
  en la versión publicada (2026-08-22).
- **Dependencias sin usar.** Ocho paquetes que nadie importaba, con 136
  dependencias detrás y once alertas de seguridad. Fuera (2026-08-22).
- **Comodines en la búsqueda.** Teclear `%%%` pasaba el mínimo de tres
  caracteres y barría el dataset nacional de la ANM. Arreglado (2026-08-22).
