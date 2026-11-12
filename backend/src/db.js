import pg from 'pg';
import { getDatabasePoolOptions } from './db-pool-config.js';

const { Pool } = pg;
let pool;

export function getPool() {
  if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL is required for private workspace features.');
  if (!pool) {
    pool = new Pool({
      connectionString: process.env.DATABASE_URL,
      ...getDatabasePoolOptions()
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
