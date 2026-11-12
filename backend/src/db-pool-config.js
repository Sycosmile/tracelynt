const DEFAULT_POOL_MAX = 10;
const MAX_POOL_MAX = 20;

function parsePoolMax(value) {
  if (value === undefined || value === '') return DEFAULT_POOL_MAX;
  if (!/^[1-9]\\d*$/.test(value)) {
    throw new Error('DB_POOL_MAX must be a whole number between 1 and ' + MAX_POOL_MAX + '.');
  }
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed > MAX_POOL_MAX) {
    throw new Error('DB_POOL_MAX must be a whole number between 1 and ' + MAX_POOL_MAX + '.');
  }
  return parsed;
}

export function getDatabasePoolOptions(env = process.env) {
  return {
    max: parsePoolMax(env.DB_POOL_MAX),
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: 5_000,
    statement_timeout: 15_000,
    idle_in_transaction_session_timeout: 15_000,
    application_name: 'tracelynt-api'
  };
}
