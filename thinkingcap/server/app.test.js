import { test } from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { createApp } from './app.js';
import { FREE_TIER_MODELS } from './models.js';

const base = { intent: 'start', topic: 'Binary search', learning: { level: 'low' }, history: [] };
const quiet = { info() {}, warn() {}, error() {} };

async function serve(t, options = {}) {
  const server = createApp({ models: [FREE_TIER_MODELS[0]], logger: quiet, ...options }).listen(0, '127.0.0.1');
  await once(server, 'listening');
  t.after(() => new Promise((resolve) => server.close(resolve)));
  const url = `http://127.0.0.1:${server.address().port}`;
  return {
    get: (path) => fetch(url + path),
    post: (body, signal) => fetch(url + '/api/tutor', { method: 'POST', headers: { 'content-type': 'application/json' },
      body: typeof body === 'string' ? body : JSON.stringify(body), signal }),
  };
}

test('health and missing-key errors are available without real credentials', async (t) => {
  const server = await serve(t);
  const health = await (await server.get('/api/health')).json();
  assert.equal(health.model, FREE_TIER_MODELS[0]);
  assert.equal(health.hasKey, false);
  const response = await server.post(base);
  assert.equal(response.status, 500);
  assert.match((await response.json()).error, /Missing GEMINI_API_KEY/);
});

test('HTTP requests forward preferences and return a validated tutor card and model', async (t) => {
  const calls = [];
  const server = await serve(t, { ai: { models: { generateContent: async (request) => {
    calls.push(request);
    return { text: JSON.stringify({ kind: 'concept', message: 'Search a sorted list by halving the remaining range.' }) };
  } } } });
  const response = await server.post(base);
  assert.equal(response.status, 200);
  const result = await response.json();
  assert.equal(result.model, FREE_TIER_MODELS[0]);
  assert.equal(result.turn.kind, 'concept');
  assert.match(calls[0].config.systemInstruction, /Interaction level: low/);
  assert.ok(calls[0].config.abortSignal instanceof AbortSignal);
});

test('bad preferences, history, JSON, and oversized bodies produce actionable JSON client errors', async (t) => {
  let calls = 0;
  const server = await serve(t, { ai: { models: { generateContent: () => { calls++; throw new Error('Must not call'); } } } });
  for (const body of [{ ...base, learning: { level: 'invalid' } }, { ...base, history: [null] }, '{bad']) {
    const response = await server.post(body);
    assert.equal(response.status, 400);
    assert.equal(typeof (await response.json()).error, 'string');
  }
  const tooLarge = await server.post({ ...base, topic: 'x'.repeat(270000) });
  assert.equal(tooLarge.status, 413);
  assert.match((await tooLarge.json()).error, /too large/);
  assert.equal(calls, 0);
});

test('malformed model responses never create blank cards or start a fallback loop', async (t) => {
  let calls = 0;
  const server = await serve(t, { ai: { models: { generateContent: async () => { calls++; return { text: 'null' }; } } } });
  const response = await server.post(base);
  assert.equal(response.status, 502);
  assert.match((await response.json()).error, /could not respond/);
  assert.equal(calls, 1);
});

test('upstream access errors are actionable without exposing raw SDK messages in logs', async (t) => {
  const logs = [];
  const server = await serve(t, { logger: { ...quiet, error: (...args) => logs.push(args) }, ai: { models: {
    generateContent: async () => { throw Object.assign(new Error('SECRET-SHOULD-NOT-LOG'), { status: 403 }); },
  } } });
  const response = await server.post(base);
  assert.equal(response.status, 502);
  assert.match((await response.json()).error, /credentials or project access/);
  assert.doesNotMatch(JSON.stringify(logs), /SECRET-SHOULD-NOT-LOG/);
});

test('exhausted transient and quota failures retain distinct HTTP statuses', async (t) => {
  for (const status of [503, 429]) {
    const server = await serve(t, { ai: { models: { generateContent: async () => { throw Object.assign(new Error('Busy'), { status }); } } } });
    const response = await server.post(base);
    assert.equal(response.status, status);
    assert.match((await response.json()).error, status === 429 ? /quota/ : /unavailable/);
  }
});

test('disconnecting a browser cancels upstream work rather than attempting more models', async (t) => {
  let started, stopped;
  const ready = new Promise((resolve) => { started = resolve; });
  const aborted = new Promise((resolve) => { stopped = resolve; });
  const server = await serve(t, { models: [...FREE_TIER_MODELS], ai: { models: {
    generateContent: ({ config }) => new Promise((_resolve, reject) => {
      started();
      config.abortSignal.addEventListener('abort', () => { stopped(); reject(config.abortSignal.reason); }, { once: true });
    }),
  } } });
  const controller = new AbortController();
  const response = server.post(base, controller.signal);
  await ready;
  controller.abort();
  await assert.rejects(response, { name: 'AbortError' });
  await new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('Upstream cancellation was not observed')), 2000);
    aborted.then(() => { clearTimeout(timer); resolve(); });
  });
});
