import { Request, Response, NextFunction } from 'express';
import crypto from 'crypto';
import { config } from '../config';

export function authMiddleware(req: Request, res: Response, next: NextFunction) {
  const apiKey = req.header('X-API-Key');

  if (!apiKey) {
    res.status(401).json({ error: 'Unauthorized: Missing X-API-Key header' });
    return;
  }

  const expectedKeyBuffer = Buffer.from(config.API_KEY);
  const providedKeyBuffer = Buffer.from(apiKey);

  if (
    expectedKeyBuffer.length !== providedKeyBuffer.length ||
    !crypto.timingSafeEqual(expectedKeyBuffer, providedKeyBuffer)
  ) {
    res.status(401).json({ error: 'Unauthorized: Invalid X-API-Key' });
    return;
  }

  next();
}
