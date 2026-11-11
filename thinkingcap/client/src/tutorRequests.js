/** Coordinate one in-flight tutor request. Lock synchronously, before React can
 * re-render, so double clicks cannot duplicate messages or API calls. */
export function createTutorRequests({ send, onTurn, onPending, makeId = () => crypto.randomUUID() }) {
  let pending = null;
  return {
    isBusy: () => pending !== null,
    async run({ sessionId, payload, retry, stats }) {
      if (pending) return false;
      const controller = new AbortController();
      pending = controller;
      onPending(sessionId);
      try {
        const turn = await send(payload, { signal: controller.signal });
        if (!controller.signal.aborted) {
          onTurn(sessionId, { ...turn, id: makeId(), role: 'tutor', intent: payload.intent, ...(stats ? { stats } : {}) });
        }
      } catch (error) {
        if (!controller.signal.aborted) {
          onTurn(sessionId, { id: makeId(), role: 'tutor', kind: 'error', message: error?.message || 'The tutor could not respond.', retry });
        }
      } finally {
        if (pending === controller) {
          pending = null;
          onPending(null);
        }
      }
      return true;
    },
    cancel() {
      pending?.abort();
      pending = null;
    },
  };
}
