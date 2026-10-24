import { useState } from 'react';

export const MODE_OPTIONS = [
  { id: 'guided', label: 'Guide me with questions', behavior: 'The AI asks leading questions and offers hints before revealing answers.' },
  { id: 'stepwise', label: 'Explain it step by step', behavior: 'The AI explains one small idea at a time and checks in before moving on.' },
  { id: 'practice', label: 'Let me try it myself', behavior: 'The AI gives you a problem to attempt, then responds with feedback and hints.' },
  { id: 'teachback', label: 'Let me teach it back', behavior: 'You explain the concept in your own words and get feedback on missing ideas.' },
];

export default function ModeSelector({ chosen, onStart }) {
  const [picked, setPicked] = useState(['guided']);

  if (chosen) {
    const names = MODE_OPTIONS.filter((m) => chosen.includes(m.id)).map((m) => m.label);
    return <p className="msg">Learning style: {names.join(', ')}.</p>;
  }

  const toggle = (id) => setPicked((p) => (p.includes(id) ? p.filter((x) => x !== id) : [...p, id]));

  return (
    <fieldset className="modes">
      <legend className="msg"><strong>How would you like to learn?</strong> Pick one or more.</legend>
      {MODE_OPTIONS.map((m) => (
        <label key={m.id} className={`mode ${picked.includes(m.id) ? 'on' : ''}`}>
          <input type="checkbox" checked={picked.includes(m.id)} onChange={() => toggle(m.id)} />
          <span>
            <strong>{m.label}</strong>
            <small>{m.behavior}</small>
          </span>
        </label>
      ))}
      <button className="btn-primary" disabled={picked.length === 0} onClick={() => onStart(picked)}>
        Start learning
      </button>
    </fieldset>
  );
}
