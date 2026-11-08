import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildRequest, BadRequest } from './tutor.js';

const base = { topic: 'photosynthesis', modes: ['guided'], history: [] };

test('clarify without a choice or a note is rejected', () => {
  assert.throws(() => buildRequest({ ...base, intent: 'clarify' }), BadRequest);
  assert.throws(() => buildRequest({ ...base, intent: 'clarify', clarifications: ['nonsense'], detail: '  ' }), BadRequest);
});

test('clarify directive overrides the learning style and handles repeats', () => {
  const { contents } = buildRequest({ ...base, intent: 'clarify', clarifications: ['simple', 'example'] });
  assert.match(contents, /overrides the learning style/);
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
