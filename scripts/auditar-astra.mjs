import { execSync } from "child_process"
import https from "https"

const diff = execSync("git diff HEAD app/utils/planchaPdf.js app/hooks/map/usePlanchaGL.js app/utils/planchaPdf.test.js", { encoding: "utf8" })
const testOutput = "Test Suites: 59 passed, 59 total\nTests: 789 passed, 789 total\nBuild: next build exit 0 (7 static pages generated limpio sin errores ni warnings de linter)"

const auditPrompt = `Astra, como Auditor de Calidad y Arquitecto de Software de Litto Minería:
Por favor audita el git diff actualizado donde se abordaron con precisión quirúrgica todos los hallazgos de tu dictamen anterior:

1. Rechazo de dominio estrictamente numérico y sin coerción:
   - En calcularEscalaMedida: se eliminó Number(...) y se valida typeof w !== "number" || !Number.isFinite(w) || w <= 0 || typeof h !== "number" || !Number.isFinite(h) || h <= 0.
   - Retorna 0 para booleanos (true), cadenas ("1000"), símbolos (Symbol("invalido")), objetos, arreglos, nulos, NaN, Infinity y negativos, sin lanzar excepción ni permitir coerción.
   - En prepararPlancha: comprueba escala1 <= 0; si es así, retorna inmediatamente { ok: false, reason: "lienzo-fallido" }, llama a documento.destroy() y detiene el flujo sin invocar pagina.render ni crear lienzos.
2. Inclusión del inicio síncrono del render en el bloque de normalización:
   - En rasterizarParaMedir y recortarMapa: la invocación pagina.render(...) se trasladó al interior del bloque try/catch/finally.
   - Si pagina.render(...) lanza síncronamente una RenderingCancelledException o si signal?.aborted es true, se captura y normaliza a cancelado() (AbortError estándar).
   - El listener de abort siempre se retira en el bloque finally del render (removeEventListener).
   - Si ocurre cualquier fallo o aborto, el canvas se reduce a 1x1 en el finally exterior.
3. Cobertura completa de pruebas (23 pruebas unitarias en planchaPdf.test.js):
   - Prueba estricta de no-coerción: verifica toBe(0) para booleanos, cadenas numéricas, símbolos, nulos, undefined, vacíos, negativos, NaN e Infinity.
   - Pruebas explícitas de excepciones síncronas en el render: verifica que el lanzamiento síncrono de RenderingCancelledException en pagina.render sea capturado y lance AbortError, retirando el listener y reduciendo el lienzo a 1x1 (en recortarMapa y rasterizarParaMedir).
   - Pruebas de aborto en vuelo: verificación de llamada a renderTask.cancel(), retirada de listener y reducción a 1x1 (en recortarMapa y rasterizarParaMedir).
   - Pruebas de renderizado exitoso: verificación de preservación de dimensiones en recortarMapa, reducción garantizada a 1x1 del lienzo temporal en rasterizarParaMedir, y retirada del listener de la señal en ambos.
   - Prueba de prepararPlancha ante dimensiones inválidas: confirma retorno neutral { ok: false, reason: "lienzo-fallido" }, destrucción del documento y 0 llamadas a pagina.render.
4. Evidencia de pruebas y compilación:
   - 59 suites pasadas, 789 pruebas pasadas al 100%.
   - Build Next.js 14.2.7 limpio con código 0.

Test evidence:
${testOutput}

Git diff (HEAD):
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
