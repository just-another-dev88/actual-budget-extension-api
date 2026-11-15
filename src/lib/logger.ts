import pino from 'pino';

/**
 * Single application logger. Secrets are redacted at the serializer level so
 * they can never reach log sinks, regardless of who logs the object.
 */
export const logger = pino({
  level: process.env.LOG_LEVEL ?? (process.env.NODE_ENV === 'test' ? 'silent' : 'info'),
  redact: {
    paths: [
      'req.headers["x-api-key"]',
      'req.headers.authorization',
      'req.headers.cookie',
      'res.headers["set-cookie"]',
      '*.password',
      '*.token',
      '*.apiKey',
    ],
    censor: '[REDACTED]',
  },
});

export type Logger = typeof logger;
