import test from 'node:test';
import assert from 'node:assert/strict';
import { getListenHost } from '../src/listen-config.js';

test('binds Render web services to all interfaces', () => {
  assert.equal(getListenHost({ RENDER: 'true' }), '0.0.0.0');
  assert.equal(getListenHost({ RENDER: 'true', HOST: '127.0.0.1' }), '0.0.0.0');
});

test('keeps local development loopback-only by default', () => {
  assert.equal(getListenHost({}), '127.0.0.1');
});

test('respects an explicit host outside Render', () => {
  assert.equal(getListenHost({ HOST: '0.0.0.0' }), '0.0.0.0');
});
