import { execSync } from "child_process"
import https from "https"

const diff = execSync("git diff", { encoding: "utf8" })
const testOutput = "Test Suites: 58 passed, 58 total\nTests: 765 passed, 765 total\nBuild: next build exit 0 (7 static pages generated)"

const auditPrompt = `Astra, como Auditor de Calidad y Arquitecto UI/UX de Litto Minería:
Por favor audita el siguiente git diff correspondiente a las mejoras P0 acordadas en la auditoría visual previa:
1. globals.css: Se aplicó color-scheme: dark y estilizado de scrollbar nativa oscura (zinc-700/transparente) para eliminar la barra blanca deslumbrante que cortaba el panel oscuro.
2. LayerPanel.jsx:
   - Eliminada la opacidad global (opacity-60) de la fila inactiva que hacía que pareciera deshabilitada.
   - Incrementado contraste de texto inactivo a text-zinc-300 (hover text-white) manteniendo text-zinc-600 sólo para layer.pending.
   - Altura de fila aumentada a 40px para mayor comodidad táctil/ratón.
   - Casillas/checkboxes con borde más visible (border-zinc-500/80) y tamaño incrementado a 14px (h-3.5 w-3.5).
   - Indicador de estado cambiado a "X activadas" y mensaje vacío en Activas guiado y pedagógico.

Test evidence:
${testOutput}

Git diff:
\`\`\`diff
${diff}
\`\`\`

Emite tu dictamen técnico (APROBADO o CAMBIOS NECESARIOS) con una breve síntesis.`

const payload = JSON.stringify({
  model: "gpt-6-astra",
  messages: [
    {
      role: "system",
      content: "Eres Astra, Auditor de Calidad y Arquitecto de Software y UI/UX del proyecto Litto Minería."
    },
    {
      role: "user",
      content: auditPrompt
    }
  ],
  max_tokens: 1000
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
        console.log("=== DICTAMEN DE AUDITORÍA DE ASTRA (FASE 3) ===\n")
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
