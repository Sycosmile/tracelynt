import net from 'node:net';

const SUBJECT_TYPES = new Set(['domain', 'ip_address', 'phone_number', 'email', 'username', 'organization', 'business', 'other']);
const CATEGORIES = new Set(['provider_data', 'public_record', 'direct_observation', 'user_report', 'analyst_assessment']);
const REVIEW_STATES = new Set(['unreviewed', 'corroborated', 'disputed', 'unavailable', 'retracted']);
const FRESHNESS_STATES = new Set(['current', 'stale', 'unknown', 'not_applicable']);
const PROVENANCE_KINDS = new Set(['provider', 'analyst', 'system', 'user']);
const RESERVED_SUFFIXES = ['localhost', 'local', 'internal', 'test', 'invalid', 'example', 'onion'];

function requiredText(value, label, maxLength) {
  if (typeof value !== 'string') throw new TypeError(label + ' must be text.');
  const clean = value.trim();
  if (!clean || clean.length > maxLength) throw new TypeError(label + ' is missing or too long.');
  return clean;
}

function optionalText(value, label, maxLength) {
  if (value == null || value === '') return null;
  return requiredText(value, label, maxLength);
}

function isoDate(value, label, optional = false) {
  if (value == null && optional) return null;
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?Z$/.test(value)) {
    throw new TypeError(label + ' must be an ISO 8601 UTC timestamp.');
  }
  const date = new Date(value);
  if (!Number.isFinite(date.getTime()) || date.toISOString().slice(0, 19) !== value.slice(0, 19)) {
    throw new TypeError(label + ' must be a valid timestamp.');
  }
  return date.toISOString();
}

function normalizeSourceUrl(value) {
  if (value == null || value === '') return null;
  const raw = requiredText(value, 'Source URL', 2048);
  let url;
  try { url = new URL(raw); } catch { throw new TypeError('Source URL must be a valid HTTPS URL.'); }
  const host = url.hostname.toLowerCase().replace(/^\[|\]$/g, '').replace(/\.$/, '');
  if (url.protocol !== 'https:' || url.username || url.password || !host.includes('.') ||
      net.isIP(host) !== 0 ||
      RESERVED_SUFFIXES.some(suffix => host === suffix || host.endsWith('.' + suffix))) {
    throw new TypeError('Source URL must be HTTPS and use a named public hostname without credentials.');
  }
  url.hash = '';
  return url.toString();
}

/**
 * Validate and normalize a single evidence observation.
 * This validates record shape and provenance; it does not independently verify the claim.
 */
export function normalizeObservation(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    throw new TypeError('Observation must be a JSON object.');
  }
  const subjectInput = input.subject;
  if (!subjectInput || typeof subjectInput !== 'object' || Array.isArray(subjectInput)) {
    throw new TypeError('Observation subject is required.');
  }
  const subjectType = requiredText(subjectInput.type, 'Subject type', 30);
  if (!SUBJECT_TYPES.has(subjectType)) throw new TypeError('Subject type is not supported.');

  const category = requiredText(input.category, 'Observation category', 40);
  if (!CATEGORIES.has(category)) throw new TypeError('Observation category is not supported.');
  const reviewState = input.reviewState === undefined ? 'unreviewed' : requiredText(input.reviewState, 'Review state', 30);
  if (!REVIEW_STATES.has(reviewState)) throw new TypeError('Review state is not supported.');

  const freshnessInput = input.freshness ?? {};
  if (!freshnessInput || typeof freshnessInput !== 'object' || Array.isArray(freshnessInput)) {
    throw new TypeError('Freshness must be an object.');
  }
  const freshnessState = freshnessInput.state === undefined ? 'unknown' : requiredText(freshnessInput.state, 'Freshness state', 30);
  if (!FRESHNESS_STATES.has(freshnessState)) throw new TypeError('Freshness state is not supported.');

  const sourceInput = input.source;
  if (!sourceInput || typeof sourceInput !== 'object' || Array.isArray(sourceInput)) {
    throw new TypeError('Observation source is required.');
  }
  const provenanceInput = input.provenance;
  if (!provenanceInput || typeof provenanceInput !== 'object' || Array.isArray(provenanceInput)) {
    throw new TypeError('Observation provenance is required.');
  }
  const provenanceKind = requiredText(provenanceInput.kind, 'Provenance kind', 20);
  if (!PROVENANCE_KINDS.has(provenanceKind)) throw new TypeError('Provenance kind is not supported.');

  const limitationsInput = input.limitations ?? [];
  if (!Array.isArray(limitationsInput) || limitationsInput.length > 20) {
    throw new TypeError('Limitations must be an array with at most 20 items.');
  }

  return {
    schemaVersion: '1.0',
    id: optionalText(input.id, 'Observation ID', 100),
    subject: {
      type: subjectType,
      value: requiredText(subjectInput.value, 'Subject value', 500)
    },
    claim: requiredText(input.claim, 'Observation claim', 5000),
    category,
    source: {
      name: requiredText(sourceInput.name, 'Source name', 300),
      url: normalizeSourceUrl(sourceInput.url),
      providerId: optionalText(sourceInput.providerId, 'Provider ID', 100)
    },
    retrievedAt: isoDate(input.retrievedAt, 'Retrieved time'),
    observedAt: isoDate(input.observedAt, 'Observed time', true),
    sourcePublishedAt: isoDate(input.sourcePublishedAt, 'Source publication time', true),
    reviewState,
    freshness: {
      state: freshnessState,
      asOf: isoDate(freshnessInput.asOf, 'Freshness as-of time', true)
    },
    provenance: {
      kind: provenanceKind,
      actorId: optionalText(provenanceInput.actorId, 'Provenance actor ID', 100)
    },
    limitations: limitationsInput.map((item, index) => requiredText(item, 'Limitation ' + (index + 1), 1000))
  };
}
