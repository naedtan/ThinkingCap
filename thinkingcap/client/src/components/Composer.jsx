import { useEffect, useRef, useState } from 'react';
import { ArrowUp, HelpCircle, Lightbulb } from 'lucide-react';
import ConfusedPanel from './ConfusedPanel.jsx';

export default function Composer({ draft, setDraft, onSubmit, busy, disabled, inSession, onIntent }) {
  const [confusedOpen, setConfusedOpen] = useState(false);
  const ref = useRef(null);

  // When a suggestion or sentence starter fills the draft, move focus to the box so the student can keep typing.
  useEffect(() => {
    if (draft) ref.current?.focus();
  }, [draft]);

  const placeholder = disabled
    ? 'Choose how you want to learn above to continue…'
    : inSession
      ? 'Type your answer or thought…'
      : 'Ask a question, paste a problem, or ask me to quiz you on a concept…';

  return (
    <div className="composer-wrap">
      {confusedOpen && inSession && (
        <ConfusedPanel
          onClose={() => setConfusedOpen(false)}
          onSend={(extra) => {
            setConfusedOpen(false);
            onIntent('clarify', extra);
          }}
        />
      )}
      <div className="composer">
        <textarea
          ref={ref}
          rows={2}
          value={draft}
          disabled={disabled}
          placeholder={placeholder}
          aria-label="Your message"
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault();
              onSubmit(draft);
            }
          }}
        />
        <div className="composer-bar">
          <div className="composer-chips">
            {inSession && (
              <>
                <button className="chip lav" aria-expanded={confusedOpen} disabled={busy || disabled} onClick={() => setConfusedOpen((o) => !o)}>
                  <HelpCircle size={14} aria-hidden="true" /> I’m confused
                </button>
                <button className="chip peach" disabled={busy || disabled} onClick={() => onIntent('stuck')}>
                  <Lightbulb size={14} aria-hidden="true" /> Give me a hint
                </button>
              </>
            )}
          </div>
          <span className="send-hint">Enter to send</span>
          <button className="send" aria-label="Send" disabled={busy || disabled || !draft.trim()} onClick={() => onSubmit(draft)}>
            <ArrowUp size={18} aria-hidden="true" />
          </button>
        </div>
      </div>
    </div>
  );
}
