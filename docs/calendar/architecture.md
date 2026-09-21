# Calendario Electoral

El calendario vive dentro de Planificación y usa la colección histórica `organizations/{orgId}/campaigns/{campId}/calendar`. La migración es aditiva: los documentos antiguos con `date`, `title`, `type` y `description` se normalizan en lectura a `startAt`, `endAt`, `status`, `participants`, `resourceIds` y `revision`.

La API Node es la única escritora. `GET /calendar` entrega la agenda, mientras que creación, edición, cancelación, reservas, plantillas y respuestas pasan por rutas autenticadas y Admin SDK. La UI usa FullCalendar para mes, semana, día y agenda; sus cambios por arrastre son propuestas que vuelven al backend con `expectedRevision`.

No se encontró un módulo de Ágoras ni WireFlow en este repositorio. Por lo tanto no se fabrican enlaces ni automatizaciones simuladas: esas integraciones permanecen explícitamente pendientes hasta que exista su contrato de API real.
