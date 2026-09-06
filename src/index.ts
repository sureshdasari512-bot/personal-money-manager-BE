import { createApp } from './app.js';
import { closeDatabase, connectDatabase } from './config/database.js';
import { env } from './config/env.js';
import { logger } from './utils/logger.js';

/**
 * Starts the HTTP server after confirming the database connection.
 */
async function start(): Promise<void> {
  await connectDatabase();

  const app = createApp();
  const server = app.listen(env.port, () => {
    logger.info(
      {
        port: env.port,
        cookieSecure: env.cookieSecure,
      },
      env.cookieSecure
        ? 'API listening (Secure cookies enabled — HTTPS only)'
        : 'API listening (COOKIE_SECURE=false so cookies work on http://localhost)',
    );
  });

  /**
   * Stops HTTP + database connections on process signals.
   *
   * @param signal - OS shutdown signal
   */
  async function shutdown(signal: string): Promise<void> {
    logger.info({ signal }, 'Shutting down');
    server.close(async () => {
      await closeDatabase();
      process.exit(0);
    });
  }

  process.on('SIGINT', () => {
    void shutdown('SIGINT');
  });
  process.on('SIGTERM', () => {
    void shutdown('SIGTERM');
  });
}

start().catch((err: unknown) => {
  logger.error({ err }, 'Failed to start API');
  process.exit(1);
});
