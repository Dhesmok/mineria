import fs from "fs"
import https from "https"

const imgPath = "C:/Users/fabio/.gemini/antigravity/brain/a36e747c-7f8f-4ba1-8c28-102402acd354/.user_uploaded/media_1788741505278.jpg"
const base64Img = fs.readFileSync(imgPath).toString("base64")

const promptText = `Astra, como Arquitecto de Software y Diseñador Principal UI/UX del proyecto Litto Minería:

Fabio nos ha dado retroalimentación directa sobre la visión del proyecto y una nueva captura con capas activas:
1. La estética del visor busca ser intencionalmente MINIMALISTA, moderna y sobria (negro obsidiana, contrastes controlados), alejándose por completo de visores burocráticos y saturados como Colombia en Mapas (IGAC).
2. El buscador arriba es una bahía flotante interactiva que se expande al pasar el ratón (hover) o enfocar, para no invadir el mapa satelital mientras se navega.
3. En la captura se aprecian dos capas encendidas en Minería ("Títulos Vigentes" y "Solicitudes Vigentes") con sus polígonos, etiquetas y sliders de opacidad.

Fabio te hace dos consultas específicas:
1. ¿El esquema de color que tiene actualmente (paleta obsidiana/zinc de fondo, bordes, tonos de texto y muestras de color de capas) es correcto o se puede pulir más para ganar todavía más elegancia y precisión profesional sin perder el minimalismo?
2. ¿Qué opinas de colocar junto al botón de fijar (pin) en la cabecera del cajón de capas un botón con icono de bombillo (o sol/luna) para alternar entre tema oscuro y claro? ¿Cómo impactaría esto la visualización cartográfica (mapa satelital, geología y títulos mineros) y cuál sería tu recomendación de diseño/UX para este control?
3. Criterios de aceptación para:
   - Botón de cambio de tema (bombillo/luz) junto al pin.
   - Atajo de teclado ('/' o 'Ctrl+K') para desplegar y enfocar el buscador tipo bahía.

Por favor responde con tu dictamen técnico y de diseño.`

const payload = JSON.stringify({
  model: "gpt-6-astra",
  messages: [
    {
      role: "system",
      content: "Eres Astra, Arquitecto de Software, Diseñador Principal UI/UX y Auditor de Calidad del proyecto Litto Minería."
    },
    {
      role: "user",
      content: [
        { type: "text", text: promptText },
        { type: "image_url", image_url: { url: "data:image/jpeg;base64," + base64Img } }
      ]
    }
  ],
  max_tokens: 3000
})

const req = https.request("https://api.experientiallabs.ai/v1/chat/completions", {
  method: "POST",
  headers: {
    "Content-Type": "application/json",
    "Authorization": "Bearer " + process.env.EXPLABS_API_KEY
  }
}, (res) => {
  let body = ""
  res.on("data", (chunk) => { body += chunk })
  res.on("end", () => {
    try {
      const parsed = JSON.parse(body)
      if (parsed.choices && parsed.choices[0]) {
        console.log("=== DICTAMEN DE ASTRA: COLOR Y TEMA CLARO/OSCURO ===\n")
        console.log(parsed.choices[0].message.content)
      } else {
        console.error("Respuesta inesperada de Astra:", body)
      }
    } catch (err) {
      console.error("Error al parsear respuesta:", err, body)
    }
  })
})

req.on("error", (e) => console.error("Error de red:", e.message))
req.write(payload)
req.end()
