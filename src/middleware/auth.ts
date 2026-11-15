import { Request, Response, NextFunction } from 'express';
import crypto from 'crypto';
import { getConfig } from '../config';

function safeEqual(a: string, b: string): boolean {
  // Hash both sides so the comparison is constant-time regardless of length.
  const ha = crypto.createHash('sha256').update(a).digest();
  const hb = crypto.createHash('sha256').update(b).digest();
  return crypto.timingSafeEqual(ha, hb);
}

export function authMiddleware(req: Request, res: Response, next: NextFunction) {
  const apiKey = req.header('X-API-Key');

  if (!apiKey) {
    res.status(401).json({ error: 'Unauthorized: Missing X-API-Key header' });
    return;
  }

  if (!safeEqual(apiKey, getConfig().API_KEY)) {
    res.status(401).json({ error: 'Unauthorized: Invalid X-API-Key' });
    return;
  }

  next();
}
