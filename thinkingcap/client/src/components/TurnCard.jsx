import { GraduationCap, HelpCircle, Lightbulb, Paperclip } from 'lucide-react';
import { describeStats } from '../api.js';
import { activityPresentation } from '../../../shared/activity-prompt.mjs';

const LABELS = {
  diagnostic: 'Prior knowledge check',
  concept: 'Core concept',
  hint: 'Hint',
  quiz: 'Quick concept check',
  teachback: 'Teach-back',
  feedback: 'Feedback',
  practice: 'Practice',
  summary: 'Session summary',
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

function ActivityPrompt({ children }) {
  return (
    <section className="activity-prompt" aria-label="Your turn">
      <h3 className="activity-prompt-label"><HelpCircle size={18} aria-hidden="true" /> Your turn</h3>
      <p className="activity-prompt-question">{children}</p>
    </section>
  );
}

function Quiz({ quiz, picked, onPick }) {
  const done = picked != null;
  const right = picked === quiz.correct_id;
  return (
    <div className="quiz">
      <ActivityPrompt>{quiz.question}</ActivityPrompt>
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

export default function TurnCard({ turn, onFill, onSendSuggestion, requestBusy, onQuizAnswer, onRetry, findMaterial, onViewMaterial }) {
  if (turn.role === 'student') {
    return (
      <div className="student">
        {turn.text}
        {turn.attachments?.length > 0 && (
          <ul className="student-files" aria-label="Attached material">
            {turn.attachments.map((name, i) => {
              // Removed files stay listed but are no longer clickable.
              const material = findMaterial?.(name);
              return (
                <li key={i}>
                  {material ? (
                    <button className="student-file" onClick={() => onViewMaterial(material)} aria-label={`View ${name}`}>
                      <Paperclip size={12} aria-hidden="true" /> {name}
                    </button>
                  ) : (
                    <><Paperclip size={12} aria-hidden="true" /> {name}</>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </div>
    );
  }
  const { message, prompt } = activityPresentation(turn);

  return (
    <article className="tutor">
      <div className="tutor-head">
        <span className="avatar"><GraduationCap size={14} aria-hidden="true" /></span>
        <strong>ThinkingCap</strong>
        <span className={`tag ${turn.kind === 'error' ? 'bad' : ''}`}>{LABELS[turn.kind] || 'Tutor'}</span>
      </div>
      <div className="card">
        {message && <p className="msg">{message}</p>}
        {prompt && <ActivityPrompt>{prompt}</ActivityPrompt>}
        {turn.key_idea && !prompt && !(turn.quiz && turn.picked == null) && (
          <p className="keyidea"><Lightbulb size={16} aria-hidden="true" /> {turn.key_idea}</p>
        )}
        {turn.quiz && <Quiz quiz={turn.quiz} picked={turn.picked} onPick={(id) => onQuizAnswer(turn.id, id)} />}
        {turn.suggestions?.length > 0 && (
          <div className="suggest">
            {turn.suggestions.map((s) => (
              <button key={s.title} className="suggest-card" disabled={requestBusy} onClick={() => onSendSuggestion(s.prompt)}>
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
        {turn.kind === 'summary' && describeStats(turn.stats) && (
          <div className="bullets">
            <h4>What you did</h4>
            <p className="stats">{describeStats(turn.stats)}</p>
          </div>
        )}
        <Bullets title="What you covered" items={turn.learned} />
        <Bullets title="Keep working on" items={turn.keep_working_on} />
        {turn.kind === 'error' && onRetry && turn.retry && (
          <div className="actions">
            <button className="btn-ghost" onClick={() => onRetry(turn)}>Try again</button>
          </div>
        )}
      </div>
    </article>
  );
}
