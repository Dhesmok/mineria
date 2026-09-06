# Protocolo de Trabajo del Proyecto (Astra • Gemini • Fabio)

Este archivo es leído automáticamente por Antigravity en cada nueva sesión para mantener la memoria, reglas y contexto del proyecto sin necesidad de reexplicarlo.

---

## 1. Estructura y Roles del Equipo

1. **Astra (`gpt-6-astra` vía Experiential Labs API)**:
   - **Rol:** Arquitecto de Software, Diseñador Principal UI/UX y Auditor de Calidad.
   - **Acceso:** Se consulta mediante scripts de Node.js contra `https://api.experientiallabs.ai/v1/chat/completions` usando `process.env.EXPLABS_API_KEY`.
   - **Responsabilidad:** Diseñar la arquitectura, definir los criterios de aceptación y auditar los `git diff` compactos.

2. **Antigravity (Gemini / Asistente Local)**:
   - **Rol:** Ingeniero Ejecutor.
   - **Acceso:** Sistema de archivos local, terminal de Windows/Linux, Git y suites de prueba.
   - **Responsabilidad:** Escribir el código, ejecutar `npm test`, compilar (`npm run build`), presentar evidencia técnica y hacer `git push`.

3. **Fabio**:
   - **Rol:** Dueño de Producto y Aprobador Supremo.
   - **Responsabilidad:** Probar en vivo en su celular la Vista Previa (Preview URL) de Vercel y autorizar los merges a `main`.

---

## 2. Ciclo Obligatorio de Desarrollo (4 Fases)

Cualquier cambio de interfaz, visualización o lógica debe seguir estrictamente este ciclo:

```text
[Astra] Contrato & Alcance  ──▶  [Gemini] Código & Tests Locales  ──▶  [Astra] Auditoría de Diff  ──▶  [Fabio] Prueba en Celular & OK
```

### Fase 1: Contrato (Astra)
- Antes de escribir código, se consulta a Astra con el requerimiento de Fabio.
- Astra define el contrato: objetivo, archivos permitidos y criterios de aceptación (casos normales y casos límite).

### Fase 2: Implementación y Pruebas (Gemini)
- Gemini escribe el código en los archivos locales sin improvisar fuera del alcance definido por Astra.
- Se ejecutan las pruebas locales (`npm test`) y la compilación (`npm run build`). Todo debe dar código de salida 0.

### Fase 3: Auditoría Ligera (Astra)
- Para ahorrar tokens (límite de 100k/hora), Gemini **NUNCA envía archivos enteros** a Astra.
- Gemini envía a Astra un paquete ultracompacto (~400 tokens):
  1. Resumen de 2 líneas.
  2. Resultado de `npm test` (salida limpia sin logs masivos).
  3. `git diff` exacto de las líneas modificadas.
- Astra dictamina: **APROBADO** o **CAMBIOS NECESARIOS**.

### Fase 4: Despliegue en Vercel y Aprobación Visual (Fabio)
- Gemini hace `git push origin <rama_de_trabajo>`.
- Vercel genera automáticamente el enlace de Vista Previa (Preview URL).
- Fabio prueba la aplicación en su teléfono móvil (Android/iOS) o navegador.
- **Regla de oro:** No se hace merge a `main` hasta que Fabio confirme que visual y funcionalmente está perfecto.

---

## 3. Reglas Antialucinación y Calidad
- **Cero afirmaciones sin evidencia:** Gemini tiene prohibido afirmar que algo está "solucionado" o "funciona perfecto" sin mostrar el resultado de los tests y el `git diff`.
- **Preservación de tests:** Las 54 suites de pruebas unitarias existentes (735+ tests) deben permanecer pasando al 100%.
