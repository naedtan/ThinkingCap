import { test } from 'node:test';
import assert from 'node:assert/strict';
import { askTutor, clarifyMessage, computeStats, describeStats, materialOnlyMessage, toHistory } from './api.js';

const quizTurn = (id, picked) => ({
  id,
  role: 'tutor',
  kind: 'quiz',
  message: 'Check.',
  quiz: { question: 'Q?', options: [{ id: 'a', text: 'A' }, { id: 'b', text: 'B' }], correct_id: 'a', explanation: 'x' },
  picked,
});

test('pending requests keep their snapshot while the next request sends updated preferences', async () => {
  const originalFetch = globalThis.fetch;
  const calls = [];
  let finish;
  globalThis.fetch = async (_url, options) => {
    calls.push(JSON.parse(options.body));
    if (calls.length === 1) await new Promise((resolve) => { finish = resolve; });
    return { ok: true, json: async () => ({ turn: { kind: 'concept', message: 'An explanation.' } }) };
  };
  try {
    const learning = { level: 'high', style: 'concise', types: { guided: true } };
    const history = [{ role: 'student', text: 'Explain cells.' }];
    const pending = askTutor({ intent: 'reply', topic: 'cells', history, learning });
    learning.level = 'low';
    learning.style = 'stepwise';
    learning.types.guided = false;
    await askTutor({ intent: 'reply', topic: 'cells', history, learning });
    finish();
    await pending;
    assert.equal(calls[0].learning.level, 'high');
    assert.equal(calls[0].learning.types.guided, true);
    assert.deepEqual(calls[1].learning, learning);
    assert.deepEqual(calls[0].history, calls[1].history);
  } finally {
    finish?.();
    globalThis.fetch = originalFetch;
  }
});

test('clarifyMessage reads naturally with and without a note', () => {
  assert.equal(clarifyMessage({ clarifications: ['example'] }), 'Help me understand this better: show a concrete example.');
  assert.equal(
    clarifyMessage({ clarifications: ['simple', 'why'], detail: ' The second step. ' }),
    'Help me understand this better: explain it more simply, explain why it works. The second step.',
  );
  assert.equal(clarifyMessage({ detail: 'What is a membrane?' }), 'Help me understand this better. What is a membrane?');
});

test('toHistory keeps teach-back strengths and gaps', () => {
  const [turn] = toHistory([
    { role: 'tutor', kind: 'feedback', message: 'Good start.', strengths: ['Named light'], missing: ['Where does CO2 go?'] },
  ]);
  assert.match(turn.text, /Strengths: Named light\./);
  assert.match(turn.text, /Missing or shaky: Where does CO2 go\?\./);
});

test('computeStats counts quizzes, hints, clarifications, teach-backs, practice', () => {
  const turns = [
    { role: 'tutor', kind: 'modes' },
    { role: 'tutor', kind: 'concept', intent: 'start' },
    quizTurn('q1', 'a'),
    quizTurn('q2', 'b'),
    quizTurn('q3', null),
    { role: 'tutor', kind: 'hint', intent: 'stuck' },
    { role: 'tutor', kind: 'concept', intent: 'clarify' },
    { role: 'tutor', kind: 'concept', intent: 'clarify' },
    { role: 'tutor', kind: 'teachback', intent: 'teachback' },
    { role: 'student', text: 'my explanation' },
    { role: 'tutor', kind: 'feedback', intent: 'reply' },
    { role: 'tutor', kind: 'practice', intent: 'practice' },
    { role: 'student', text: 'my attempt' },
    { role: 'tutor', kind: 'feedback', intent: 'reply' },
    { role: 'tutor', kind: 'error', message: 'nope' },
  ];
  assert.deepEqual(computeStats(turns), {
    quizzes: 2,
    quizzesCorrect: 1,
    hints: 1,
    clarifications: 2,
    teachbacks: 1,
    practice: 1,
  });
});

test('describeStats is empty for an empty session and pluralizes', () => {
  assert.equal(describeStats(computeStats([])), '');
  assert.equal(
    describeStats({ quizzes: 1, quizzesCorrect: 1, hints: 2, clarifications: 1, teachbacks: 0, practice: 0 }),
    '1 quiz (1 correct) · 2 hints · 1 clarification',
  );
});

test('history transport is bounded before serialization and summaries keep a wider window', () => {
  const turns = Array.from({ length: 2000 }, (_, index) => ({ role: 'student', text: `${index}:${'x'.repeat(2000)}` }));
  const reply = toHistory(turns);
  const summary = toHistory(turns, 'summary');
  assert.equal(reply.length, 24);
  assert.equal(summary.length, 60);
  assert.ok(reply.every(({ text }) => text.length <= 1500));
  assert.ok(summary.every(({ text }) => text.length <= 900));
  assert.match(reply.at(-1).text, /^1999:/);
  assert.match(reply[0].text, /^1976:/);
});

test('quiz history contains the options needed to understand the selected answer', () => {
  const history = toHistory([quizTurn('quiz', 'b')]);
  assert.match(history[0].text, /Options: a: A; b: B/);
  assert.match(history[0].text, /Student picked b \(incorrect\)/);
});

test('a malformed successful HTTP response becomes an error instead of an empty card', async (t) => {
  t.mock.method(globalThis, 'fetch', async () => ({ ok: true, json: async () => ({ turn: null }) }));
  await assert.rejects(askTutor({}), /invalid or empty response/);
});

test('history tells the tutor which files a student attached and when', () => {
  const history = toHistory([{ id: 's', role: 'student', text: 'Quiz me on this.', attachments: ['ch4.pdf', 'board.jpg'] }]);
  assert.equal(history[0].text, 'Quiz me on this. [Attached: ch4.pdf, board.jpg]');
  assert.equal(materialOnlyMessage(['ch4.pdf']), 'Help me study the material I attached: ch4.pdf.');
});

test('history marks files that are no longer attached', () => {
  const turns = [
    { id: 'a', role: 'student', text: 'First.', attachments: ['old.png'] },
    { id: 'b', role: 'student', text: 'Second.', attachments: ['new.png'] },
  ];
  const history = toHistory(turns, 'reply', [{ name: 'new.png' }]);
  assert.equal(history[0].text, 'First. [Attached earlier, now removed or expired and no longer available: old.png]');
  assert.equal(history[1].text, 'Second. [Attached: new.png]');
  assert.match(toHistory(turns, 'reply', [])[1].text, /no longer available: new\.png/);
});
