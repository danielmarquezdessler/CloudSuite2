# Despliegue

Publicar en este orden: build de backend y frontend, `firebase deploy --only firestore:rules`, y `node scripts/deploy-production.mjs` desde la raíz. Luego verificar `/health`, login real y una creación/cancelación de evento en una campaña QA; los datos QA deben llevar `testRunId` y eliminarse al finalizar.
