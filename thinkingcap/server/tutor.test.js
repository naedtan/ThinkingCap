import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildRequest, BadRequest } from './tutor.js';
import { normalizeLearning } from '../shared/learning.mjs';

const base = { topic: 'photosynthesis', history: [] };

test('clarify without a choice or a note is rejected', () => {
  assert.throws(() => buildRequest({ ...base, intent: 'clarify' }), BadRequest);
  assert.throws(() => buildRequest({ ...base, intent: 'clarify', clarifications: ['nonsense'], detail: '  ' }), BadRequest);
});

test('clarify directive overrides activity frequency and handles repeats', () => {
  const { contents } = buildRequest({ ...base, intent: 'clarify', clarifications: ['simple', 'example'] });
  assert.match(contents, /overrides the default activity frequency/);
  assert.match(contents, /explain it more simply, show a concrete example/);
  assert.match(contents, /different approach than before/);
});

test('a note containing replacement patterns reaches the prompt unchanged', () => {
  const note = 'I do not get $& or $1 or $` here';
  const { contents } = buildRequest({ ...base, intent: 'clarify', detail: note });
  assert.ok(contents.includes(`their note = "${note}"`));
});

test('unknown clarification ids, including inherited object keys, are ignored', () => {
  const { contents } = buildRequest({ ...base, intent: 'clarify', clarifications: ['constructor', 'toString', 'why'] });
  assert.match(contents, /clarification requested = \[explain why it works\]/);
});

test('summary keeps a longer window than other intents', () => {
  const history = Array.from({ length: 40 }, (_, i) => ({
    role: i % 2 ? 'tutor' : 'student',
    kind: 'concept',
    text: i === 0 ? 'FIRST-TOPIC-MARKER' : `turn ${i}`,
  }));
  const summary = buildRequest({ ...base, intent: 'summary', history }).contents;
  const reply = buildRequest({ ...base, intent: 'reply', history }).contents;
  assert.match(summary, /FIRST-TOPIC-MARKER/);
  assert.doesNotMatch(reply, /FIRST-TOPIC-MARKER/);
});

test('summary does not cut off teach-back strengths and gaps in long turns', () => {
  const text = `${'x'.repeat(520)} Missing or shaky: THE-GAP-MARKER.`;
  const { contents } = buildRequest({ ...base, intent: 'summary', history: [{ role: 'tutor', kind: 'feedback', text }] });
  assert.match(contents, /THE-GAP-MARKER/);
});

test('summary includes counted activity and ignores junk stats', () => {
  const { contents } = buildRequest({
    ...base,
    intent: 'summary',
    stats: { quizzes: 2, quizzesCorrect: 1, hints: 'lots', clarifications: -3, teachbacks: 1 },
  });
  const line = contents.split('\n').find((l) => l.startsWith('Activity so far'));
  assert.equal(line, 'Activity so far (counted by the app): 2 quizzes answered; 1 of those answered correctly; 1 teach-backs attempted.');
});

test('summary directive refuses to overstate mastery', () => {
  const { contents } = buildRequest({ ...base, intent: 'summary' });
  assert.match(contents, /Never claim mastery/);
  assert.match(contents, /Covered:/);
});

test('stats are not sent for other intents', () => {
  const { contents } = buildRequest({ ...base, intent: 'quiz', stats: { quizzes: 5 } });
  assert.doesNotMatch(contents, /Activity so far/);
});

test('missing preferences and partial fields receive documented defaults', () => {
  const expected = { level: 'medium', types: { guided: true, practice: true, teachback: true, quizzes: true }, style: 'concise' };
  assert.deepEqual(normalizeLearning(undefined, { strict: true }), expected);
  assert.deepEqual(normalizeLearning({ types: { quizzes: false } }, { strict: true }), {
    ...expected, types: { ...expected.types, quizzes: false },
  });
  const { systemInstruction } = buildRequest({ ...base, intent: 'start' });
  assert.match(systemInstruction, /Interaction level: medium/);
  assert.match(systemInstruction, /Explanation style: Concise explanations/);
  assert.match(systemInstruction, /Mini quizzes: use kind "quiz"/);
});

test('invalid supplied preference values are rejected, not coerced', () => {
  for (const learning of [null, [], 'guided', { level: 'constructor' }, { level: '' },
    { style: 'lecture' }, { types: null }, { types: [] }, { types: { guided: 'false' } },
    { types: { practice: 0 } }, { types: { teachback: null } }, { types: { quizzes: 1 } }]) {
    assert.throws(() => buildRequest({ ...base, intent: 'reply', learning }), BadRequest);
  }
});

test('only allowlisted preference fields affect prompts; legacy modes have no effect', () => {
  const learning = { extra: 'INJECT-MARKER', types: { stepwise: true, custom: 'INJECT-MARKER' } };
  const actual = buildRequest({ ...base, intent: 'reply', learning, modes: ['practice'] });
  assert.deepEqual(actual, buildRequest({ ...base, intent: 'reply' }));
  assert.doesNotMatch(actual.systemInstruction, /INJECT-MARKER/);
});

test('all activity toggle combinations preserve explicit false and permit no activities', () => {
  const ids = ['guided', 'practice', 'teachback', 'quizzes'];
  for (let mask = 0; mask < 16; mask++) {
    const types = Object.fromEntries(ids.map((id, i) => [id, Boolean(mask & (1 << i))]));
    assert.deepEqual(normalizeLearning({ types }, { strict: true }).types, types);
    const { systemInstruction } = buildRequest({ ...base, intent: 'reply', learning: { types } });
    const automatic = systemInstruction.split('Activities you may introduce automatically:\n')[1].split('\nDo not introduce')[0];
    for (const [id, label] of [['guided', 'Guided questions:'], ['practice', 'Practice problems:'],
      ['teachback', 'Teach-back activities:'], ['quizzes', 'Mini quizzes:']]) {
      assert.equal(automatic.includes(label), types[id]);
    }
    if (!mask) assert.match(automatic, /None.*Do not ask the student to choose an activity/);
  }
});

test('frequency and explanation style remain independent across every combination', () => {
  for (const level of ['low', 'medium', 'high']) {
    for (const style of ['concise', 'stepwise']) {
      const { systemInstruction } = buildRequest({ ...base, intent: 'reply', learning: { level, style } });
      assert.match(systemInstruction, new RegExp(`Interaction level: ${level}`));
      assert.match(systemInstruction, style === 'concise' ? /Explanation style: Concise explanations/ : /Explanation style: Step-by-step explanations/);
      if (level === 'low') assert.match(systemInstruction, /only when the student explicitly requests/);
      if (level === 'medium') assert.match(systemInstruction, /occasional selected activities/);
      if (level === 'high') assert.match(systemInstruction, /Frequently offer selected activities/);
    }
  }
});

test('each intent uses updated preferences without rewriting the conversation', () => {
  const history = [{ role: 'student', text: 'HISTORY-MARKER' }];
  for (const intent of ['start', 'reply', 'stuck', 'clarify', 'quiz', 'teachback', 'practice', 'summary']) {
    const request = { ...base, intent, history, detail: 'Explain the second step.' };
    const before = buildRequest({ ...request, learning: { level: 'high', style: 'concise' } });
    const after = buildRequest({ ...request, learning: { level: 'low', style: 'stepwise' } });
    assert.notEqual(before.systemInstruction, after.systemInstruction);
    assert.equal(before.contents, after.contents);
    assert.match(after.contents, /HISTORY-MARKER/);
    assert.match(after.systemInstruction, /explicit student request.*takes priority/);
    assert.match(after.systemInstruction, /direct-help request must receive an explanation without requiring an attempt/);
  }
  assert.deepEqual(history, [{ role: 'student', text: 'HISTORY-MARKER' }]);
});

test('start and reply do not force a diagnostic question or withhold direct help', () => {
  for (const intent of ['start', 'reply']) {
    const { systemInstruction, contents } = buildRequest({ ...base, intent, learning: { level: 'low' } });
    assert.doesNotMatch(systemInstruction, /Never give a complete explanation|only reveal the idea after/);
    assert.doesNotMatch(contents, /End with one question|Do not explain the topic yet/);
  }
});

test('unknown intents and non-object bodies are rejected', () => {
  for (const body of [null, [], { ...base, intent: 'constructor' }, { ...base, intent: 'toString' }]) {
    assert.throws(() => buildRequest(body), BadRequest);
  }
});
