# Integraciones

- Equipos y miembros: fuentes existentes `teams` y `members` de la campaña.
- SmartPlanner, rutas y materiales: se referencian por ID cuando el flujo los conecte; no se crean datos simulados.
- Google Maps: la ubicación queda preparada para dirección y coordenadas. La geocodificación/Places se mantiene en el servicio Maps ya existente, sin incorporar una clave en frontend.
- Ágoras, WireFlow y Google Calendar OAuth: no existen módulos ni credenciales/configuración verificables en el repositorio; quedaron bloqueados, documentados y sin botones ficticios.
- Recordatorios: se almacena su configuración. Su entrega requiere una cola/Cloud Scheduler y no se ejecuta con temporizadores de navegador.
