import { randomUUID } from 'node:crypto';
import { getPool } from './db.js';
import net from 'node:net';
import { inspectDomain, isPublicIp } from './domain-check.js';
import { normalizeObservation } from './observation.js';

const SUBJECT_TYPES = new Set(['business', 'domain', 'phone_number', 'other']);
const REVIEW_STATES = new Set(['unreviewed', 'corroborated', 'disputed', 'unavailable', 'retracted']);
const EVIDENCE_CATEGORIES = new Set(['public_record', 'direct_observation', 'provider_data', 'user_report', 'analyst_assessment']);
const FRESHNESS_STATES = new Set(['current', 'stale', 'unknown', 'not_applicable']);
const PROVENANCE_KINDS = new Set(['provider', 'analyst', 'system', 'user']);
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function invalid(message) {
  return { status: 400, body: { error: 'INVALID_INPUT', message } };
}

function notFound() {
  return { status: 404, body: { error: 'NOT_FOUND' } };
}

function text(value, name, max, required = true) {
  if (typeof value !== 'string') {
    if (!required && (value === undefined || value === null)) return '';
    throw new TypeError(name + ' must be text.');
  }
  const clean = value.trim();
  if ((required && !clean) || clean.length > max) throw new TypeError(name + ' is missing or too long.');
  return clean;
}

function validateCase(body, partial = false) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) throw new TypeError('Request body must be an object.');
  const result = {};
  if (!partial || Object.hasOwn(body, 'title')) result.title = text(body.title, 'Title', 200);
  if (!partial || Object.hasOwn(body, 'purpose')) result.purpose = text(body.purpose, 'Purpose', 2000);
  if (!partial || Object.hasOwn(body, 'subjectType')) {
    result.subjectType = text(body.subjectType, 'Subject type', 30);
    if (!SUBJECT_TYPES.has(result.subjectType)) throw new TypeError('Subject type is not supported.');
  }
  if (!partial || Object.hasOwn(body, 'subjectLabel')) result.subjectLabel = text(body.subjectLabel, 'Subject label', 500);
  if (Object.hasOwn(body, 'status')) {
    if (!['open', 'archived'].includes(body.status)) throw new TypeError('Status must be open or archived.');
    result.status = body.status;
  }
  if (Object.keys(result).length === 0) throw new TypeError('No supported case fields were supplied.');
  return result;
}

function validateEvidence(body) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) throw new TypeError('Request body must be an object.');
  const category = text(body.category, 'Category', 40);
  if (!EVIDENCE_CATEGORIES.has(category)) throw new TypeError('Evidence category is not supported.');
  const reviewState = body.reviewState === undefined ? 'unreviewed' : text(body.reviewState, 'Review state', 40);
  if (!REVIEW_STATES.has(reviewState)) throw new TypeError('Review state is not supported.');
  const sourceUrl = body.sourceUrl == null || body.sourceUrl === '' ? null : text(body.sourceUrl, 'Source URL', 2048);
  if (sourceUrl) {
    let parsed;
    try { parsed = new URL(sourceUrl); } catch { throw new TypeError('Source URL must be a valid HTTPS URL.'); }
    if (parsed.protocol !== 'https:' || parsed.username || parsed.password) throw new TypeError('Source URL must be HTTPS and cannot include credentials.');
    const hostname = parsed.hostname.replace(/^\[|\]$/g, '').toLowerCase();
    if ((net.isIP(hostname) && !isPublicIp(hostname)) || hostname === 'localhost' || hostname.endsWith('.localhost') || hostname.endsWith('.local') || hostname.endsWith('.internal')) {
      throw new TypeError('Local and internal source URLs are not allowed.');
    }
  }
  const freshnessState = body.freshnessState === undefined ? 'unknown' : text(body.freshnessState, 'Freshness state', 30);
  if (!FRESHNESS_STATES.has(freshnessState)) throw new TypeError('Freshness state is not supported.');
  const provenanceKind = body.provenanceKind === undefined ? 'user' : text(body.provenanceKind, 'Provenance kind', 20);
  if (!PROVENANCE_KINDS.has(provenanceKind)) throw new TypeError('Provenance kind is not supported.');
  return {
    claim: text(body.claim, 'Claim', 5000),
    category,
    reviewState,
    sourceName: text(body.sourceName, 'Source name', 300),
    sourceUrl,
    limitations: text(body.limitations ?? '', 'Limitations', 5000, false),
    observedAt: body.observedAt == null || body.observedAt === '' ? null : validDate(body.observedAt),
    sourcePublishedAt: body.sourcePublishedAt == null || body.sourcePublishedAt === '' ? null : validDate(body.sourcePublishedAt),
    freshnessState,
    freshnessAsOf: body.freshnessAsOf == null || body.freshnessAsOf === '' ? null : validDate(body.freshnessAsOf),
    provenanceKind,
    provenanceActorId: body.provenanceActorId == null || body.provenanceActorId === '' ? null : text(body.provenanceActorId, 'Provenance actor ID', 100),
    sourceProviderId: body.sourceProviderId == null || body.sourceProviderId === '' ? null : text(body.sourceProviderId, 'Source provider ID', 100)
  };
}

function validDate(value) {
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) throw new TypeError('Observed time must be a valid date.');
  return date.toISOString();
}

async function audit(client, userId, action, resourceType, resourceId, outcome = 'success') {
  await client.query(
    'INSERT INTO audit_events (id, actor_user_id, action, resource_type, resource_id, outcome) VALUES ($1, $2, $3, $4, $5, $6)',
    [randomUUID(), userId, action, resourceType, resourceId, outcome]
  );
}

async function transact(work) {
  const client = await getPool().connect();
  try {
    await client.query('BEGIN');
    const result = await work(client);
    await client.query('COMMIT');
    return result;
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {});
    throw error;
  } finally {
    client.release();
  }
}

export async function routeCaseRequest({ method, pathname, body, userId, domainInspector = inspectDomain }) {
  try {
    if (pathname === '/api/cases' && method === 'GET') {
      return await transact(async (client) => {
        const result = await client.query(
          "SELECT id, title, purpose, subject_type AS \"subjectType\", subject_label AS \"subjectLabel\", status, created_at AS \"createdAt\", updated_at AS \"updatedAt\", retention_deadline AS \"retentionDeadline\" FROM cases WHERE owner_user_id = $1 AND status <> 'deletion_pending' ORDER BY updated_at DESC LIMIT 100",
          [userId]
        );
        await audit(client, userId, 'list', 'case', null);
        return { status: 200, body: { cases: result.rows } };
      });
    }

    if (pathname === '/api/cases' && method === 'POST') {
      const input = validateCase(body);
      return await transact(async (client) => {
        const id = randomUUID();
        const result = await client.query(
          "INSERT INTO cases (id, owner_user_id, title, purpose, subject_type, subject_label) VALUES ($1, $2, $3, $4, $5, $6) RETURNING id, title, purpose, subject_type AS \"subjectType\", subject_label AS \"subjectLabel\", status, created_at AS \"createdAt\", updated_at AS \"updatedAt\"",
          [id, userId, input.title, input.purpose, input.subjectType, input.subjectLabel]
        );
        await audit(client, userId, 'create', 'case', id);
        return { status: 201, body: { case: result.rows[0] } };
      });
    }

    const domainImport = pathname.match(/^\/api\/cases\/([0-9a-f-]+)\/import-domain-observations$/i);
    const evidenceList = pathname.match(/^\/api\/cases\/([0-9a-f-]+)\/evidence$/i);
    const reportList = pathname.match(/^\/api\/cases\/([0-9a-f-]+)\/reports$/i);
    const reportExport = pathname.match(/^\/api\/cases\/([0-9a-f-]+)\/reports\/([0-9a-f-]+)\/export$/i);
    const reportItem = pathname.match(/^\/api\/cases\/([0-9a-f-]+)\/reports\/([0-9a-f-]+)$/i);
    const evidenceItem = pathname.match(/^\/api\/cases\/([0-9a-f-]+)\/evidence\/([0-9a-f-]+)$/i);
    const caseItem = pathname.match(/^\/api\/cases\/([0-9a-f-]+)$/i);
    if (!caseItem && !domainImport && !observationImport && !evidenceList && !reportList && !evidenceItem && !reportItem && !reportExport) return null;
    const caseId = (caseItem || domainImport || observationImport || evidenceList || reportList || evidenceItem || reportItem || reportExport)[1];
    if (!UUID.test(caseId)) return notFound();


    if (domainImport && method === 'POST') {
      const requestedDomain = text(body?.domain, 'Domain', 253).toLowerCase().replace(/\.$/, '');
      const owned = await transact(async (client) => {
        const result = await client.query(
          "SELECT id, subject_type AS \"subjectType\", subject_label AS \"subjectLabel\" FROM cases WHERE id = $1 AND owner_user_id = $2 AND status = 'open'",
          [caseId, userId]
        );
        if (result.rowCount !== 1) {
          await audit(client, userId, 'import_domain_observations', 'case', caseId, 'denied');
          return null;
        }
        return result.rows[0];
      });
      if (!owned) return notFound();
      if (owned.subjectType !== 'domain' || owned.subjectLabel.toLowerCase().replace(/\.$/, '') !== requestedDomain) {
        return invalid('The requested domain must match this open case subject.');
      }
      const inspection = await domainInspector(requestedDomain);
      return await transact(async (client) => {
        const current = await client.query(
          "SELECT id FROM cases WHERE id = $1 AND owner_user_id = $2 AND status = 'open' FOR UPDATE",
          [caseId, userId]
        );
        if (current.rowCount !== 1) {
          await audit(client, userId, 'import_domain_observations', 'case', caseId, 'denied');
          return notFound();
        }
        const imported = [];
        for (const observation of inspection.observations) {
          const statusMatch = observation.claim.match(/check result: (\{.*\})$/);
          let resultStatus = observation.reviewState === 'unavailable' ? 'error' : 'unknown';
          if (statusMatch) {
            try { resultStatus = JSON.parse(statusMatch[1]).status || resultStatus; } catch {}
          }
          const reviewState = resultStatus === 'error' || resultStatus === 'skipped' ? 'unavailable' : 'unreviewed';
          const id = randomUUID();
          const result = await client.query(
            'INSERT INTO evidence_items (id, case_id, creator_user_id, claim, category, review_state, source_name, source_url, observed_at, limitations, source_published_at, freshness_state, freshness_as_of, provenance_kind, provenance_actor_id, source_provider_id) VALUES ($1, $2, $3, $4, $5, $6, $7, NULL, $8, $9, NULL, $10, NULL, $11, NULL, $12) RETURNING id, claim, category, review_state AS "reviewState", source_name AS "sourceName", observed_at AS "observedAt", limitations, freshness_state AS "freshnessState", provenance_kind AS "provenanceKind", source_provider_id AS "sourceProviderId"',
            [id, caseId, userId, observation.claim + ' Retrieved at ' + observation.retrievedAt + '.', observation.category, reviewState, observation.source.name, null, observation.limitations.join(' '), observation.freshness.state, observation.provenance.kind, observation.source.providerId]
          );
          imported.push(result.rows[0]);
          await audit(client, userId, 'import', 'evidence', id);
        }
        await client.query('UPDATE cases SET updated_at = now() WHERE id = $1', [caseId]);
        await audit(client, userId, 'import_domain_observations', 'case', caseId);
        return { status: 201, body: { domain: inspection.domain, retrievedAt: inspection.retrievedAt, importedCount: imported.length, evidence: imported, limitations: inspection.limitations } };
      });
    }

    if (observationImport && method === 'POST') {
      if (!body || typeof body !== 'object' || Array.isArray(body) || !Array.isArray(body.observations) ||
          body.observations.length < 1 || body.observations.length > 100) {
        return invalid('Provide between 1 and 100 normalized observations.');
      }
      const observations = body.observations.map((item) => normalizeObservation(item));
      return await transact(async (client) => {
        const owned = await client.query(
          "SELECT id, subject_type AS \"subjectType\", subject_label AS \"subjectLabel\" FROM cases WHERE id = $1 AND owner_user_id = $2 AND status = 'open' FOR UPDATE",
          [caseId, userId]
        );
        if (owned.rowCount !== 1) {
          await audit(client, userId, 'import_observations', 'case', caseId, 'denied');
          return notFound();
        }
        const subject = owned.rows[0];
        const imported = [];
        for (const observation of observations) {
          const expectedType = observation.subject.type === 'organization' ? 'business' : observation.subject.type;
          if (expectedType !== subject.subjectType ||
              observation.subject.value.trim().toLowerCase() !== subject.subjectLabel.trim().toLowerCase()) {
            return invalid('Every observation subject must match this case subject.');
          }
          const id = randomUUID();
          const limitations = observation.limitations.join(' ');
          const result = await client.query(
            'INSERT INTO evidence_items (id, case_id, creator_user_id, claim, category, review_state, source_name, source_url, observed_at, limitations, source_published_at, freshness_state, freshness_as_of, provenance_kind, provenance_actor_id, source_provider_id) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16) RETURNING id, claim, category, review_state AS "reviewState", source_name AS "sourceName", source_url AS "sourceUrl", observed_at AS "observedAt", source_published_at AS "sourcePublishedAt", created_at AS "createdAt", limitations, freshness_state AS "freshnessState", freshness_as_of AS "freshnessAsOf", provenance_kind AS "provenanceKind", provenance_actor_id AS "provenanceActorId", source_provider_id AS "sourceProviderId"',
            [id, caseId, userId, observation.claim, observation.category, observation.reviewState,
              observation.source.name, observation.source.url, observation.observedAt, limitations,
              observation.sourcePublishedAt, observation.freshness.state, observation.freshness.asOf,
              observation.provenance.kind, observation.provenance.actorId, observation.source.providerId]
          );
          imported.push(result.rows[0]);
          await audit(client, userId, 'import', 'evidence', id);
        }
        await client.query('UPDATE cases SET updated_at = now() WHERE id = $1', [caseId]);
        await audit(client, userId, 'import_observations', 'case', caseId);
        return { status: 201, body: { importedCount: imported.length, evidence: imported } };
      });
    }

    if (evidenceItem && !UUID.test(evidenceItem[2])) return notFound();
    if (reportItem && !UUID.test(reportItem[2])) return notFound();
    if (reportExport && !UUID.test(reportExport[2])) return notFound();

    if (method === 'GET' && caseItem) {
      return await transact(async (client) => {
        const result = await client.query(
          "SELECT id, title, purpose, subject_type AS \"subjectType\", subject_label AS \"subjectLabel\", status, created_at AS \"createdAt\", updated_at AS \"updatedAt\", retention_deadline AS \"retentionDeadline\" FROM cases WHERE id = $1 AND owner_user_id = $2 AND status <> 'deletion_pending'",
          [caseId, userId]
        );
        if (result.rowCount !== 1) {
          await audit(client, userId, 'read', 'case', caseId, 'denied');
          return notFound();
        }
        await audit(client, userId, 'read', 'case', caseId);
        return { status: 200, body: { case: result.rows[0] } };
      });
    }

    if (method === 'DELETE' && caseItem) {
      if (!body || body.confirm !== true) return invalid('Explicit confirmation is required to request case deletion.');
      return await transact(async (client) => {
        const result = await client.query(
          "UPDATE cases SET status = 'deletion_pending', updated_at = now() WHERE id = $1 AND owner_user_id = $2 AND status <> 'deletion_pending' RETURNING id",
          [caseId, userId]
        );
        if (result.rowCount !== 1) {
          await audit(client, userId, 'delete_request', 'case', caseId, 'denied');
          return notFound();
        }
        await audit(client, userId, 'delete_request', 'case', caseId);
        return { status: 202, body: { id: caseId, status: 'deletion_pending', message: 'The case is hidden from normal access. Physical deletion and backup expiry require the configured retention process.' } };
      });
    }

    if (method === 'PATCH' && caseItem) {
      const input = validateCase(body, true);
      const fields = {
        title: 'title', purpose: 'purpose', subjectType: 'subject_type',
        subjectLabel: 'subject_label', status: 'status'
      };
      return await transact(async (client) => {
        const current = await client.query(
          "SELECT id FROM cases WHERE id = $1 AND owner_user_id = $2 AND status <> 'deletion_pending' FOR UPDATE",
          [caseId, userId]
        );
        if (current.rowCount !== 1) {
          await audit(client, userId, 'update', 'case', caseId, 'denied');
          return notFound();
        }
        const values = [caseId, userId];
        const assignments = [];
        for (const [key, value] of Object.entries(input)) {
          values.push(value);
          assignments.push(fields[key] + ' = $' + values.length);
        }
        assignments.push('updated_at = now()');
        const updated = await client.query(
          'UPDATE cases SET ' + assignments.join(', ') + ' WHERE id = $1 AND owner_user_id = $2 RETURNING id, title, purpose, subject_type AS "subjectType", subject_label AS "subjectLabel", status, created_at AS "createdAt", updated_at AS "updatedAt"',
          values
        );
        await audit(client, userId, input.status === 'archived' ? 'archive' : 'update', 'case', caseId);
        return { status: 200, body: { case: updated.rows[0] } };
      });
    }

    if (evidenceList && method === 'GET') {
      return await transact(async (client) => {
        const owned = await client.query(
          "SELECT id FROM cases WHERE id = $1 AND owner_user_id = $2 AND status <> 'deletion_pending'",
          [caseId, userId]
        );
        if (owned.rowCount !== 1) {
          await audit(client, userId, 'list', 'evidence', caseId, 'denied');
          return notFound();
        }
        const result = await client.query(
          'SELECT id, claim, category, review_state AS "reviewState", source_name AS "sourceName", source_url AS "sourceUrl", observed_at AS "observedAt", source_published_at AS "sourcePublishedAt", created_at AS "createdAt", updated_at AS "updatedAt", limitations, correction_note AS "correctionNote", retracted_at AS "retractedAt", freshness_state AS "freshnessState", freshness_as_of AS "freshnessAsOf", provenance_kind AS "provenanceKind", provenance_actor_id AS "provenanceActorId", source_provider_id AS "sourceProviderId" FROM evidence_items WHERE case_id = $1 ORDER BY created_at DESC LIMIT 200',
          [caseId]
        );
        await audit(client, userId, 'list', 'evidence', caseId);
        return { status: 200, body: { evidence: result.rows } };
      });
    }

    if (evidenceList && method === 'POST') {
      const input = validateEvidence(body);
      return await transact(async (client) => {
        const owned = await client.query(
          "SELECT id FROM cases WHERE id = $1 AND owner_user_id = $2 AND status = 'open' FOR UPDATE",
          [caseId, userId]
        );
        if (owned.rowCount !== 1) {
          await audit(client, userId, 'create', 'evidence', caseId, 'denied');
          return notFound();
        }
        const id = randomUUID();
        const result = await client.query(
          'INSERT INTO evidence_items (id, case_id, creator_user_id, claim, category, review_state, source_name, source_url, observed_at, limitations, source_published_at, freshness_state, freshness_as_of, provenance_kind, provenance_actor_id, source_provider_id) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16) RETURNING id, claim, category, review_state AS "reviewState", source_name AS "sourceName", source_url AS "sourceUrl", observed_at AS "observedAt", source_published_at AS "sourcePublishedAt", created_at AS "createdAt", limitations, freshness_state AS "freshnessState", freshness_as_of AS "freshnessAsOf", provenance_kind AS "provenanceKind", provenance_actor_id AS "provenanceActorId", source_provider_id AS "sourceProviderId"',
          [id, caseId, userId, input.claim, input.category, input.reviewState, input.sourceName, input.sourceUrl, input.observedAt, input.limitations, input.sourcePublishedAt, input.freshnessState, input.freshnessAsOf, input.provenanceKind, input.provenanceActorId, input.sourceProviderId]
        );
        await client.query('UPDATE cases SET updated_at = now() WHERE id = $1', [caseId]);
        await audit(client, userId, 'create', 'evidence', id);
        return { status: 201, body: { evidence: result.rows[0] } };
      });
    }

    if (evidenceItem && method === 'PATCH') {
      if (!body || typeof body !== 'object' || Array.isArray(body)) return invalid('Request body must be an object.');
      const updates = {};
      if (Object.hasOwn(body, 'reviewState')) {
        updates.reviewState = text(body.reviewState, 'Review state', 40);
        if (!REVIEW_STATES.has(updates.reviewState)) throw new TypeError('Review state is not supported.');
      }
      if (Object.hasOwn(body, 'correctionNote')) updates.correctionNote = text(body.correctionNote, 'Correction note', 2000, false);
      if (Object.hasOwn(body, 'limitations')) updates.limitations = text(body.limitations, 'Limitations', 5000, false);
      if (!Object.keys(updates).length) return invalid('No supported evidence fields were supplied.');
      return await transact(async (client) => {
        const owned = await client.query(
          "SELECT id FROM cases WHERE id = $1 AND owner_user_id = $2 AND status = 'open' FOR UPDATE",
          [caseId, userId]
        );
        if (owned.rowCount !== 1) {
          await audit(client, userId, 'update', 'evidence', evidenceItem[2], 'denied');
          return notFound();
        }
        const values = [evidenceItem[2], caseId];
        const assignments = [];
        for (const [key, value] of Object.entries(updates)) {
          values.push(value);
          const column = { reviewState: 'review_state', correctionNote: 'correction_note', limitations: 'limitations' }[key];
          assignments.push(column + ' = $' + values.length);
        }
        assignments.push('updated_at = now()');
        if (updates.reviewState === 'retracted') assignments.push('retracted_at = COALESCE(retracted_at, now())');
        const result = await client.query(
          'UPDATE evidence_items SET ' + assignments.join(', ') + ' WHERE id = $1 AND case_id = $2 RETURNING id, claim, category, review_state AS "reviewState", source_name AS "sourceName", source_url AS "sourceUrl", updated_at AS "updatedAt", limitations, correction_note AS "correctionNote", retracted_at AS "retractedAt"',
          values
        );
        if (result.rowCount !== 1) {
          await audit(client, userId, 'update', 'evidence', evidenceItem[2], 'denied');
          return notFound();
        }
        await audit(client, userId, 'update', 'evidence', evidenceItem[2]);
        return { status: 200, body: { evidence: result.rows[0] } };
      });
    }

    if (reportList && method === 'GET') {
      return await transact(async (client) => {
        const owned = await client.query(
          "SELECT id FROM cases WHERE id = $1 AND owner_user_id = $2 AND status <> 'deletion_pending'",
          [caseId, userId]
        );
        if (owned.rowCount !== 1) {
          await audit(client, userId, 'list', 'report', caseId, 'denied');
          return notFound();
        }
        const result = await client.query(
          'SELECT id, version_number AS "versionNumber", generated_at AS "generatedAt" FROM report_versions WHERE case_id = $1 AND deleted_at IS NULL ORDER BY version_number DESC LIMIT 100',
          [caseId]
        );
        await audit(client, userId, 'list', 'report', caseId);
        return { status: 200, body: { reports: result.rows } };
      });
    }

    if (reportItem && method === 'GET') {
      return await transact(async (client) => {
        const owned = await client.query(
          "SELECT id FROM cases WHERE id = $1 AND owner_user_id = $2 AND status <> 'deletion_pending'",
          [caseId, userId]
        );
        if (owned.rowCount !== 1) {
          await audit(client, userId, 'read', 'report', reportItem[2], 'denied');
          return notFound();
        }
        const result = await client.query(
          'SELECT id, version_number AS "versionNumber", generated_at AS "generatedAt", report_data AS "reportData" FROM report_versions WHERE id = $1 AND case_id = $2 AND deleted_at IS NULL',
          [reportItem[2], caseId]
        );
        if (result.rowCount !== 1) {
          await audit(client, userId, 'read', 'report', reportItem[2], 'denied');
          return notFound();
        }
        await audit(client, userId, 'read', 'report', reportItem[2]);
        return { status: 200, body: { report: result.rows[0] } };
      });
    }

    if (reportExport && method === 'POST') {
      return await transact(async (client) => {
        const owned = await client.query(
          "SELECT id FROM cases WHERE id = $1 AND owner_user_id = $2 AND status <> 'deletion_pending'",
          [caseId, userId]
        );
        if (owned.rowCount !== 1) {
          await audit(client, userId, 'export', 'export', reportExport[2], 'denied');
          return notFound();
        }
        const result = await client.query(
          'SELECT id, version_number AS "versionNumber", generated_at AS "generatedAt", report_data AS "reportData" FROM report_versions WHERE id = $1 AND case_id = $2 AND deleted_at IS NULL',
          [reportExport[2], caseId]
        );
        if (result.rowCount !== 1) {
          await audit(client, userId, 'export', 'export', reportExport[2], 'denied');
          return notFound();
        }
        await audit(client, userId, 'export', 'export', reportExport[2]);
        return { status: 200, body: { report: result.rows[0] } };
      });
    }

    if (reportList && method === 'POST') {
      return await transact(async (client) => {
        const owned = await client.query(
          "SELECT id, title, purpose, subject_type, subject_label FROM cases WHERE id = $1 AND owner_user_id = $2 AND status = 'open' FOR UPDATE",
          [caseId, userId]
        );
        if (owned.rowCount !== 1) {
          await audit(client, userId, 'create', 'report', caseId, 'denied');
          return notFound();
        }
        const evidence = await client.query(
          'SELECT id, claim, category, review_state, source_name, source_url, observed_at, source_published_at, created_at, limitations, correction_note, retracted_at, freshness_state, freshness_as_of, provenance_kind, provenance_actor_id, source_provider_id FROM evidence_items WHERE case_id = $1 ORDER BY created_at ASC LIMIT 200',
          [caseId]
        );
        if (evidence.rowCount < 1) return invalid('Add at least one evidence item before generating a report.');
        const subject = owned.rows[0];
        const reportData = {
          schemaVersion: '1.0',
          reportType: 'case-evidence-summary',
          case: { id: caseId, title: subject.title, purpose: subject.purpose },
          subject: { type: subject.subject_type, name: subject.subject_label },
          generatedAt: new Date().toISOString(),
          findings: evidence.rows.map((item, index) => ({
            id: item.id,
            order: index + 1,
            claim: item.claim,
            category: item.category,
            verificationState: item.review_state,
            source: { name: item.source_name, url: item.source_url },
            observedAt: item.observed_at,
            sourcePublishedAt: item.source_published_at,
            recordedAt: item.created_at,
            freshness: { state: item.freshness_state, asOf: item.freshness_as_of },
            provenance: { kind: item.provenance_kind, actorId: item.provenance_actor_id },
            sourceProviderId: item.source_provider_id,
            limitations: item.limitations,
            correctionNote: item.correction_note,
            retractedAt: item.retracted_at
          })),
          interpretation: {
            status: 'analyst_supplied',
            statement: 'This report summarizes evidence entered into the case. Tracelynt has not independently verified external claims or source content.',
            guidance: 'Review original sources, note conflicting evidence, and do not treat correlation, a single source, or an allegation as proof of identity or wrongdoing.'
          },
          limitations: [
            'Evidence items are user-entered records and are not independently verified by this report generator.',
            'Source links are recorded but not fetched. A link does not prove a claim is accurate or current.',
            'Reports reflect evidence recorded at generation time; later corrections or retractions do not rewrite this snapshot.'
          ]
        };
        const versionResult = await client.query(
          'SELECT COALESCE(MAX(version_number), 0) + 1 AS version FROM report_versions WHERE case_id = $1',
          [caseId]
        );
        const id = randomUUID();
        const result = await client.query(
          'INSERT INTO report_versions (id, case_id, creator_user_id, version_number, report_data) VALUES ($1, $2, $3, $4, $5::jsonb) RETURNING id, version_number AS "versionNumber", generated_at AS "generatedAt", report_data AS "reportData"',
          [id, caseId, userId, versionResult.rows[0].version, JSON.stringify(reportData)]
        );
        await audit(client, userId, 'create', 'report', id);
        return { status: 201, body: { report: result.rows[0] } };
      });
    }

    return { status: 405, body: { error: 'METHOD_NOT_ALLOWED' } };
  } catch (error) {
    if (error instanceof TypeError || error instanceof RangeError) return invalid(error.message);
    throw error;
  }
}
