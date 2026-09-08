import { NextFunction, Request, Response } from 'express';
import { adminAuth } from '../config/firebase.js';

export async function requireAuth(request: Request, response: Response, next: NextFunction) {
  const authorization = request.header('Authorization');
  if (!authorization?.startsWith('Bearer ')) {
    response.status(401).json({ message: 'Falta el token de autenticación.' });
    return;
  }

  try {
    request.user = await adminAuth.verifyIdToken(authorization.slice('Bearer '.length));
    next();
  } catch {
    response.status(401).json({ message: 'El token de autenticación no es válido.' });
  }
}
