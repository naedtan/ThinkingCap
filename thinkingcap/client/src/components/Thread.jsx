import { useEffect, useRef } from 'react';
import TurnCard from './TurnCard.jsx';

export default function Thread({ turns, busy, onFill, onQuizAnswer, onChooseModes, onIntent, onNew }) {
  const endRef = useRef(null);
  const last = turns.at(-1);

  useEffect(() => {
    endRef.current?.scrollIntoView({ block: 'end' });
  }, [turns.length, busy]);

  // Next-step buttons appear under the newest tutor turn, once the student has answered any open quiz.
  const quizOpen = last?.quiz && last.picked == null;
  const showActions = !busy && last?.role === 'tutor' && !['modes', 'error'].includes(last.kind) && !quizOpen;

  return (
    <div className="thread">
      <div className="thread-inner" aria-live="polite">
        {turns.map((t) => (
          <TurnCard key={t.id} turn={t} onFill={onFill} onQuizAnswer={onQuizAnswer} onChooseModes={onChooseModes} />
        ))}
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
            <button className="chip" onClick={() => onIntent('summary')}>Wrap up</button>
          </div>
        )}
        <div ref={endRef} />
      </div>
    </div>
  );
}
