import 'dotenv/config';
import app from './app';
import { getConfig } from './config';
import { initActual, shutdownActual } from './actual/client';
import { logger } from './lib/logger';
import { startBot, stopBot } from './telegram/bot';

const SHUTDOWN_TIMEOUT_MS = 10_000;

async function bootstrap(): Promise<void> {
  try {
    const cfg = getConfig();

    logger.info('Initialising Actual Budget API...');
    await initActual();
    logger.info('Actual Budget API initialised and budget loaded');

    const server = app.listen(cfg.PORT, () => {
      logger.info({ port: cfg.PORT }, 'HTTP server listening');
    });

    // Start Telegram bot in the background so failures cannot bring down the HTTP API
    void startBot();

    let shuttingDown = false;
    const gracefulShutdown = async (signal: string) => {
      if (shuttingDown) return;
      shuttingDown = true;
      logger.info({ signal }, 'Received shutdown signal, closing down...');

      const forceExit = setTimeout(() => {
        logger.error('Shutdown timed out; forcing exit');
        process.exit(1);
      }, SHUTDOWN_TIMEOUT_MS);
      forceExit.unref();

      try {
        await new Promise<void>((resolve) => {
          server.close(() => resolve());
        });
        await stopBot();
        await shutdownActual();
        process.exit(0);
      } catch (err) {
        logger.error({ err }, 'Error during graceful shutdown');
        process.exit(1);
      }
    };

    process.on('SIGTERM', () => void gracefulShutdown('SIGTERM'));
    process.on('SIGINT', () => void gracefulShutdown('SIGINT'));
  } catch (error) {
    logger.fatal({ err: error }, 'Failed to start server');
    process.exit(1);
  }
}

void bootstrap();
