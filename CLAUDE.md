# CloudSuite 2

CloudSuite 2 es un SaaS de gestión de campañas políticas. La aplicación no tiene home pública: su puerta de entrada es el login.

## Stack

- Frontend: React, TypeScript, Vite y Bootstrap 5, basado en el template LightAble.
- Backend: Node.js, TypeScript y Express, preparado para Cloud Run.
- Próximas integraciones: Firebase Authentication, Firestore con Admin SDK y Resend.

## Estructura

- `web/`: frontend React.
- `server/`: API backend Node/TypeScript.
- `_reference/`: material de consulta de LightAble; no modificar ni versionar.

## Reglas de oro para Firestore

1. Las escrituras sensibles pasan por el backend Node con Admin SDK, nunca directo desde el navegador.
2. Los permisos viven en custom claims del token, no en consultas dentro de las security rules.
3. Cada campaña vive en su propia subcolección para aislamiento total.

## Estado actual

- Monorepo creado con frontend y backend separados.
- Frontend rebrandeado para CloudSuite, con Rubik, paleta corporativa, login como raíz, toggle claro/oscuro y placeholder de logo.
- Submit de login temporal que redirige al dashboard vacío; Firebase queda pendiente para el Brief 2.
- Backend mínimo con `GET /health`, puerto configurable mediante `PORT`, Dockerfile para Cloud Run y variables de entorno de ejemplo.
