export async function askTutor(payload) {
  const res = await fetch('/api/tutor', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || 'The tutor could not respond.');
  return data.turn;
}

// Flatten the on-screen turns into the plain transcript the server expects.
export function toHistory(turns) {
  return turns
    .filter((t) => t.kind !== 'modes' && t.kind !== 'error')
    .map((t) => {
      if (t.role === 'student') return { role: 'student', text: t.text };
      let text = t.message || '';
      if (t.key_idea) text += ` Key idea: ${t.key_idea}`;
      if (t.quiz) {
        text += ` Quiz: ${t.quiz.question}`;
        if (t.picked != null) {
          const ok = t.picked === t.quiz.correct_id;
          text += ` Student picked ${t.picked} (${ok ? 'correct' : 'incorrect'}).`;
        } else {
          text += ' Student has not answered yet.';
        }
      }
      return { role: 'tutor', kind: t.kind, text };
    })
    .filter((t) => t.text);
}
