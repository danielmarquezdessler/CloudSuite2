# Modelo de datos

## Evento

`calendar/{eventId}` conserva compatibilidad con `date` y agrega `startAt`, `endAt`, `allDay`, `timezone`, `status`, `visibility`, `priority`, `participants[]`, `teamIds[]`, `resourceIds[]`, `location`, `preparationMinutes`, `teardownMinutes`, `runOfShow[]`, `reminders[]`, `revision`, auditoría y cancelación. Las fechas son ISO UTC; la interfaz presenta `America/Argentina/Buenos_Aires` por defecto.

## Recursos y plantillas

`calendarResources/{resourceId}` contiene `name`, `type`, `quantity`, `reservations[]` y estado lógico. Cada reserva se verifica y escribe dentro de una transacción Firestore para impedir doble reserva concurrente.

`calendarTemplates/{templateId}` contiene un nombre y el esqueleto reusable del evento (duración, tipo, equipos, recursos, preparación y run-of-show).

`calendarIdempotency/{operationHash}` es privado para el backend y asocia actor, operación, hash del payload y `eventId`. Reintentar la misma creación con la misma clave devuelve el evento original; reutilizar la clave con contenido diferente falla con conflicto.

Las tareas SmartPlanner, rutas y equipos no se duplican en esta colección: el calendario sólo guarda sus referencias cuando la integración correspondiente se usa.
