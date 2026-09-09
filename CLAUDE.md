# CloudSuite 2

CloudSuite 2 es un SaaS de gestión de campañas políticas. La aplicación no tiene home pública: su puerta de entrada es el login.

## Stack

- Frontend: React, TypeScript, Vite y Bootstrap 5, basado en el template LightAble.
- Backend: Node.js, TypeScript, Express, Firebase Admin SDK y Firestore; preparado para Cloud Run.
- Autenticación: Firebase Authentication mediante email y contraseña.

## Estructura

- `web/`: frontend React.
- `server/`: API backend Node/TypeScript.
- `_reference/`: material de consulta de LightAble; no modificar ni versionar.

## Reglas de oro para Firestore

1. Las escrituras sensibles pasan por el backend Node con Admin SDK, nunca directo desde el navegador.
2. Los permisos viven en custom claims del token, no en consultas dentro de las security rules.
3. Cada campaña vive en su propia subcolección para aislamiento total.

## Regla para editar el template

Antes de editar cualquier archivo existente del template, abrilo y leé su contenido real. Si el cambio es grande, reemplazá el archivo completo en base a ese contenido; nunca apliques un patch contra contenido asumido.

## Regla obligatoria de espaciado

Ningún componente puede renderizar dos o más elementos hermanos (bloques de texto o botones/acciones) sin envolverlos en `Stack` (vertical) o `Inline` (horizontal). Está prohibido usar `margin` o `gap` hardcodeado a mano para separar elementos hermanos dentro de una card. Si necesitás separar algo, usá estos componentes; si no alcanzan para el caso, avisá antes de improvisar un valor nuevo.

## Testing E2E real local

- El usuario persistente de pruebas es `e2e-test@cloudsuite.local`. Sus credenciales y los IDs de su organización/campaña viven exclusivamente en `web/.env.test`, un archivo ignorado por Git; nunca se copian al código ni a la documentación versionada.
- `npm run test:e2e` desde `web/` ejecuta `scripts/test-e2e-real.mjs`: usa Firebase Auth, la API Node y Firestore reales, inicia Vite en el puerto 5188 y levanta la API en 8080 únicamente si no hay una API sana. No intercepta ni simula HTTP.
- Para regenerar el entorno, eliminá solo el usuario E2E en Firebase Authentication y su organización de prueba indicada por `web/.env.test` en Firestore; luego eliminá o vaciá ese archivo local y ejecutá `npm run test:e2e`. Se requiere ADC local vigente con `gcloud auth application-default login`.

## Estado actual

- Monorepo creado con frontend y backend separados, rebrandeado con la identidad visual de CloudSuite y su logo.
- Firebase Authentication implementado: login, registro de cliente, contexto de sesión, logout y guardas de rutas privadas.
- El registro ejecuta secuencialmente la creación de usuario, bootstrap de organización, refresco del token con claims y navegación al dashboard.
- La guarda de `/register` no redirige durante el bootstrap; `GET /api/me` tolera la breve propagación de claims usando la membresía propia como respaldo.
- El backend usa Firebase Admin SDK con ADC, valida tokens y expone el bootstrap multi-campaña y `GET /api/me`.
- Firestore usa reglas desplegadas basadas exclusivamente en custom claims; las escrituras sensibles quedan reservadas al backend.
- El dashboard muestra organización y campaña reales, permite recuperar un bootstrap incompleto y el header/sidebar muestran el usuario y rol autenticados, sin datos demo.
- Módulo Organización listo: Funciones y Equipos con CRUD, miembros de campaña, invitaciones firmadas y aceptación pública con alta segura por backend.
- Conversión electoral incorporada: importación CSV/XLSX, deduplicación, visitas con historial y conversión, lista de electores, mapa y guardado local de visita.
- Dashboard de campaña cerrado: métricas agregadas con caché de cinco minutos, evolución de 30 días, gráficos ApexCharts, comparativa por equipo, ranking de militantes y exportación Excel.
- Control de Revisión append-only implementado para las operaciones principales; los eventos se guardan desde el backend y solo Cliente/admin puede consultarlos o exportarlos.
- Notificaciones internas persistentes incorporadas: seed de bienvenida al bootstrap, campanita con contador, inbox, marcado de lectura, archivado y toast temporal.
- Preguntas de visita configurables listas: conjuntos activos por campaña, editor de Cliente/admin y carga dinámica en la visita con cinco preguntas fallback.
- Planificación incorporada: calendario, circuito/zona territorial, metas dinámicas, rutas, encuestas, presupuesto y asesor con sugerencias persistentes; todas sus escrituras pasan por la API Admin SDK.
- E2E real de Organización incorporado: login Firebase persistente y comprobaciones sin mocks de creación y recarga de Funciones, Equipos e Invitaciones contra Firestore.
- Sistema de espaciado estructural incorporado: `Stack` e `Inline` centralizan la separación interna de cards, textos y acciones.
