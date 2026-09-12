import { NextFunction, Request, Response } from 'express';
import { db } from '../config/firebase.js';

/** Rejects an add-on route before reaching its controller when the organization plan lacks it. */
export function requireAddon(addon: string) {
  return async (request: Request, response: Response, next: NextFunction) => {
    try {
      const organization = await db.collection('organizations').doc(String(request.params.orgId)).get();
      if (organization.data()?.enabledAddons?.[addon] !== true) {
        response.status(403).json({ message: 'Este addon no está habilitado en el plan de esta organización.' });
        return;
      }
      next();
    } catch {
      response.status(500).json({ message: 'No pudimos verificar el plan de la organización.' });
    }
  };
}
