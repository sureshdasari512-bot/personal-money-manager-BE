import { Pool, types } from 'pg';
import { env } from './env.js';
import type { Database, QueryResult } from '../types/index.js';
import { logger } from '../utils/logger.js';

// DATE columns stay YYYY-MM-DD. Default Date parsing shifts the day in IST/UTC.
types.setTypeParser(1082, (value: string) => value);

const pool = new Pool({ connectionString: env.databaseUrl });

/**
 * Reads host and database name from DATABASE_URL without logging credentials.
 *
 * @param connectionString - Postgres URI
 * @returns Safe connection details for logs
 */
function describeDatabaseUrl(connectionString: string): { host: string; database: string } {
  try {
    const url = new URL(connectionString);
    return {
      host: url.hostname,
      database: url.pathname.replace(/^\//, '') || 'postgres',
    };
  } catch {
    return { host: 'unparseable', database: 'unparseable' };
  }
}

/**
 * PostgreSQL adapter that implements the Database contract.
 * Repositories depend on this abstraction, not the `pg` driver (DIP).
 */
export const db: Database = {
  /**
   * Executes a parameterized SQL query.
   *
   * @param sql - Parameterized SQL (`$1`, `$2`, ...)
   * @param params - Bound parameter values
   * @returns Query rows typed as `T`
   */
  async query<T>(sql: string, params: unknown[] = []): Promise<QueryResult<T>> {
    const result = await pool.query(sql, params);
    return { rows: result.rows as T[] };
  },

  /**
   * Runs work on a single connection inside BEGIN/COMMIT.
   * ROLLBACK runs if `work` throws.
   *
   * @param work - Callback that receives a query bound to the transaction
   * @returns The callback result
   */
  async withTransaction<T>(work: (query: Database['query']) => Promise<T>): Promise<T> {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const query: Database['query'] = async <R>(sql: string, params: unknown[] = []) => {
        const result = await client.query(sql, params);
        return { rows: result.rows as R[] };
      };
      const value = await work(query);
      await client.query('COMMIT');
      return value;
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  },
};

/**
 * Opens a real connection to Postgres/Supabase and logs the result.
 *
 * @throws {Error} If the database cannot be reached
 */
export async function connectDatabase(): Promise<void> {
  const target = describeDatabaseUrl(env.databaseUrl);
  try {
    await pool.query('SELECT 1');
    logger.info(target, 'Supabase/Postgres connected');
  } catch (err) {
    logger.error({ err, ...target }, 'Supabase/Postgres connection failed');
    throw err;
  }
}

/**
 * Closes the connection pool on process shutdown.
 */
export async function closeDatabase(): Promise<void> {
  await pool.end();
}
