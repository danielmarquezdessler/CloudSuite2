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
- Para regenerar el entorno, eliminá solo el usuario E2E en Firebase Authentication y su organización de prueba indicada por `web/.env.test` en Firestore; luego eliminá o vaciá ese archivo local y ejecutá `npm run test:e2e`. Usá la cuenta de servicio local documentada abajo; ADC queda únicamente como alternativa temporal cuando esa credencial todavía no fue configurada.

## Credencial de desarrollo local

- La credencial local preferida es la cuenta de servicio `cloudsuite-local-dev@politicfy-cloudsuite.iam.gserviceaccount.com`. Tiene únicamente `roles/datastore.user` en el proyecto y `roles/storage.objectAdmin` sobre el bucket `politicfy-cloudsuite.firebasestorage.app`; Cloud Run conserva su identidad de producción.
- Para crear o regenerar la clave, con una cuenta que tenga permisos IAM sobre `politicfy-cloudsuite`, ejecutar `node scripts/setup-local-dev-service-account.mjs` desde la raíz. El script genera `server/.secrets/local-dev-key.json` (ignorado por Git) y añade `GOOGLE_APPLICATION_CREDENTIALS=./.secrets/local-dev-key.json` a `server/.env`, sin imprimir secretos.
- Después reiniciar el backend y comprobar `GET http://127.0.0.1:8080/health`. Si hay que revocar una clave, borrarla desde IAM/Service Accounts y volver a ejecutar el script para generar otra.

## Cómo desplegar a producción

- Plataforma: Cloud Run (`cloudsuite-api`) y Firebase Hosting, ambos en el proyecto `politicfy-cloudsuite`; Cloud Run se publica en `southamerica-east1` y usa la cuenta `cloudsuite-api@politicfy-cloudsuite.iam.gserviceaccount.com`.
- Requisitos locales: `gcloud auth login`, `gcloud auth application-default login`, `firebase login --reauth`, Docker/Cloud Build habilitado y `web/.env` con la configuración Firebase pública y `VITE_GOOGLE_MAPS_API_KEY`.
- Los secretos nunca se copian al repositorio ni se imprimen. Maps y Gemini se cargan en Secret Manager desde sus `.env` locales con el procedimiento operativo vigente. Para cargar o rotar Resend se ejecuta `node scripts/set-resend-secret.mjs`, que solicita la clave por terminal y la guarda directamente como `RESEND_API_KEY` en Secret Manager.
- Despliegue completo: desde la raíz, ejecutar `node scripts/deploy-production.mjs`. El script construye y publica la imagen en Artifact Registry, despliega Cloud Run con secretos inyectados, consulta su URL, compila `web/` con `VITE_FIREBASE_API_URL` apuntando a esa URL y publica Firebase Hosting.
- La organización restringe bindings IAM para `allUsers`; por eso el script usa `--no-invoker-iam-check` en Cloud Run en lugar de crear un binding `roles/run.invoker` público. El backend mantiene la autenticación Firebase propia para todos los endpoints sensibles.
- La API recibe `APP_URL=https://app.politicfy.com` y `WEB_ORIGINS` con el dominio productivo, los dos dominios por defecto de Firebase y los orígenes locales. Los valores `localhost` que permanecen en código son únicamente fallbacks de desarrollo cuando falta la variable de entorno.
- Antes de anunciar un despliegue, comprobar `GET <Cloud Run URL>/health`, abrir `https://politicfy-cloudsuite.web.app`, iniciar sesión real y crear un dato de prueba mediante la interfaz. Para el dominio personalizado, usar exclusivamente los registros DNS que Firebase Hosting muestre en ese momento; nunca inventar registros.

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
- Configuración de producción preparada: Firebase Hosting sirve `web/dist` con rewrite SPA; scripts reproducibles construyen/despliegan Cloud Run y Hosting sin versionar secretos.
- Primer despliegue de producción completado: API en Cloud Run con health y Firestore verificados, Firebase Hosting operativo y prueba E2E real de login, `/api/me` y creación de Función contra Firestore.
- PWA offline incorporada: el shell de CloudSuite es instalable, la lista de electores se cachea en IndexedDB y cada visita se guarda primero en un borrador local con cola FIFO que se sincroniza automáticamente al recuperar conexión.
- Candidatos por campaña incorporados: CRUD con fotos en Storage, candidato Principal para personalizar la decisión de visita y reinicio confirmado de métricas sin eliminar el historial de visitas.
