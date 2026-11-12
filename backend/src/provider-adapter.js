import { normalizeProviderResult } from './provider-result.js';

const DEFAULT_TIMEOUT_MS = 5_000;
const MAX_TIMEOUT_MS = 30_000;

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
 * This function does not perform network access or decide whether provider
 * records are factually correct; adapters own transport and record mapping.
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

  const controller = new AbortController();
  let timer;
  const timedOut = new Promise((resolve) => {
    timer = setTimeout(() => {
      controller.abort();
      resolve(fallback(
        providerId.trim(),
        'unavailable',
        'ADAPTER_TIMEOUT',
        'The provider did not complete within the configured time limit.',
        true,
        now
      ));
    }, timeoutMs);
  });

  try {
    const execution = Promise.resolve().then(() => adapter.execute({
      subject,
      signal: controller.signal
    }));
    const raw = await Promise.race([execution, timedOut]);
    if (raw?.providerId !== providerId.trim()) {
      return fallback(
        providerId.trim(),
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
        providerId.trim(),
        'error',
        'ADAPTER_INVALID_RESULT',
        'The provider returned a result that did not match the required schema.',
        false,
        now
      );
    }
  } catch {
    return fallback(
      providerId.trim(),
      'error',
      'ADAPTER_FAILED',
      'The provider adapter failed before returning a usable result.',
      false,
      now
    );
  } finally {
    clearTimeout(timer);
  }
}
