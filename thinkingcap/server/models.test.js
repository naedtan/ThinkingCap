import { test } from 'node:test';
import assert from 'node:assert/strict';
import { GoogleGenAI } from '@google/genai';
import { configuredModels, FREE_TIER_MODELS, generateWithFallback, ModelUnavailable } from './models.js';

const request = {
  contents: 'Student topic, history, and current task.',
  config: { systemInstruction: 'Current sidebar preferences.', responseMimeType: 'application/json', responseSchema: { type: 'OBJECT' } },
};
const apiError = (status) => Object.assign(new Error('Upstream failed.'), { status });

function setup(outcomes) {
  const calls = [];
  const delays = [];
  const failures = [];
  return {
    calls, delays, failures,
    options: {
      models: configuredModels({}), request,
      ai: { models: { generateContent: async (payload) => {
        calls.push(payload);
        const result = outcomes[calls.length - 1];
        if (result instanceof Error) throw result;
        return result;
      } } },
      sleep: async (ms) => { delays.push(ms); }, random: () => 0.5,
      onFailure: (failure) => failures.push(failure),
    },
  };
}

test('default chain uses the preferred availability order', () => {
  assert.deepEqual(configuredModels({}), ['gemini-3.6-flash', 'gemini-3.5-flash-lite', 'gemini-3.8-flash', 'gemini-3.1-flash-lite']);
});

test('configuration trims, deduplicates, supports disabling fallback, and blocks other models', () => {
  assert.deepEqual(configuredModels({ GEMINI_MODEL: ' gemini-3.6-flash ', GEMINI_FALLBACK_MODELS: 'gemini-3.6-flash, gemini-3.1-flash-lite,,' }), ['gemini-3.6-flash', 'gemini-3.1-flash-lite']);
  assert.deepEqual(configuredModels({ GEMINI_FALLBACK_MODELS: '' }), ['gemini-3.6-flash']);
  assert.equal(configuredModels({ GEMINI_MODEL: 'gemini-3.5-flash-lite' }).length, 4);
  assert.throws(() => configuredModels({ GEMINI_MODEL: 'gemini-4-carbon' }), /Unsupported GEMINI model/);
  assert.throws(() => configuredModels({ GEMINI_FALLBACK_MODELS: 'gemini-3.1-pro-preview' }), /Unsupported GEMINI model/);
});

test('primary success makes exactly one attempt with a timeout and no nested SDK retries', async () => {
  const response = { text: '{"kind":"concept","message":"Hello"}' };
  const { options, calls, delays } = setup([response]);
  assert.deepEqual(await generateWithFallback(options), { response, model: FREE_TIER_MODELS[0] });
  assert.equal(calls.length, 1);
  assert.deepEqual(delays, []);
  assert.deepEqual(calls[0].config.httpOptions, { timeout: 20000, retryOptions: { attempts: 1 } });
});

test('503 advances in order and preserves prompt, history, and response schema', async () => {
  const response = { text: 'success' };
  const { options, calls, delays, failures } = setup([apiError(503), response]);
  const original = structuredClone(request);
  assert.deepEqual(await generateWithFallback(options), { response, model: FREE_TIER_MODELS[1] });
  assert.deepEqual(calls.map(({ model }) => model), FREE_TIER_MODELS.slice(0, 2));
  assert.deepEqual(delays, [1125]);
  assert.deepEqual(failures, [{ model: FREE_TIER_MODELS[0], status: 503 }]);
  for (const call of calls) {
    assert.equal(call.contents, request.contents);
    assert.equal(call.config.systemInstruction, request.config.systemInstruction);
    assert.deepEqual(call.config.responseSchema, request.config.responseSchema);
    assert.equal(call.config.responseMimeType, request.config.responseMimeType);
  }
  assert.deepEqual(request, original);
});

test('transient HTTP failures and unavailable model IDs can use another model', async () => {
  for (const status of [408, 429, 500, 502, 503, 504, 404]) {
    const { options, calls } = setup([apiError(status), { text: 'success' }]);
    assert.equal((await generateWithFallback(options)).model, FREE_TIER_MODELS[1]);
    assert.equal(calls.length, 2);
  }
});

test('timeouts and network failures can use another model', async () => {
  for (const error of [Object.assign(new Error('timeout'), { name: 'TimeoutError' }),
    new TypeError('fetch failed'), Object.assign(new Error('connection reset'), { cause: { code: 'ECONNRESET' } })]) {
    const { options, calls } = setup([error, { text: 'success' }]);
    await generateWithFallback(options);
    assert.equal(calls.length, 2);
  }
});

test('invalid keys, forbidden access, bad requests, and programming errors stop immediately', async () => {
  for (const error of [apiError(400), apiError(401), apiError(403), apiError(402), new SyntaxError('Invalid JSON'), new TypeError('bad code')]) {
    const { options, calls, delays } = setup([error]);
    await assert.rejects(generateWithFallback(options), (actual) => actual === error);
    assert.equal(calls.length, 1);
    assert.deepEqual(delays, []);
  }
});

test('all failed models produce a bounded, actionable error without exposing upstream details', async () => {
  const { options, calls, delays } = setup(FREE_TIER_MODELS.map(() => apiError(503)));
  await assert.rejects(generateWithFallback(options), (error) => {
    assert.ok(error instanceof ModelUnavailable);
    assert.equal(error.status, 503);
    assert.equal(error.attempts.length, 4);
    assert.match(error.message, /temporarily busy or unavailable/);
    assert.doesNotMatch(error.message, /Upstream failed/);
    return true;
  });
  assert.equal(calls.length, 4);
  assert.deepEqual(delays, [1125, 2125, 4125]);
});

test('all quota failures return a distinct 429 error and disabling fallback makes one attempt', async () => {
  const { options, calls } = setup(FREE_TIER_MODELS.map(() => apiError(429)));
  await assert.rejects(generateWithFallback(options), (error) => error.status === 429 && /rate or quota/.test(error.message));
  assert.equal(calls.length, 4);
  const single = setup([apiError(503)]);
  single.options.models = configuredModels({ GEMINI_FALLBACK_MODELS: '' });
  await assert.rejects(generateWithFallback(single.options), ModelUnavailable);
  assert.equal(single.calls.length, 1);
});

test('the installed SDK forwards the schema and performs only our bounded model attempts', async (t) => {
  const bodies = [];
  t.mock.method(globalThis, 'fetch', async (_url, init) => {
    bodies.push(JSON.parse(init.body));
    if (bodies.length === 1) {
      return new Response(JSON.stringify({ error: { code: 503, status: 'UNAVAILABLE', message: 'Busy' } }), {
        status: 503, headers: { 'content-type': 'application/json' },
      });
    }
    return new Response(JSON.stringify({ candidates: [{ content: { role: 'model', parts: [{ text: '{"kind":"concept","message":"Hello"}' }] } }] }), {
      status: 200, headers: { 'content-type': 'application/json' },
    });
  });
  const result = await generateWithFallback({
    ai: new GoogleGenAI({ apiKey: 'test-key-no-network' }),
    models: configuredModels({}), request, sleep: async () => {},
  });
  assert.equal(result.model, FREE_TIER_MODELS[1]);
  assert.equal(bodies.length, 2);
  assert.equal(JSON.parse(result.response.text).message, 'Hello');
  assert.deepEqual(bodies[0].contents, bodies[1].contents);
  assert.deepEqual(bodies[0].systemInstruction, bodies[1].systemInstruction);
  assert.deepEqual(bodies[0].generationConfig.responseSchema, bodies[1].generationConfig.responseSchema);
  assert.equal('httpOptions' in bodies[0].generationConfig, false);
});

test('invalid helper model lists cannot bypass the allowlist or create unbounded retries', async () => {
  for (const models of [[], ['paid-only'], [FREE_TIER_MODELS[0], FREE_TIER_MODELS[0]]]) {
    const { options, calls } = setup([]);
    await assert.rejects(generateWithFallback({ ...options, models }), /distinct supported/);
    assert.equal(calls.length, 0);
  }
});

test('an aborted request stops before any calls or further fallback', async () => {
  const controller = new AbortController();
  controller.abort();
  const before = setup([]);
  await assert.rejects(generateWithFallback({ ...before.options, signal: controller.signal }), { name: 'AbortError' });
  assert.equal(before.calls.length, 0);
  const during = setup([apiError(503), { text: 'never' }]);
  const inFlight = new AbortController();
  await assert.rejects(generateWithFallback({ ...during.options, signal: inFlight.signal,
    sleep: async () => { inFlight.abort(); } }), { name: 'AbortError' });
  assert.equal(during.calls.length, 1);
});
