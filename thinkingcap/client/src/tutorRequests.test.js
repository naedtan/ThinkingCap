import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createTutorRequests } from './tutorRequests.js';

const input = { sessionId: 'original', payload: { intent: 'reply' }, retry: { intent: 'reply' } };
const turn = { kind: 'concept', message: 'An explanation.' };

function setup(send) {
  const cards = [], pending = [];
  const requests = createTutorRequests({ send, makeId: () => 'new-turn',
    onTurn: (id, card) => cards.push({ id, card }), onPending: (id) => pending.push(id) });
  return { requests, cards, pending };
}

test('rapid duplicate requests are rejected synchronously and replies retain their session', async () => {
  let finish;
  const { requests, cards, pending } = setup(() => new Promise((resolve) => { finish = resolve; }));
  const first = requests.run(input);
  assert.equal(requests.isBusy(), true);
  assert.equal(await requests.run({ ...input, sessionId: 'other' }), false);
  finish(turn);
  assert.equal(await first, true);
  assert.equal(cards.length, 1);
  assert.equal(cards[0].id, 'original');
  assert.equal(cards[0].card.intent, 'reply');
  assert.deepEqual(pending, ['original', null]);
  assert.equal(requests.isBusy(), false);
});

test('failed requests preserve retry metadata and release the request lock', async () => {
  const { requests, cards } = setup(async () => { throw new Error('Temporarily busy'); });
  await requests.run(input);
  assert.equal(cards[0].card.kind, 'error');
  assert.equal(cards[0].card.message, 'Temporarily busy');
  assert.deepEqual(cards[0].card.retry, input.retry);
  assert.equal(requests.isBusy(), false);
});

test('cancellation aborts transport and suppresses late cards/state updates', async () => {
  let finish, signal;
  const { requests, cards, pending } = setup((_payload, options) => {
    signal = options.signal;
    return new Promise((resolve) => { finish = resolve; });
  });
  const first = requests.run(input);
  requests.cancel();
  assert.equal(signal.aborted, true);
  finish(turn);
  await first;
  assert.deepEqual(cards, []);
  assert.deepEqual(pending, ['original']);
  assert.equal(requests.isBusy(), false);
});
