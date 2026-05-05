import { Pool, PoolConfig } from 'pg';
import { logger } from '../utils/logger';

let pool: Pool;

export function getPool(): Pool {
  if (!pool) {
    const poolConfig: PoolConfig = {
      connectionString: process.env.DATABASE_URL,
      max: 20,
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 5000,
      ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : undefined,
    };

    pool = new Pool(poolConfig);

    pool.on('error', (err) => {
      logger.error({ err }, 'Unexpected database pool error');
    });

    pool.on('connect', () => {
      logger.debug('New database connection established');
    });
  }

  return pool;
}

export async function query<T = Record<string, unknown>>(
  text: string,
  params?: unknown[]
): Promise<T[]> {
  const start = Date.now();
  const result = await getPool().query(text, params);
  const duration = Date.now() - start;

  logger.debug({ query: text.substring(0, 80), duration, rows: result.rowCount }, 'DB query');

  return result.rows as T[];
}

export async function queryOne<T = Record<string, unknown>>(
  text: string,
  params?: unknown[]
): Promise<T | null> {
  const rows = await query<T>(text, params);
  return rows[0] || null;
}

export async function transaction<T>(
  callback: (client: import('pg').PoolClient) => Promise<T>
): Promise<T> {
  const client = await getPool().connect();
  try {
    await client.query('BEGIN');
    const result = await callback(client);
    await client.query('COMMIT');
    return result;
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

export async function testConnection(): Promise<boolean> {
  try {
    await query('SELECT NOW()');
    logger.info('Database connection successful');
    return true;
  } catch (err) {
    logger.error({ err }, 'Database connection failed');
    return false;
  }
}

export async function closePool(): Promise<void> {
  if (pool) {
    await pool.end();
    logger.info('Database pool closed');
  }
}
