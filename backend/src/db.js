import pg from 'pg';

const { Pool } = pg;
let pool;

export function getPool() {
  if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL is required for private workspace features.');
  if (!pool) {
    pool = new Pool({
      connectionString: process.env.DATABASE_URL,
      max: Number.parseInt(process.env.DB_POOL_MAX || '10', 10),
      idleTimeoutMillis: 30_000,
      connectionTimeoutMillis: 5_000,
      application_name: 'tracelynt-api'
    });
    pool.on('error', () => {
      // Do not log driver errors: connection errors may contain infrastructure details.
    });
  }
  return pool;
}

export async function query(text, values = []) {
  return getPool().query(text, values);
}

export async function closePool() {
  if (pool) {
    const current = pool;
    pool = undefined;
    await current.end();
  }
}
