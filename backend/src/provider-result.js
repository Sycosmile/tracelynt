const OUTCOMES = new Set(['success', 'no_records', 'partial', 'stale', 'rate_limited', 'unavailable', 'error']);
const FRESHNESS = new Set(['current', 'stale', 'unknown', 'not_applicable']);

function text(value, label, max = 300) {
  if (typeof value !== 'string' || !value.trim() || value.trim().length > max) {
    throw new TypeError(label + ' must be non-empty text of at most ' + max + ' characters.');
  }
  return value.trim();
}

function timestamp(value, label, optional = false) {
  if (value == null && optional) return null;
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?Z$/.test(value)) {
    throw new TypeError(label + ' must be an ISO 8601 UTC timestamp.');
  }
  const parsed = new Date(value);
  if (!Number.isFinite(parsed.getTime()) || parsed.toISOString().slice(0, 19) !== value.slice(0, 19)) {
    throw new TypeError(label + ' must be a valid timestamp.');
  }
  return parsed.toISOString();
}

/**
 * Normalize a provider response without interpreting the meaning or truth of its records.
 * Empty results, partial results, and unavailable providers remain distinct outcomes.
 */
export function normalizeProviderResult(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    throw new TypeError('Provider result must be an object.');
  }

  const providerId = text(input.providerId, 'Provider ID', 100);
  const outcome = text(input.outcome, 'Outcome', 30);
  if (!OUTCOMES.has(outcome)) throw new TypeError('Provider outcome is not supported.');

  const records = input.records ?? [];
  if (!Array.isArray(records) || records.length > 1000) {
    throw new TypeError('Records must be an array with at most 1000 items.');
  }
  for (const [index, record] of records.entries()) {
    if (!record || typeof record !== 'object' || Array.isArray(record)) {
      throw new TypeError('Record ' + (index + 1) + ' must be an object.');
    }
  }

  if (outcome === 'no_records' && records.length !== 0) {
    throw new TypeError('A no_records result cannot contain records.');
  }
  if (outcome === 'success' && records.length === 0) {
    throw new TypeError('A success result must contain at least one record; use no_records for an empty result.');
  }
  if (outcome === 'partial' && records.length === 0) {
    throw new TypeError('A partial result must contain at least one usable record.');
  }

  const freshness = input.freshness ?? 'unknown';
  if (!FRESHNESS.has(freshness)) throw new TypeError('Freshness state is not supported.');

  const errors = input.errors ?? [];
  if (!Array.isArray(errors) || errors.length > 20) {
    throw new TypeError('Errors must be an array with at most 20 items.');
  }
  const normalizedErrors = errors.map((item, index) => {
    if (!item || typeof item !== 'object' || Array.isArray(item)) {
      throw new TypeError('Error ' + (index + 1) + ' must be an object.');
    }
    return {
      code: text(item.code, 'Error code', 100),
      message: text(item.message, 'Error message', 500),
      retryable: item.retryable === true
    };
  });

  const limitations = input.limitations ?? [];
  if (!Array.isArray(limitations) || limitations.length > 20) {
    throw new TypeError('Limitations must be an array with at most 20 items.');
  }

  const retryAfterSeconds = input.retryAfterSeconds ?? null;
  if (retryAfterSeconds !== null && (!Number.isInteger(retryAfterSeconds) || retryAfterSeconds < 0 || retryAfterSeconds > 86400)) {
    throw new TypeError('Retry-after must be an integer between 0 and 86400 seconds.');
  }
  if (outcome === 'rate_limited' && retryAfterSeconds === null) {
    throw new TypeError('Rate-limited results must specify retryAfterSeconds, including zero when known to be immediate.');
  }

  return {
    schemaVersion: '1.0',
    providerId,
    outcome,
    records,
    retrievedAt: timestamp(input.retrievedAt, 'Retrieved time'),
    sourcePublishedAt: timestamp(input.sourcePublishedAt, 'Source publication time', true),
    freshness,
    errors: normalizedErrors,
    retryAfterSeconds,
    limitations: limitations.map((item, index) => text(item, 'Limitation ' + (index + 1), 1000))
  };
}
