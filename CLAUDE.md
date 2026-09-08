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

## Estado actual

- Monorepo creado con frontend y backend separados, rebrandeado con la identidad visual de CloudSuite y su logo.
- Firebase Authentication implementado: login, registro de cliente, contexto de sesión, logout y guardas de rutas privadas.
- El registro ejecuta secuencialmente la creación de usuario, bootstrap de organización, refresco del token con claims y navegación al dashboard.
- El backend usa Firebase Admin SDK con ADC, valida tokens y expone el bootstrap multi-campaña y `GET /api/me`.
- Firestore usa reglas desplegadas basadas exclusivamente en custom claims; las escrituras sensibles quedan reservadas al backend.
- El dashboard muestra organización y campaña reales, permite recuperar un bootstrap incompleto y el header/sidebar muestran el usuario y rol autenticados, sin datos demo.
