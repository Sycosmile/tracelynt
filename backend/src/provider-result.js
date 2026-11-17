const OUTCOMES = new Set(['success', 'no_records', 'partial', 'stale', 'rate_limited', 'unavailable', 'error']);
const FRESHNESS = new Set(['current', 'stale', 'unknown', 'not_applicable']);

const MAX_RECORDS = 100;
const MAX_RECORD_DEPTH = 8;
const MAX_RECORD_STRING_BYTES = 4096;
const MAX_SINGLE_RECORD_BYTES = 16 * 1024;
const MAX_TOTAL_RECORD_BYTES = 64 * 1024;
const MAX_OBJECT_KEYS = 100;

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

function cloneBoundedJson(value, depth, ancestors) {
  if (depth > MAX_RECORD_DEPTH) throw new TypeError('Provider record exceeds the maximum nesting depth.');
  if (value === null || typeof value === 'boolean') return value;
  if (typeof value === 'string') {
    if (Buffer.byteLength(value, 'utf8') > MAX_RECORD_STRING_BYTES) {
      throw new TypeError('Provider record contains a string that is too large.');
    }
    return value;
  }
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) throw new TypeError('Provider records must contain finite numbers.');
    return value;
  }
  if (typeof value !== 'object') throw new TypeError('Provider records must contain JSON-compatible values.');
  if (ancestors.has(value)) throw new TypeError('Provider records must not contain circular references.');

  ancestors.add(value);
  try {
    if (Array.isArray(value)) {
      if (value.length > MAX_OBJECT_KEYS) throw new TypeError('Provider record array exceeds the item limit.');
      const result = [];
      for (let index = 0; index < value.length; index += 1) {
        const descriptor = Object.getOwnPropertyDescriptor(value, String(index));
        if (!descriptor || !Object.hasOwn(descriptor, 'value')) {
          throw new TypeError('Provider record arrays must be dense data arrays.');
        }
        result.push(cloneBoundedJson(descriptor.value, depth + 1, ancestors));
      }
      return result;
    }

    const prototype = Object.getPrototypeOf(value);
    if (prototype !== Object.prototype && prototype !== null) {
      throw new TypeError('Provider records must use plain JSON objects.');
    }
    const keys = Reflect.ownKeys(value);
    if (keys.length > MAX_OBJECT_KEYS || keys.some(key => typeof key !== 'string')) {
      throw new TypeError('Provider record object exceeds the key limit or contains symbol keys.');
    }
    const result = {};
    for (const key of keys) {
      if (key === '__proto__' || key === 'prototype' || key === 'constructor') {
        throw new TypeError('Provider record contains a prohibited object key.');
      }
      const descriptor = Object.getOwnPropertyDescriptor(value, key);
      if (!descriptor || !descriptor.enumerable || !Object.hasOwn(descriptor, 'value')) {
        throw new TypeError('Provider records must contain enumerable data properties only.');
      }
      Object.defineProperty(result, key, {
        value: cloneBoundedJson(descriptor.value, depth + 1, ancestors),
        enumerable: true,
        configurable: true,
        writable: true
      });
    }
    return result;
  } finally {
    ancestors.delete(value);
  }
}

function normalizeRecords(records) {
  if (!Array.isArray(records) || records.length > MAX_RECORDS) {
    throw new TypeError('Records must be an array with at most ' + MAX_RECORDS + ' items.');
  }
  let totalBytes = 0;
  return records.map((record, index) => {
    if (record === null || (typeof record !== 'string' && (typeof record !== 'object' || Array.isArray(record)))) {
      throw new TypeError('Record ' + (index + 1) + ' must be a string or object.');
    }
    const normalized = cloneBoundedJson(record, 0, new WeakSet());
    const bytes = Buffer.byteLength(JSON.stringify(normalized), 'utf8');
    if (bytes > MAX_SINGLE_RECORD_BYTES) {
      throw new TypeError('Record ' + (index + 1) + ' exceeds the maximum serialized size.');
    }
    totalBytes += bytes;
    if (totalBytes > MAX_TOTAL_RECORD_BYTES) {
      throw new TypeError('Provider records exceed the maximum aggregate serialized size.');
    }
    return normalized;
  });
}

/**
 * Normalize a provider response without interpreting the meaning or truth of its records.
 * Provider-controlled data is copied into bounded JSON values before it is returned.
 */
export function normalizeProviderResult(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    throw new TypeError('Provider result must be an object.');
  }

  const providerId = text(input.providerId, 'Provider ID', 100);
  const outcome = text(input.outcome, 'Outcome', 30);
  if (!OUTCOMES.has(outcome)) throw new TypeError('Provider outcome is not supported.');

  const records = normalizeRecords(input.records ?? []);

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
