import { useEffect, useRef, useState } from 'react';
import { askTutor, toHistory } from '../api.js';
import { createTutorRequests } from '../tutorRequests.js';
import { usableMaterials } from '../../../shared/materials.mjs';

export default function useTutorRequest(learning, patchSession) {
  const [pendingSessionId, setPendingSessionId] = useState(null);
  const patchRef = useRef(patchSession);
  patchRef.current = patchSession;
  const [requests] = useState(() => createTutorRequests({
    send: askTutor,
    onPending: setPendingSessionId,
    onTurn: (id, turn) => patchRef.current(id, (session) => ({ ...session, turns: [...session.turns, turn] })),
  }));
  useEffect(() => () => requests.cancel(), [requests]);

  return {
    pendingSessionId, isBusy: requests.isBusy,
    run: ({ sessionId, intent, turns, topic, extra, materials }) => requests.run({
      sessionId,
      // Snapshot current preferences at dispatch; retries use the latest ones.
      // Only the fields the server needs are sent for each unexpired file.
      payload: {
        ...extra, intent, topic, learning, history: toHistory(turns, intent, usableMaterials(materials)),
        materials: usableMaterials(materials).map(({ name, mimeType, uri }) => ({ name, mimeType, uri })),
      },
      retry: { intent, extra }, stats: intent === 'summary' ? extra?.stats : undefined,
    }),
  };
}
