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

// Plain-language names for the clarification options. The server keeps its own copy for prompts.
export const CLARIFY_TEXT = {
  simple: 'explain it more simply',
  example: 'show a concrete example',
  why: 'explain why it works',
  deeper: 'go deeper',
};

// The line a student "says" when they ask for clarification, so it shows in the thread and in history.
export function clarifyMessage({ clarifications = [], detail = '' } = {}) {
  const asked = clarifications.map((c) => CLARIFY_TEXT[c]).filter(Boolean).join(', ');
  const note = detail.trim();
  if (asked && note) return `Help me understand this better: ${asked}. ${note}`;
  if (asked) return `Help me understand this better: ${asked}.`;
  return `Help me understand this better. ${note}`;
}

// Flatten the on-screen turns into the plain transcript the server expects.
export function toHistory(turns) {
  return turns
    .filter((t) => t.kind !== 'modes' && t.kind !== 'error')
    .map((t) => {
      if (t.role === 'student') return { role: 'student', text: t.text };
      let text = t.message || '';
      if (t.key_idea) text += ` Key idea: ${t.key_idea}`;
      if (t.strengths?.length) text += ` Strengths: ${t.strengths.join('; ')}.`;
      if (t.missing?.length) text += ` Missing or shaky: ${t.missing.join('; ')}.`;
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

// Activity counts for the session summary. Counted here, not by the model, so they are exact.
// Turns saved before the `intent` field existed simply count as zero for hints and clarifications.
export function computeStats(turns) {
  const stats = { quizzes: 0, quizzesCorrect: 0, hints: 0, clarifications: 0, teachbacks: 0, practice: 0 };
  let previousTutorKind = null;
  for (const t of turns) {
    if (t.role !== 'tutor' || t.kind === 'modes' || t.kind === 'error') continue;
    if (t.quiz && t.picked != null) {
      stats.quizzes += 1;
      if (t.picked === t.quiz.correct_id) stats.quizzesCorrect += 1;
    }
    if (t.intent === 'stuck') stats.hints += 1;
    if (t.intent === 'clarify') stats.clarifications += 1;
    if (t.kind === 'feedback') {
      if (previousTutorKind === 'teachback') stats.teachbacks += 1;
      if (previousTutorKind === 'practice') stats.practice += 1;
    }
    previousTutorKind = t.kind;
  }
  return stats;
}

// One short line for the summary card, e.g. "2 quizzes (1 correct) · 1 hint · 2 clarifications".
export function describeStats(stats) {
  if (!stats) return '';
  const n = (count, one, many = `${one}s`) => `${count} ${count === 1 ? one : many}`;
  const parts = [];
  if (stats.quizzes) parts.push(`${n(stats.quizzes, 'quiz', 'quizzes')} (${stats.quizzesCorrect} correct)`);
  if (stats.teachbacks) parts.push(n(stats.teachbacks, 'teach-back'));
  if (stats.practice) parts.push(n(stats.practice, 'practice attempt'));
  if (stats.hints) parts.push(n(stats.hints, 'hint'));
  if (stats.clarifications) parts.push(n(stats.clarifications, 'clarification'));
  return parts.join(' · ');
}
