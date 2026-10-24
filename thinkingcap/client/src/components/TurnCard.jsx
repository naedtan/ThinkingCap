import { GraduationCap, Lightbulb } from 'lucide-react';
import ModeSelector from './ModeSelector.jsx';

const LABELS = {
  diagnostic: 'Prior knowledge check',
  concept: 'Core concept',
  hint: 'Hint',
  quiz: 'Quick concept check',
  teachback: 'Teach-back',
  feedback: 'Feedback',
  practice: 'Practice',
  summary: 'Session summary',
  modes: 'Learning style',
  error: 'Something went wrong',
};

function Bullets({ title, items }) {
  if (!items?.length) return null;
  return (
    <div className="bullets">
      <h4>{title}</h4>
      <ul>{items.map((x) => <li key={x}>{x}</li>)}</ul>
    </div>
  );
}

function Quiz({ quiz, picked, onPick }) {
  const done = picked != null;
  const right = picked === quiz.correct_id;
  return (
    <div className="quiz">
      <p className="q">{quiz.question}</p>
      <div className="opts" role="group" aria-label="Answer choices">
        {quiz.options.map((o) => {
          const state = !done ? '' : o.id === quiz.correct_id ? 'correct' : o.id === picked ? 'wrong' : 'dim';
          return (
            <button key={o.id} className={`opt ${state}`} disabled={done} onClick={() => onPick(o.id)}>
              <span className="opt-id">{o.id.toUpperCase()}</span>
              {o.text}
            </button>
          );
        })}
      </div>
      {done && (
        <p className={`explain ${right ? 'good' : 'bad'}`}>
          <strong>{right ? 'That’s right.' : 'Not quite.'}</strong> {quiz.explanation}
        </p>
      )}
    </div>
  );
}

export default function TurnCard({ turn, onFill, onQuizAnswer, onChooseModes }) {
  if (turn.role === 'student') return <div className="student">{turn.text}</div>;

  return (
    <article className="tutor">
      <div className="tutor-head">
        <span className="avatar"><GraduationCap size={14} aria-hidden="true" /></span>
        <strong>ThinkingCap</strong>
        <span className={`tag ${turn.kind === 'error' ? 'bad' : ''}`}>{LABELS[turn.kind] || 'Tutor'}</span>
      </div>
      <div className="card">
        {turn.kind === 'modes' ? (
          <ModeSelector chosen={turn.chosen} onStart={onChooseModes} />
        ) : (
          <>
            {turn.message && <p className="msg">{turn.message}</p>}
            {turn.key_idea && (
              <p className="keyidea"><Lightbulb size={16} aria-hidden="true" /> {turn.key_idea}</p>
            )}
            {turn.quiz && <Quiz quiz={turn.quiz} picked={turn.picked} onPick={(id) => onQuizAnswer(turn.id, id)} />}
            {turn.suggestions?.length > 0 && (
              <div className="suggest">
                {turn.suggestions.map((s) => (
                  <button key={s.title} className="suggest-card" onClick={() => onFill(s.prompt)}>
                    <strong>{s.title}</strong>
                    <span>{s.prompt}</span>
                  </button>
                ))}
              </div>
            )}
            {turn.starters?.length > 0 && (
              <div className="starters">
                <span>Sentence starters</span>
                {turn.starters.map((s) => (
                  <button key={s} className="chip" onClick={() => onFill(`${s} `)}>{s}</button>
                ))}
              </div>
            )}
            <Bullets title="What you got right" items={turn.strengths} />
            <Bullets title="Worth another look" items={turn.missing} />
            <Bullets title="What you covered" items={turn.learned} />
            <Bullets title="Keep working on" items={turn.keep_working_on} />
          </>
        )}
      </div>
    </article>
  );
}
