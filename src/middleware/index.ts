import { Request, Response, NextFunction } from 'express';
import { ZodError } from 'zod';
import pinoHttp from 'pino-http';
import { logger } from '../lib/logger';

export const requestLogger = pinoHttp({
  logger,
  // Health probes are noisy and carry no information.
  autoLogging: { ignore: (req) => req.url === '/health' },
});

interface HttpError extends Error {
  status?: number;
  statusCode?: number;
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
export function errorHandler(err: HttpError, req: Request, res: Response, next: NextFunction) {
  if (err instanceof ZodError) {
    res.status(400).json({ error: 'Validation Error', details: err.issues });
    return;
  }

  const status = err.status ?? err.statusCode ?? 500;
  if (status >= 500) {
    logger.error({ err, url: req.originalUrl }, err.message || 'Unhandled error');
  } else {
    logger.warn({ err: { message: err.message }, url: req.originalUrl }, 'Request failed');
  }

  const isProd = process.env.NODE_ENV === 'production';
  res.status(status).json({
    // Do not leak internals for server errors in production.
    error:
      status >= 500 && isProd ? 'Internal Server Error' : err.message || 'Internal Server Error',
    ...(!isProd && status >= 500 && { stack: err.stack }),
  });
}
