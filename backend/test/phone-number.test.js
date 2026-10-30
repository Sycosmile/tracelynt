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
  assert.equal(result.providerResult.providerId, 'libphonenumber-js');
  assert.equal(result.providerResult.outcome, 'success');
  assert.equal(result.providerResult.records[0].e164, result.e164);
  assert.equal(result.providerResult.retrievedAt, result.checkedAt);
});

test('parses international numbers and reports their country when identifiable', () => {
  const result = inspectPhoneNumber('+1 202 555 0123');
  assert.equal(result.e164, '+12025550123');
  assert.equal(result.countryCallingCode, '1');
  assert.equal(result.country, 'US');
  assert.equal(result.providerResult.outcome, 'success');
});

test('does not label malformed input as a valid number', () => {
  const result = inspectPhoneNumber('123');
  assert.equal(result.valid, false);
  assert.equal(result.possible, false);
  assert.equal(result.providerResult.outcome, 'error');
  assert.equal(result.providerResult.errors[0].code, 'NUMBER_NOT_PARSEABLE');
  assert.equal(result.providerResult.errors[0].retryable, false);
});

test('rejects URLs, letters, empty input, and oversized values', () => {
  for (const value of ['https://example.com', 'call-me-now', '', '1'.repeat(161)]) assert.throws(() => inspectPhoneNumber(value));
});

test('states that format validity is not identity or subscriber verification', () => {
  const result = inspectPhoneNumber('+234 801 234 5678');
  assert.ok(result.limitations.some(item => /particular person/.test(item)));
  assert.ok(result.limitations.some(item => /subscriber/.test(item)));
  assert.ok(result.providerResult.limitations.length > 0);
});


test('accepts the documented input-length boundary after trimming whitespace', () => {
  const input = ' '.repeat(149) + '08012345678';
  assert.equal(input.length, 160);
  const result = inspectPhoneNumber(input);
  assert.equal(result.e164, '+2348012345678');
});

test('normalizes common formatting variants to the same E.164 number', () => {
  const variants = [
    '08012345678',
    '080 1234 5678',
    '+234 801 234 5678',
    '+234-801-234-5678'
  ];
  for (const value of variants) assert.equal(inspectPhoneNumber(value).e164, '+2348012345678', value);
});
