import { test } from 'node:test';
import assert from 'node:assert/strict';
import { activityGuidance } from './activities.js';
import { normalizeLearning } from '../shared/learning.mjs';
import { buildRequest } from './tutor.js';

const base = { intent: 'reply', learning: normalizeLearning(), history: [] };

test('low and all-off preferences keep unsolicited activities disabled', () => {
  const low = activityGuidance({ ...base, learning: normalizeLearning({ level: 'low' }) });
  assert.match(low, /do not introduce an unsolicited activity/);
  const off = activityGuidance({ ...base, learning: normalizeLearning({ level: 'high', types: {
    guided: false, practice: false, teachback: false, quizzes: false,
  } }) });
  assert.match(off, /do not introduce an unsolicited activity/);
});

test('activity planning does not interfere with explicit actions or clarification', () => {
  for (const intent of ['clarify', 'quiz', 'practice', 'teachback', 'summary']) {
    assert.equal(activityGuidance({ ...base, intent }), '');
  }
});

test('medium and high proactively request actual selected activities', () => {
  for (const level of ['medium', 'high']) {
    const learning = normalizeLearning({ level, types: { guided: false, practice: false, teachback: false, quizzes: true } });
    const guidance = activityGuidance({ ...base, learning });
    assert.match(guidance, /Selected activities: quizzes\./);
    assert.match(guidance, /actual question, exercise, or quiz now/);
    assert.match(guidance, /Do not merely ask/);
    assert.match(guidance, /For quizzes, use kind "quiz"/);
    assert.match(guidance, /do not always fall back to guided questions/);
  }
});

test('recent explanation runs and activity variety inform the next response', () => {
  const guidance = activityGuidance({ ...base, history: [
    { role: 'tutor', kind: 'quiz', text: 'Answered quiz.' },
    { role: 'student', text: 'Answer.' },
    { role: 'tutor', kind: 'concept', text: 'First explanation.' },
    { role: 'student', text: 'Okay.' },
    { role: 'tutor', kind: 'concept', text: 'Second explanation.' },
    { role: 'student', text: 'I understand.' },
  ] });
  assert.match(guidance, /Consecutive recent explanation turns: 2/);
  assert.match(guidance, /six tutor turns\): quizzes/);
  assert.match(guidance, /favor an activity on the material already covered/);
});

test('existing attempts and unanswered quizzes are not replaced with more tasks', () => {
  for (const kind of ['practice', 'teachback', 'diagnostic', 'hint']) {
    const guidance = activityGuidance({ ...base, history: [{ role: 'tutor', kind, text: 'Try this.' }] });
    assert.match(guidance, /Address their answer or need for help before introducing another task/);
  }
  const guidance = activityGuidance({ ...base, history: [{ role: 'tutor', kind: 'quiz', text: 'Quiz. Student has not answered yet.' }] });
  assert.match(guidance, /Do not stack a new activity/);
});

test('ordinary explanation requests retain automatic activities; explicit opt-outs override', () => {
  const { systemInstruction, contents } = buildRequest({ intent: 'reply', topic: 'Binary search', learning: { level: 'high' }, history: [
    { role: 'tutor', kind: 'concept', text: 'Binary search halves a sorted search range.' },
    { role: 'student', text: 'Explain how to find the middle.' },
  ] });
  assert.match(systemInstruction, /ordinary request to explain a concept does not by itself disable activities/);
  assert.match(systemInstruction, /Only an explicit request to skip activities or receive an explanation only overrides/);
  assert.match(contents, /short acknowledgment.*opportunity to check understanding/);
});
