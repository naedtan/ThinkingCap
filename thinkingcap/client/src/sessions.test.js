import { test } from 'node:test';
import assert from 'node:assert/strict';
import { migrateStore, needsStart } from './sessions.js';
import { normalizeLearning } from '../../shared/learning.mjs';

test('legacy chooser migration preserves completed conversations and course organization', () => {
  const student = { id: 's', role: 'student', text: 'Explain cells.' };
  const tutor = { id: 't', role: 'tutor', kind: 'concept', message: 'Cells are...' };
  const saved = {
    activeId: 'a', courses: [{ id: 'biology', name: 'Biology' }],
    sessions: [{ id: 'a', topic: student.text, courseId: 'biology', modes: ['guided'],
      turns: [student, { kind: 'modes', chosen: ['guided'] }, tutor] }],
  };
  const migrated = migrateStore(saved);
  assert.deepEqual(migrated.sessions[0].turns, [student, tutor]);
  assert.equal('modes' in migrated.sessions[0], false);
  assert.equal(migrated.sessions[0].courseId, 'biology');
  assert.equal(migrated.activeId, saved.activeId);
  assert.deepEqual(migrated.courses, saved.courses);
  assert.equal(needsStart(migrated.sessions[0].turns), false);
  assert.equal(saved.sessions[0].turns.length, 3);
  assert.deepEqual(migrateStore(migrated), migrated);
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
