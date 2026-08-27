/**
 * Configuración de Next y **cabeceras de seguridad**.
 *
 * El proyecto no tenía este archivo. Eso significaba que el visor salía a
 * internet sin ninguna cabecera de seguridad: cualquiera podía meterlo en un
 * marco dentro de otra página y hacerlo pasar por suyo, y si algún día se colara
 * contenido ajeno en la página, el navegador no tendría ninguna instrucción
 * sobre qué puede y qué no puede cargar.
 *
 * **La cabecera que hay que mirar con lupa es la política de contenido (CSP).**
 * No es como las demás: las otras prohíben cosas que el visor no hace, mientras
 * que esta declara **la lista completa de servidores con los que sí habla**. Si
 * a esa lista le falta uno, el navegador bloquea la petición y no pasa nada
 * visible: el mapa se queda gris, o las capas no aparecen, sin un solo error que
 * apunte a la causa. Es la misma clase de fallo silencioso que el worker de
 * MapLibre (trampa nº 7 del CLAUDE.md).
 *
 * Por eso la lista de abajo no está escrita de memoria: sale de recorrer el
 * código buscando cada dirección, y está comprobada abriendo el visor y viendo
 * que no aparece ni una violación en la consola.
 *
 * **Si añades una capa nueva de otra entidad —IGAC, SGC, ANLA—, su servidor
 * tiene que entrar aquí.** Es el único sitio del proyecto donde hay que
 * acordarse de eso, y por eso está dicho tan alto.
 */

/**
 * De dónde vienen las teselas de los mapas de fondo.
 *
 * Los subdominios se declaran con comodín porque el visor reparte las peticiones
 * entre varios (`a.`, `b.`, `c.`, `d.`) para que el navegador las haga en
 * paralelo.
 *
 * Nota aparte sobre Google: `mt0-3.google.com/vt` es un extremo interno suyo, no
 * su API publicada. Ponerlo aquí es reconocer una dependencia cuyas condiciones
 * de uso están sin resolver; queda anotado como riesgo, no zanjado.
 */
const TESELAS = [
  "https://tile.openstreetmap.org",
  "https://*.tile.opentopomap.org",
  "https://mt0.google.com",
  "https://mt1.google.com",
  "https://mt2.google.com",
  "https://mt3.google.com",
  "https://server.arcgisonline.com",
]

/**
 * Los servicios que responden con datos, no con imágenes.
 *
 * El modelo de elevación se acota al depósito concreto y no a todo
 * `s3.amazonaws.com`, que sería abrir la puerta a cualquier bucket del mundo.
 */
const SERVICIOS = [
  "https://annamineria.anm.gov.co",
  "https://geo.anm.gov.co",
  "https://s3.amazonaws.com/elevation-tiles-prod/",
]

/**
 * La política de contenido.
 *
 * Cuatro decisiones que conviene entender antes de tocarla:
 *
 * 1. **Las teselas van en `img-src` y también en `connect-src`.** MapLibre no
 *    siempre pide las imágenes con una etiqueta `<img>`: para poder leer sus
 *    píxeles —que es lo que hace con el modelo de elevación— las pide por la vía
 *    de los datos. Declararlas solo como imágenes deja el relieve sin cargar.
 *
 * 2. **`blob:` y `data:` son necesarios, no un descuido.** MapLibre arranca su
 *    hilo de trabajo desde un `blob:`, la capa de pendiente se pinta metiendo un
 *    lienzo en el mapa como imagen `data:`, y la exportación de imagen entrega
 *    el archivo por un `blob:`. Quitar cualquiera de los dos rompe una función
 *    entera sin decir por qué.
 *
 *    Y van en `connect-src` además de en `img-src`, que es donde parecería que
 *    bastan. La primera versión de este archivo solo los puso como imágenes y la
 *    capa de pendiente dejó de dibujarse: el navegador decía «Refused to connect
 *    to 'data:image/png…'» y nada más. Lo cazó la comprobación en el navegador,
 *    no la lectura del código — que es exactamente el motivo de que exista esa
 *    comprobación.
 *
 * 3. **`'unsafe-inline'` en los guiones es una concesión, y hay que decirlo.**
 *    Next incrusta en la página un guion propio para arrancar la aplicación, y
 *    sin firmarlo con un número de un solo uso el navegador lo rechazaría. Esas
 *    firmas exigen montar un intermediario que reescriba cada respuesta, que es
 *    bastante maquinaria; se deja anotado como lo siguiente que subir de nivel.
 *
 * 4. **`'unsafe-eval'` solo en desarrollo.** Lo necesita el recargado en
 *    caliente de Next mientras se programa. En lo que se publica no está.
 */
const politicaDeContenido = (desarrollo) =>
  [
    "default-src 'self'",
    "base-uri 'self'",
    "form-action 'self'",
    // Nadie puede meter este visor dentro de un marco. Si algún día conviene que
    // una entidad lo empotre en su portal, se cambia por la lista de quiénes.
    "frame-ancestors 'none'",
    "object-src 'none'",
    `img-src 'self' data: blob: ${TESELAS.join(" ")}`,
    `connect-src 'self' data: blob: ${[...SERVICIOS, ...TESELAS].join(" ")}`,
    "worker-src 'self' blob:",
    // Para navegadores viejos que no entienden `worker-src`.
    "child-src 'self' blob:",
    "style-src 'self' 'unsafe-inline'",
    "font-src 'self' data:",
    `script-src 'self' 'unsafe-inline'${desarrollo ? " 'unsafe-eval'" : ""}`,
    "manifest-src 'self'",
  ].join("; ")

const cabeceras = (desarrollo) => [
  {
    key: "Content-Security-Policy",
    value: politicaDeContenido(desarrollo),
  },
  {
    /**
     * Qué APIs del navegador puede usar la página.
     *
     * **Las tres primeras no son opcionales en este visor.** La ubicación la usa
     * el botón de GPS, y el acelerómetro, el giroscopio y el magnetómetro los
     * usa la brújula de 360°, que lee la orientación del teléfono. Bloquearlas
     * —que es lo que hace la plantilla de seguridad que circula por ahí— apagaría
     * las dos funciones que más se usan en campo, y sin ningún aviso.
     *
     * Lo demás se niega porque el visor no lo usa: si algún día lo usara, se
     * quita de esta lista a conciencia.
     */
    key: "Permissions-Policy",
    value: [
      "geolocation=(self)",
      "accelerometer=(self)",
      "gyroscope=(self)",
      "magnetometer=(self)",
      "camera=()",
      "microphone=()",
      "payment=()",
      "usb=()",
      "interest-cohort=()",
    ].join(", "),
  },
  {
    // El navegador respeta el tipo que declara el servidor en vez de adivinarlo
    // por el contenido. Adivinar es como un archivo subido acaba ejecutándose.
    key: "X-Content-Type-Options",
    value: "nosniff",
  },
  {
    // Lo mismo que `frame-ancestors`, para los navegadores que no lo entienden.
    key: "X-Frame-Options",
    value: "DENY",
  },
  {
    // Al salir a otro sitio —el perfil del autor en LinkedIn— se manda el
    // dominio, no la dirección completa con lo que el usuario estuviera mirando.
    key: "Referrer-Policy",
    value: "strict-origin-when-cross-origin",
  },
  {
    /**
     * Obliga a entrar por HTTPS durante dos años.
     *
     * **Sin `preload` y sin `includeSubDomains`, a propósito.** `preload` es una
     * puerta de una sola dirección: entrar en la lista que traen los navegadores
     * de fábrica es fácil y salir lleva meses. Y `includeSubDomains` alcanzaría a
     * cualquier otro subdominio del dominio propio, que puede no estar en HTTPS y
     * quedaría inaccesible. Las dos se pueden añadir cuando se sepa que no
     * estorban; hoy no se sabe.
     */
    key: "Strict-Transport-Security",
    value: "max-age=63072000",
  },
]

/** @type {import('next').NextConfig} */
module.exports = {
  async headers() {
    const desarrollo = process.env.NODE_ENV === "development"
    return [{ source: "/:path*", headers: cabeceras(desarrollo) }]
  },
}
