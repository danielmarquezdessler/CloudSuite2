# Resultados de pruebas

Este documento se completa con los resultados de la suite `test:e2e:calendar`, build de frontend/backend y `test:padding-audit` de cada entrega. La suite usa Firebase Auth, API y Firestore del entorno E2E; no intercepta HTTP.
# Resultados de pruebas

- `server/npm run build`: correcto.
- `web/npm run build`: correcto.
- `web/npm run test:e2e:calendar`: correcto contra Firebase Auth, API Node y Firestore reales. Cubre creación/edición persistida, control de revisión, recursos, plantillas, disponibilidad, vistas y exportación ICS; los datos creados se eliminan al terminar.
- `web/npm run test:padding-audit`: pendiente de la corrida final conjunta antes de publicación.
