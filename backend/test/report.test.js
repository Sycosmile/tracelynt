import test from 'node:test';
import assert from 'node:assert/strict';
import { createEvidenceReport } from '../src/report.js';

const validInput = {
  subject: { type: 'business', name: 'Example Trading Ltd' },
  findings: [{
    claim: 'The official site lists this business contact page.',
    category: 'direct_observation',
    verificationState: 'unreviewed',
    sourceName: 'Example official website',
    sourceUrl: 'https://example.com/contact#details',
    notes: 'Review against the registry before relying on this.'
  }]
};

test('creates a timestamped report with provenance and explicit limitations', () => {
  const report = createEvidenceReport(validInput, () => new Date('2026-10-25T10:00:00.000Z'));
  assert.equal(report.schemaVersion, '1.0');
  assert.equal(report.subject.name, 'Example Trading Ltd');
  assert.equal(report.generatedAt, '2026-10-25T10:00:00.000Z');
  assert.equal(report.findings[0].source.url, 'https://example.com/contact');
  assert.equal(report.findings[0].verificationState, 'unreviewed');
  assert.match(report.interpretation.statement, /not independently verified/);
  assert.ok(report.limitations.length >= 3);
});

test('rejects malformed report subjects and empty or excessive findings', () => {
  assert.throws(() => createEvidenceReport(null), /JSON object/);
  assert.throws(() => createEvidenceReport({ subject: { type: 'person', name: 'A' }, findings: [validInput.findings[0]] }), /Subject type/);
  assert.throws(() => createEvidenceReport({ subject: validInput.subject, findings: [] }), /between 1 and 20/);
  assert.throws(() => createEvidenceReport({ subject: validInput.subject, findings: Array(21).fill(validInput.findings[0]) }), /between 1 and 20/);
});

test('rejects unsupported categories and verification states', () => {
  assert.throws(() => createEvidenceReport({ ...validInput, findings: [{ ...validInput.findings[0], category: 'secret_database' }] }), /category is not supported/);
  assert.throws(() => createEvidenceReport({ ...validInput, findings: [{ ...validInput.findings[0], verificationState: 'confirmed_identity' }] }), /Verification state is not supported/);
});

test('rejects non-HTTPS, credential-bearing, local, and private-IP source links', () => {
  for (const sourceUrl of [
    'http://example.com',
    'https://user:pass@example.com/path',
    'https://localhost',
    'https://service.internal',
    'https://127.0.0.1/source',
    'https://192.168.1.1/source'
  ]) {
    assert.throws(() => createEvidenceReport({ ...validInput, findings: [{ ...validInput.findings[0], sourceUrl }] }), undefined, sourceUrl);
  }
});

test('requires source attribution and bounded text fields', () => {
  assert.throws(() => createEvidenceReport({ ...validInput, findings: [{ ...validInput.findings[0], sourceName: '' }] }), /Source name is required/);
  assert.throws(() => createEvidenceReport({ ...validInput, findings: [{ ...validInput.findings[0], claim: 'x'.repeat(1001) }] }), /Finding claim is too long/);
});
