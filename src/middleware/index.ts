import { Request, Response, NextFunction } from 'express';
import { ZodError } from 'zod';
import pinoHttp from 'pino-http';
import pino from 'pino';

const logger = pino();

export const requestLogger = pinoHttp({ logger });

export function errorHandler(err: any, req: Request, res: Response, next: NextFunction) {
  logger.error({ err }, err.message || 'An error occurred');

  if (err instanceof ZodError) {
    res.status(400).json({ error: 'Validation Error', details: (err as any).errors });
    return;
  }

  res.status(err.status || 500).json({
    error: err.message || 'Internal Server Error',
    ...(process.env.NODE_ENV !== 'production' && { stack: err.stack }),
  });
}
