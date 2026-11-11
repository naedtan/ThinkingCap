// Remove obsolete chooser turns without changing the student's conversation.
// Unstarted sessions can be continued explicitly, without a request on load.
export function migrateStore(saved) {
  return {
    ...saved,
    sessions: saved.sessions.map(({ modes, ...session }) => ({
      ...session,
      turns: session.turns.filter((turn) => turn.kind !== 'modes'),
    })),
  };
}

export function needsStart(turns) {
  return !turns.some((turn) => turn.role === 'tutor' && !['modes', 'error'].includes(turn.kind));
}
