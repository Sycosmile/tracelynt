import { normalizeProviderResult } from './provider-result.js';

const DEFAULT_TIMEOUT_MS = 5_000;
const MAX_TIMEOUT_MS = 30_000;
const MAX_CONCURRENT_PER_PROVIDER = 2;
const activeByProvider = new Map();

function timestamp(now) {
  const value = now();
  if (!(value instanceof Date) || !Number.isFinite(value.getTime())) {
    throw new TypeError('Provider adapter clock must return a valid Date.');
  }
  return value.toISOString();
}

function fallback(providerId, outcome, code, message, retryable, now) {
  return normalizeProviderResult({
    providerId,
    outcome,
    records: [],
    retrievedAt: timestamp(now),
    sourcePublishedAt: null,
    freshness: 'unknown',
    errors: [{ code, message, retryable }],
    retryAfterSeconds: null,
    limitations: ['No provider records were accepted for this execution.']
  });
}

/**
 * Execute one injected provider adapter behind a bounded, abortable boundary.
 * A timed-out adapter retains its concurrency slot until its underlying promise
 * settles; this prevents non-cooperative adapters from bypassing the limit.
 */
export async function executeProviderAdapter(adapter, {
  subject,
  timeoutMs = DEFAULT_TIMEOUT_MS,
  now = () => new Date()
} = {}) {
  if (!adapter || typeof adapter !== 'object' || Array.isArray(adapter)) {
    throw new TypeError('Provider adapter must be an object.');
  }
  const providerId = adapter.id;
  if (typeof providerId !== 'string' || !providerId.trim() || providerId.trim().length > 100) {
    throw new TypeError('Provider adapter ID must be non-empty text of at most 100 characters.');
  }
  if (typeof adapter.execute !== 'function') {
    throw new TypeError('Provider adapter must expose an execute function.');
  }
  if (!Number.isInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > MAX_TIMEOUT_MS) {
    throw new TypeError('Provider timeout must be an integer between 1 and 30000 milliseconds.');
  }

  const id = providerId.trim();
  const active = activeByProvider.get(id) || 0;
  if (active >= MAX_CONCURRENT_PER_PROVIDER) {
    return fallback(
      id,
      'unavailable',
      'ADAPTER_CAPACITY_EXCEEDED',
      'The provider is already handling its maximum number of concurrent requests.',
      true,
      now
    );
  }
  activeByProvider.set(id, active + 1);

  const release = () => {
    const remaining = (activeByProvider.get(id) || 1) - 1;
    if (remaining > 0) activeByProvider.set(id, remaining);
    else activeByProvider.delete(id);
  };

  const controller = new AbortController();
  let timer;
  const execution = Promise.resolve()
    .then(() => adapter.execute({ subject, signal: controller.signal }))
    .then(
      value => ({ kind: 'result', value }),
      () => ({ kind: 'failure' })
    );
  // Release only when the adapter actually settles, including after timeout.
  execution.then(release);

  const timedOut = new Promise(resolve => {
    timer = setTimeout(() => {
      controller.abort();
      resolve({ kind: 'timeout' });
    }, timeoutMs);
  });

  try {
    const completed = await Promise.race([execution, timedOut]);
    if (completed.kind === 'timeout') {
      return fallback(
        id,
        'unavailable',
        'ADAPTER_TIMEOUT',
        'The provider did not complete within the configured time limit.',
        true,
        now
      );
    }
    if (completed.kind === 'failure') {
      return fallback(
        id,
        'error',
        'ADAPTER_FAILED',
        'The provider adapter failed before returning a usable result.',
        false,
        now
      );
    }
    const raw = completed.value;
    if (raw?.providerId !== id) {
      return fallback(
        id,
        'error',
        'ADAPTER_PROVIDER_MISMATCH',
        'The provider result did not match the configured adapter.',
        false,
        now
      );
    }
    try {
      return normalizeProviderResult(raw);
    } catch {
      return fallback(
        id,
        'error',
        'ADAPTER_INVALID_RESULT',
        'The provider returned a result that did not match the required schema.',
        false,
        now
      );
    }
  } finally {
    clearTimeout(timer);
  }
}
