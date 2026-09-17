import { Redis } from 'ioredis';
import { env } from './env.js';
import { logger } from '../utils/logger.js';

const connections: Redis[] = [];

/**
 * Reads host and port from REDIS_URL without logging credentials.
 *
 * @param connectionString - Redis URI
 * @returns Safe connection details for logs
 */
function describeRedisUrl(connectionString: string): { host: string; port: string } {
  try {
    const url = new URL(connectionString);
    return { host: url.hostname, port: url.port || '6379' };
  } catch {
    return { host: 'unparseable', port: 'unparseable' };
  }
}

/**
 * Creates a Redis connection for BullMQ (Queue and Worker need separate clients).
 *
 * @returns ioredis client with BullMQ-required settings
 */
export function createRedisConnection(): Redis {
  const redis = new Redis(env.redisUrl, {
    maxRetriesPerRequest: null,
    connectTimeout: 10_000,
  });
  connections.push(redis);
  redis.on('error', (err) => {
    logger.error({ err, ...describeRedisUrl(env.redisUrl) }, 'Redis connection error');
  });
  return redis;
}

/**
 * Pings Redis at boot so a bad REDIS_URL fails fast.
 *
 * @throws {Error} If Redis cannot be reached
 */
export async function connectRedis(): Promise<void> {
  const target = describeRedisUrl(env.redisUrl);
  const redis = new Redis(env.redisUrl, { maxRetriesPerRequest: null, connectTimeout: 10_000 });
  try {
    await redis.ping();
    logger.info(target, 'Redis connected');
  } catch (err) {
    logger.error({ err, ...target }, 'Redis connection failed');
    throw err;
  } finally {
    await redis.quit();
  }
}

/**
 * Closes every Redis client created during this process.
 */
export async function closeRedisConnections(): Promise<void> {
  await Promise.all(connections.map((redis) => redis.quit()));
  connections.length = 0;
  commandClient = undefined;
}

let commandClient: Redis | undefined;

/**
 * Returns a shared Redis client for app commands (login attempts, etc.).
 *
 * @returns ioredis client
 */
export function getRedisCommands(): Redis {
  if (!commandClient) {
    commandClient = createRedisConnection();
  }
  return commandClient;
}
