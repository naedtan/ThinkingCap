import { useState } from 'react';

const OPTIONS = [
  { id: 'simple', label: 'Explain simply' },
  { id: 'example', label: 'Show an example' },
  { id: 'why', label: 'Why does it work?' },
  { id: 'deeper', label: 'Go deeper' },
];

export default function ConfusedPanel({ onSend, onClose }) {
  const [picked, setPicked] = useState([]);
  const [detail, setDetail] = useState('');
  const toggle = (id) => setPicked((p) => (p.includes(id) ? p.filter((x) => x !== id) : [...p, id]));
  const ready = picked.length > 0 || detail.trim().length > 0;

  return (
    <section className="confused" aria-label="Ask for clarification">
      <h3>What would help you understand this better?</h3>
      <div className="confused-opts">
        {OPTIONS.map((o) => (
          <button key={o.id} className={`opt-chip ${picked.includes(o.id) ? 'on' : ''}`} aria-pressed={picked.includes(o.id)} onClick={() => toggle(o.id)}>
            {o.label}
          </button>
        ))}
      </div>
      <input
        className="confused-input"
        value={detail}
        onChange={(e) => setDetail(e.target.value)}
        placeholder="What part is confusing? (optional)"
        aria-label="What part is confusing?"
      />
      <div className="confused-actions">
        <button className="btn-ghost" onClick={onClose}>Cancel</button>
        <button className="btn-primary" disabled={!ready} onClick={() => onSend({ clarifications: picked, detail: detail.trim() })}>
          Get help
        </button>
      </div>
    </section>
  );
}
