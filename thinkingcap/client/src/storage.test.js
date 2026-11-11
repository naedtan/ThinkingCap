import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readStored, writeStored } from './storage.js';
import { normalizeLearning } from '../../shared/learning.mjs';

test('unavailable or malformed storage falls back to usable defaults', () => {
  assert.deepEqual(readStored('key', normalizeLearning, { getItem: () => '{broken' }), normalizeLearning());
  assert.deepEqual(readStored('key', normalizeLearning, { getItem: () => { throw new Error('Denied'); } }), normalizeLearning());
  assert.equal(writeStored('key', {}, { setItem: () => { throw new Error('Quota exceeded'); } }), false);
});

test('stored preference values are repaired and writes round-trip JSON', () => {
  const values = new Map();
  const storage = { getItem: (key) => values.get(key), setItem: (key, value) => values.set(key, value) };
  assert.equal(writeStored('key', { level: 'low', types: { guided: false } }, storage), true);
  const value = readStored('key', normalizeLearning, storage);
  assert.equal(value.level, 'low');
  assert.equal(value.types.guided, false);
  assert.equal(value.types.practice, true);
});
