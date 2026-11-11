import { test } from 'node:test';
import assert from 'node:assert/strict';
import { activityPresentation } from '../../shared/activity-prompt.mjs';
import { normalizeTurn } from '../../shared/turns.mjs';
import { toHistory } from './api.js';

test('existing teach-back questions are separated from their introductory explanation', () => {
  const context = 'Kruskal and Prim algorithms find a Minimum Spanning Tree. They connect every node using the minimum total edge weight.';
  const question = 'In your own words, what is the key difference between what an MST optimizes versus what Dijkstra optimizes?';
  assert.deepEqual(activityPresentation({ kind: 'teachback', message: `${context} ${question}` }), { message: context, prompt: question });
});

test('existing prior-knowledge checks retain the complete question and setup', () => {
  const context = 'Other graph problems include Topological Sort for ordering dependent tasks.';
  const question = 'To test your intuition: If a project manager needs to order tasks where some steps must finish before others can start, which graph problem applies?';
  assert.deepEqual(activityPresentation({ kind: 'diagnostic', message: `${context} ${question}` }), { message: context, prompt: question });
});

test('a final question without a marker is highlighted without changing the preceding explanation', () => {
  const context = 'Binary search halves the remaining sorted range.';
  assert.deepEqual(activityPresentation({ kind: 'hint', message: `${context} Which half would you keep?` }), {
    message: context, prompt: 'Which half would you keep?',
  });
});

test('structured tasks take priority and accidental duplicate questions are removed', () => {
  assert.deepEqual(activityPresentation({ kind: 'practice', message: 'Try a small example.', activity_prompt: 'Find the middle of [1, 3, 5].' }), {
    message: 'Try a small example.', prompt: 'Find the middle of [1, 3, 5].',
  });
  assert.deepEqual(activityPresentation({ kind: 'hint', message: 'Consider the order. Which half?', activity_prompt: 'Which half?' }), {
    message: 'Consider the order.', prompt: 'Which half?',
  });
});

test('imperative exercises are visible, while ordinary explanations and hint-only text remain unchanged', () => {
  assert.deepEqual(activityPresentation({ kind: 'practice', message: 'Find the middle element of [1, 3, 5].' }), {
    message: '', prompt: 'Find the middle element of [1, 3, 5].',
  });
  for (const kind of ['concept', 'feedback', 'hint']) {
    assert.deepEqual(activityPresentation({ kind, message: 'Consider how the range shrinks.' }), {
      message: 'Consider how the range shrinks.', prompt: null,
    });
  }
});

test('quiz questions remain separate from free-response activity prompts', () => {
  assert.deepEqual(activityPresentation({ kind: 'quiz', message: 'A quick check.', quiz: { question: 'Which half?' } }), {
    message: 'A quick check.', prompt: null,
  });
});

test('question-only responses are valid and the transcript includes the visible task without hidden takeaways', () => {
  const turn = normalizeTurn({ kind: 'teachback', message: '', activity_prompt: 'Explain binary search in your own words.', key_idea: 'ANSWER-MARKER' });
  const history = toHistory([{ ...turn, role: 'tutor' }]);
  assert.match(history[0].text, /Your turn: Explain binary search in your own words/);
  assert.doesNotMatch(history[0].text, /ANSWER-MARKER/);
  assert.equal(normalizeTurn({ message: 'An explanation.', activity_prompt: {} }).activity_prompt, null);
});
