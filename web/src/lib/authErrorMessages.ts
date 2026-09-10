const messages: Record<string, string> = {
  'auth/invalid-credential': 'El email o la contraseña no son correctos.',
  'auth/wrong-password': 'El email o la contraseña no son correctos.',
  'auth/user-not-found': 'El email o la contraseña no son correctos.',
  'auth/too-many-requests': 'Demasiados intentos. Esperá un momento y volvé a intentar.',
  'auth/user-disabled': 'Esta cuenta fue deshabilitada. Contactá al administrador.',
  'auth/email-already-in-use': 'Ya existe una cuenta con ese email.',
  'auth/weak-password': 'La contraseña debe tener al menos 6 caracteres.',
  'auth/network-request-failed': 'No pudimos conectarnos. Revisá tu conexión a internet.'
};

/** Never expose Firebase Auth implementation errors in the interface. */
export function firebaseAuthErrorMessage(error: unknown): string | null {
  if (!error || typeof error !== 'object' || !('code' in error) || typeof error.code !== 'string' || !error.code.startsWith('auth/')) return null;
  return messages[error.code] ?? 'No pudimos completar la operación. Intentá de nuevo.';
}
