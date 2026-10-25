import { randomUUID } from 'node:crypto';
import { getPool } from './db.js';

const SUBJECT_TYPES = new Set(['business', 'domain', 'phone_number', 'other']);
const REVIEW_STATES = new Set(['unreviewed', 'corroborated', 'disputed', 'unavailable', 'retracted']);
const EVIDENCE_CATEGORIES = new Set(['public_record', 'direct_observation', 'provider_data', 'user_report', 'analyst_assessment']);
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
    if (['localhost'].includes(parsed.hostname) || parsed.hostname.endsWith('.localhost') || parsed.hostname.endsWith('.local') || parsed.hostname.endsWith('.internal')) {
      throw new TypeError('Local and internal source URLs are not allowed.');
    }
  }
  return {
    claim: text(body.claim, 'Claim', 5000),
    category,
    reviewState,
    sourceName: text(body.sourceName, 'Source name', 300),
    sourceUrl,
    limitations: text(body.limitations ?? '', 'Limitations', 5000, false),
    observedAt: body.observedAt == null || body.observedAt === '' ? null : validDate(body.observedAt)
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

export async function routeCaseRequest({ method, pathname, body, userId }) {
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

    const evidenceList = pathname.match(/^\/api\/cases\/([0-9a-f-]+)\/evidence$/i);
    const reportList = pathname.match(/^\/api\/cases\/([0-9a-f-]+)\/reports$/i);
    const evidenceItem = pathname.match(/^\/api\/cases\/([0-9a-f-]+)\/evidence\/([0-9a-f-]+)$/i);
    const caseItem = pathname.match(/^\/api\/cases\/([0-9a-f-]+)$/i);
    if (!caseItem && !evidenceList && !reportList && !evidenceItem) return null;
    const caseId = (caseItem || evidenceList || reportList || evidenceItem)[1];
    if (!UUID.test(caseId)) return notFound();

    if (evidenceItem && !UUID.test(evidenceItem[2])) return notFound();

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
          'SELECT id, claim, category, review_state AS "reviewState", source_name AS "sourceName", source_url AS "sourceUrl", observed_at AS "observedAt", created_at AS "createdAt", updated_at AS "updatedAt", limitations, correction_note AS "correctionNote", retracted_at AS "retractedAt" FROM evidence_items WHERE case_id = $1 ORDER BY created_at DESC LIMIT 200',
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
          'INSERT INTO evidence_items (id, case_id, creator_user_id, claim, category, review_state, source_name, source_url, observed_at, limitations) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10) RETURNING id, claim, category, review_state AS "reviewState", source_name AS "sourceName", source_url AS "sourceUrl", observed_at AS "observedAt", created_at AS "createdAt", limitations',
          [id, caseId, userId, input.claim, input.category, input.reviewState, input.sourceName, input.sourceUrl, input.observedAt, input.limitations]
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
          'SELECT id, version_number AS "versionNumber", generated_at AS "generatedAt", report_data AS "reportData" FROM report_versions WHERE case_id = $1 AND deleted_at IS NULL ORDER BY version_number DESC LIMIT 100',
          [caseId]
        );
        await audit(client, userId, 'list', 'report', caseId);
        return { status: 200, body: { reports: result.rows } };
      });
    }

    if (reportList && method === 'POST') {
      if (!body || typeof body !== 'object' || Array.isArray(body)) return invalid('Report body must be an object.');
      const reportData = JSON.stringify(body);
      if (reportData.length > 80_000) return invalid('Report snapshot is too large.');
      return await transact(async (client) => {
        const owned = await client.query(
          "SELECT id FROM cases WHERE id = $1 AND owner_user_id = $2 AND status = 'open' FOR UPDATE",
          [caseId, userId]
        );
        if (owned.rowCount !== 1) {
          await audit(client, userId, 'create', 'report', caseId, 'denied');
          return notFound();
        }
        const versionResult = await client.query(
          'SELECT COALESCE(MAX(version_number), 0) + 1 AS version FROM report_versions WHERE case_id = $1',
          [caseId]
        );
        const id = randomUUID();
        const result = await client.query(
          'INSERT INTO report_versions (id, case_id, creator_user_id, version_number, report_data) VALUES ($1, $2, $3, $4, $5::jsonb) RETURNING id, version_number AS "versionNumber", generated_at AS "generatedAt", report_data AS "reportData"',
          [id, caseId, userId, versionResult.rows[0].version, reportData]
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
