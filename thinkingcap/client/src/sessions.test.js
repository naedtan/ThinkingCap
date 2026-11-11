import { test } from 'node:test';
import assert from 'node:assert/strict';
import { migrateStore, needsStart } from './sessions.js';
import { normalizeLearning } from '../../shared/learning.mjs';
import { normalizeTurn } from '../../shared/turns.mjs';

test('legacy chooser migration preserves completed conversations and course organization', () => {
  const student = { id: 's', role: 'student', text: 'Explain cells.' };
  const tutor = { id: 't', role: 'tutor', kind: 'concept', message: 'Cells are...' };
  const saved = {
    activeId: 'a', courses: [{ id: 'biology', name: 'Biology' }],
    sessions: [{ id: 'a', topic: student.text, courseId: 'biology', modes: ['guided'],
      turns: [student, { kind: 'modes', chosen: ['guided'] }, tutor] }],
  };
  const migrated = migrateStore(saved);
  assert.deepEqual(migrated.sessions[0].turns, [student, { ...tutor, ...normalizeTurn(tutor) }]);
  assert.equal('modes' in migrated.sessions[0], false);
  assert.equal(migrated.sessions[0].courseId, 'biology');
  assert.equal(migrated.activeId, saved.activeId);
  assert.deepEqual(migrated.courses, saved.courses);
  assert.equal(needsStart(migrated.sessions[0].turns), false);
  assert.equal(saved.sessions[0].turns.length, 3);
  assert.deepEqual(migrateStore(migrated), migrated);
});

test('damaged records do not discard other saved sessions, courses, or valid messages', () => {
  const saved = { activeId: 'good', courses: [null, { id: 'c', name: 'Course' }], sessions: [
    null, { id: 'broken', topic: 'Recoverable topic', turns: null },
    { id: 'good', topic: 'Good topic', courseId: 'c', turns: [null, { role: 'student', text: 'Hello' },
      { role: 'tutor', kind: 'concept', message: { invalid: true } }, { role: 'tutor', kind: 'concept', message: 'Valid response' }] },
    { id: 'good', topic: 'Duplicate' },
  ] };
  const result = migrateStore(saved);
  assert.equal(result.activeId, 'good');
  assert.equal(result.sessions.length, 2);
  assert.equal(result.sessions[0].turns.length, 0);
  assert.equal(result.sessions[1].turns.length, 2);
  assert.equal(result.sessions[1].turns[1].message, 'Valid response');
  assert.equal(result.sessions[1].courseId, 'c');
  assert.deepEqual(result.courses, [{ id: 'c', name: 'Course' }]);
  assert.deepEqual(migrateStore(result), result);
});

test('empty and invalid stores are safe, and orphaned courses become unassigned', () => {
  for (const value of [undefined, null, [], 'bad', { sessions: null }]) {
    assert.deepEqual(migrateStore(value), { sessions: [], courses: [], activeId: null });
  }
  const result = migrateStore({ activeId: 'gone', sessions: [{ id: 'a', topic: 'Topic', courseId: 'gone' }] });
  assert.equal(result.activeId, null);
  assert.equal(result.sessions[0].courseId, null);
});

test('an unfinished chooser becomes a resumable session; errors do not count as tutor responses', () => {
  const saved = { sessions: [{ id: 'a', modes: [], turns: [
    { role: 'student', text: 'Explain cells.' }, { role: 'tutor', kind: 'modes' },
  ] }] };
  const turns = migrateStore(saved).sessions[0].turns;
  assert.equal(turns.length, 1);
  assert.equal(needsStart(turns), true);
  assert.equal(needsStart([...turns, { role: 'tutor', kind: 'error' }]), true);
});

test('malformed stored preferences are repaired with the same defaults as the server', () => {
  for (const raw of [null, [], 'bad']) assert.deepEqual(normalizeLearning(raw), normalizeLearning());
  assert.deepEqual(normalizeLearning({ level: 'invalid', style: 'stepwise', types: { guided: false, quizzes: 'false', unknown: true } }), {
    level: 'medium', style: 'stepwise', types: { guided: false, practice: true, teachback: true, quizzes: true },
  });
});

test('old hint cards remain readable and failed hint-button requests retry through clarification', () => {
  const saved = { sessions: [{ id: 'a', topic: 'Topic', turns: [
    { id: 'hint', role: 'tutor', kind: 'hint', intent: 'stuck', message: 'Try a smaller example.' },
    { id: 'error', role: 'tutor', kind: 'error', message: 'Busy', retry: { intent: 'stuck' } },
  ] }] };
  const result = migrateStore(saved).sessions[0];
  assert.equal(result.turns[0].kind, 'hint');
  assert.equal(result.turns[0].message, 'Try a smaller example.');
  assert.equal(result.turns[1].retry.intent, 'clarify');
  assert.match(result.turns[1].retry.extra.detail, /help me understand/);
});
