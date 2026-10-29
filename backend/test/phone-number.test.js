import test from 'node:test';
import assert from 'node:assert/strict';
import { inspectPhoneNumber } from '../src/phone-number.js';

test('normalizes a Nigerian local number with maintained numbering metadata', () => {
  const result = inspectPhoneNumber('08012345678');
  assert.equal(result.e164, '+2348012345678');
  assert.equal(result.country, 'NG');
  assert.equal(result.countryCallingCode, '234');
  assert.equal(typeof result.possible, 'boolean');
  assert.equal(typeof result.valid, 'boolean');
  assert.ok(result.checkedAt);
  assert.match(result.metadataSource, /libphonenumber-js\/max/);
});

test('parses international numbers and reports their country when identifiable', () => {
  const result = inspectPhoneNumber('+1 202 555 0123');
  assert.equal(result.e164, '+12025550123');
  assert.equal(result.countryCallingCode, '1');
  assert.equal(result.country, 'US');
});

test('does not label malformed input as a valid number', () => {
  const result = inspectPhoneNumber('123');
  assert.equal(result.valid, false);
  assert.equal(result.possible, false);
});

test('rejects URLs, letters, empty input, and oversized values', () => {
  for (const value of ['https://example.com', 'call-me-now', '', '1'.repeat(161)]) assert.throws(() => inspectPhoneNumber(value));
});

test('states that format validity is not identity or subscriber verification', () => {
  const result = inspectPhoneNumber('+234 801 234 5678');
  assert.ok(result.limitations.some(item => /particular person/.test(item)));
  assert.ok(result.limitations.some(item => /subscriber/.test(item)));
});
