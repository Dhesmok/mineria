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

## 2. TAREA PENDIENTE PRIORIDAD 1: Correcciones de Astra en demTiles y measure

En la auditoría de GitHub Codespaces, Astra diagnosticó los siguientes casos límite críticos que quedaron pendientes de guardar e implementar:

### A. `app/utils/demTiles.js`:
1. **Desbordamiento de índices en bordes:** En `tileRangeFor`, coordenadas límite de 180° o latitudes extremas de Mercator producen índices `minX = 2 ** zoom` o desbordamientos fuera de rango. Deben acotarse estrictamente a `[0, 2^zoom - 1]`.
2. **Píxeles transparentes en elevación:** En `pasteTile`, si el proveedor entrega transparencia (canal alfa = 0) como "sin dato", no debe interpretarse como elevación 0 falsa, sino manejarse como sin dato / nulo.
3. **Sensibilidad a infinitos en `maxAround`:** Un único `Infinity` no debe forzar el resultado a `null` si existen alturas finitas y válidas alrededor.

### B. `app/utils/measure.js`:
1. **Contornos y huecos en polígonos:** En `polygonArea`, asegurar la identificación rigurosa del anillo exterior frente a los huecos interiores para evitar que un hueco se cuente accidentalmente como superficie exterior.
2. **Retorno seguro:** Mantener retorno numérico seguro (`0`) en geometrías inválidas o nulas para no romper las acumulaciones de los hooks de dibujo (`useDrawControlGL`).

### C. Pruebas unitarias:
- Añadir y actualizar los casos de prueba en `app/utils/demTiles.test.js` y `app/utils/measure.test.js`.
- Verificar que el 100% de las 54 suites de prueba pasen (`npm test`).

---

## 3. Ciclo Obligatorio de Desarrollo (4 Fases)

```text
[Astra] Contrato & Alcance  ──▶  [Gemini] Código & Tests Locales  ──▶  [Astra] Auditoría de Diff  ──▶  [Fabio] Prueba en Celular & OK
```

1. **Fase 1 (Contrato Astra):** Se consulta a Astra con el requerimiento. Astra define alcance y criterios de aceptación.
2. **Fase 2 (Implementación Gemini):** Gemini escribe el código local y corre las 54 suites de prueba (`npm test`).
3. **Fase 3 (Auditoría Astra):** Gemini envía a Astra un paquete compacto (~400 tokens) con el `git diff` exacto y resultado de tests para recibir su dictamen (APROBADO / CAMBIOS NECESARIOS).
4. **Fase 4 (Entrega y Validación Fabio):** `git push origin <rama_de_trabajo>`. Vercel genera la Vista Previa para que Fabio pruebe en su celular. No hacer merge a main sin el OK de Fabio.

---

## 4. Reglas Antialucinación
- Cero afirmaciones de "solucionado" sin adjuntar evidencia técnica real (`npm test` en verde y `git diff`).
