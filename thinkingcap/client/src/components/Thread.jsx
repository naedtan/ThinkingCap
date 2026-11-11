import { useEffect, useRef } from 'react';
import TurnCard from './TurnCard.jsx';
import { needsStart } from '../sessions.js';

export default function Thread({ turns, busy, requestBusy, onFill, onSendSuggestion, onQuizAnswer, onIntent, onRetry, onNew, findMaterial, onViewMaterial }) {
  const endRef = useRef(null);
  const last = turns.at(-1);

  useEffect(() => {
    endRef.current?.scrollIntoView({ block: 'end' });
  }, [turns.length, busy]);

  // Next-step buttons appear under the newest tutor turn, once the student has answered any open quiz.
  const quizOpen = last?.quiz && last.picked == null;
  const showActions = !requestBusy && last?.role === 'tutor' && !['modes', 'error'].includes(last.kind) && !quizOpen;
  // A refresh can leave a saved student message without its pending response.
  const canContinue = needsStart(turns) || last?.role === 'student' || (last?.kind === 'error' && !last.retry);

  return (
    <div className="thread">
      <div className="thread-inner" aria-live="polite">
        {turns.map((t) => (
          <TurnCard
            key={t.id}
            turn={t}
            onFill={onFill}
            onSendSuggestion={onSendSuggestion}
            requestBusy={requestBusy}
            onQuizAnswer={onQuizAnswer}
            onRetry={t === last && !requestBusy ? onRetry : undefined}
            findMaterial={findMaterial}
            onViewMaterial={onViewMaterial}
          />
        ))}
        {!requestBusy && canContinue && (last?.kind !== 'error' || !last.retry) && (
          <div className="actions">
            <button className="btn-primary" onClick={() => onIntent(needsStart(turns) ? 'start' : 'reply')}>Continue learning</button>
          </div>
        )}
        {busy && <p className="thinking" role="status">ThinkingCap is thinking…</p>}
        {showActions && last.kind === 'summary' && (
          <div className="actions"><button className="btn-primary" onClick={onNew}>Start a new session</button></div>
        )}
        {showActions && last.kind !== 'summary' && (
          <div className="actions" aria-label="Next steps">
            <button className="chip" onClick={() => onIntent('quiz')}>Quiz me</button>
            <button className="chip" onClick={() => onIntent('clarify', { clarifications: ['example'] })}>Show an example</button>
            <button className="chip" onClick={() => onIntent('practice')}>Practice it</button>
            <button className="chip" onClick={() => onIntent('teachback')}>Teach it back</button>
          </div>
        )}
        <div ref={endRef} />
      </div>
    </div>
  );
}
