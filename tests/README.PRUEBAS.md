# DOCE — Pruebas automatizadas para el MVP (17/11/2026)

Paquete preparado con base en `re-remix-doce---mvp-adecuación-2026.zip`. **No modifica los archivos del dominio, UI, backend ni persistencia**. Añade únicamente archivos de pruebas y, opcionalmente, scripts `npm`.

## Requisitos

- Node.js 22 o compatible y npm.
- Dependencias del proyecto instaladas (`npm install` desde la raíz del proyecto). **No ejecutar los tests de API contra un servidor abierto o real.**
- No es necesaria una clave Gemini. Los tests arrancan un servidor propio con `GEMINI_API_KEY=''`.

## Comandos (desde la raíz de DOCE)

```bash
npm run test:domain       # 5 pruebas de dominio originales
npm run test:perfiles     # 8 pruebas nuevas de persistencia
npm run test:api          # 13 pruebas nuevas HTTP
npm run test:smoke        # agrupa dominio + perfiles + API
npm run test:security     # auditoría: fallos esperados con PRE ETAPA 3
```

Los tests de **perfil y API usan carpetas temporales** para aislar los archivos `perfiles-estudio.json` y no alterar perfiles de demostración. Los de API inician Node/Express en un puerto libre con `NODE_ENV=production` y lo detienen al finalizar. No tocan servicios externos. La suite de auditoría usa su propio proceso aislado y contiene solicitudes que, si el prototipo es vulnerable, pueden modificar **exclusivamente los datos sintéticos en memoria de ese proceso temporal**.

## Resultados esperados

| Grupo | Cantidad | Resultado esperado | Motivo |
|---|---:|---|---|
| Dominio original | 5 | Aprobar | Clases, riesgo exploratorio, alertas, DOC, tutor |
| Persistencia | 8 | Aprobar | Escritura, recuperación, concurrencia, corrupción, rollback, onboarding |
| API | 13 | Aprobar | Sesiones, perfil, autorización cruzada, DOC fallback, privacidad de archivo, reinicio |
| Auditoría seguridad | 6 | **Fallar donde exista una vulnerabilidad** | Acceso anónimo a Tutorías, contraseña, laboratorio, DOC, intervenciones |

**Importante:** una suite de auditoría con fallos no significa que las pruebas estén mal. Expone que el prototipo todavía no cumple esos requisitos de seguridad. No mostrarlo como sistema autorizado para operar con datos reales.

## Qué NO demuestran estas pruebas

- No prueban la conexión real a Gemini: las pruebas de DOC fuerzan el fallback para ser reproducibles y no consumir cuotas. La integración real debe probarse en video con una clave válida y con autorización.
- No prueban el aspecto visual ni la interacción completa en navegador (Playwright/Cypress no están instalados).
- No validan un modelo predictivo entrenado: la clase actual funciona como simulador de puntuación exploratoria.
- No verifican robustez de producción o supervivencia de datos tras reciclado del contenedor.

## Integración GitHub recomendada

1. Crear una rama nueva **`pruebas-automatizadas-doce`** dentro del fork, desde `Desarrollo` (o desde la versión de `Desarrollo` después de fusionar la PR de portada).
2. Copiar la carpeta `tests/` y agregar solamente los scripts `test:*` en `package.json`.
3. Verificar en **Files changed** que no cambiaron `server.ts`, `src/domain/models.ts`, `src/App.tsx`, `LoginView.tsx` ni otros archivos funcionales.
4. Crear Pull Request contra `BalleMartin/Proyecto-Doce`, rama `Desarrollo`.
5. Adjuntar los resultados `npm run test:smoke` y `npm run test:security`, diferenciando aprobaciones de hallazgos.

## Cómo repetir evidencia de ejecución

En Windows PowerShell o terminal de VS Code, desde la carpeta raíz del proyecto:

```bash
npm run test:smoke > resultado-pruebas.txt 2>&1
npm run test:security > hallazgos-seguridad.txt 2>&1
```

El segundo comando puede devolver código de salida 1 porque sus afirmaciones de seguridad **deliberadamente exigen protección que puede faltar**.

No subir `.env`, el directorio `.doce-data`, `node_modules`, tokens ni archivos con datos personales.
