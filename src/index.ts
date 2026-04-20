import app from './app';
import { config } from './config';
import { initActual, shutdownActual } from './actual/client';

async function bootstrap() {
  try {
    console.log('🔄 Initialising Actual Budget API...');
    await initActual();
    console.log('✅ Actual Budget API initialised and budget loaded.');

    const server = app.listen(config.PORT, () => {
      console.log(`🚀 Server listening on port ${config.PORT}`);
    });

    const gracefulShutdown = async () => {
      console.log('🛑 Received shutdown signal, closing down...');
      server.close();
      await shutdownActual();
      process.exit(0);
    };

    process.on('SIGTERM', gracefulShutdown);
    process.on('SIGINT', gracefulShutdown);
  } catch (error) {
    console.error('❌ Failed to start server:', error);
    process.exit(1);
  }
}

bootstrap();
