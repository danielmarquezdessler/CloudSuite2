# Permisos

Todo miembro con claims de campaña puede leer eventos, recursos y plantillas. Cliente y admin pueden crear, editar, cancelar, eliminar, definir plantillas y administrar recursos. Un participante puede responder únicamente su propia confirmación; no puede modificar a otros participantes.

Las reglas Firestore sólo permiten lectura directa. Ninguna escritura se concede al navegador. El backend valida que cada participante pertenezca a la misma campaña, evitando exposición entre campañas, y usa `expectedRevision` para evitar sobrescrituras silenciosas.
