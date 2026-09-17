import { createApp } from './app.js';
import { closeDatabase, connectDatabase } from './config/database.js';
import { env } from './config/env.js';
import { closeRedisConnections, connectRedis } from './config/redis.js';
import { closeEmailQueue } from './queues/emailQueue.js';
import { verifySmtpConnection } from './services/smtpEmailChannel.js';
import { logger } from './utils/logger.js';
import { closeEmailWorker, startEmailWorker } from './workers/emailWorker.js';

/**
 * Binds HTTP first (Render health), then database, Redis, and SMTP.
 */
async function start(): Promise<void> {
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

  await connectDatabase();

  try {
    await connectRedis();
    startEmailWorker();
  } catch (err) {
    logger.error({ err }, 'Redis unavailable; email queue disabled');
  }

  void verifySmtpConnection();

  /**
   * Stops HTTP, workers, Redis, and database connections on process signals.
   *
   * @param signal - OS shutdown signal
   */
  async function shutdown(signal: string): Promise<void> {
    logger.info({ signal }, 'Shutting down');
    server.close(async () => {
      await closeEmailWorker();
      await closeEmailQueue();
      await closeRedisConnections();
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
