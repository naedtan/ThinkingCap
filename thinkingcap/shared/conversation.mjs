// Bound history before transport as well as before prompt construction. A
// summary has a wider window; ordinary replies only need the recent exchange.
export const HISTORY_WINDOWS = Object.freeze({
  default: Object.freeze({ turns: 24, chars: 1500 }),
  summary: Object.freeze({ turns: 60, chars: 900 }),
});

export const TUTOR_INTENTS = Object.freeze(['start', 'reply', 'clarify', 'quiz', 'teachback', 'practice', 'summary']);

export const CLARIFICATIONS = Object.freeze([
  { id: 'simple', label: 'Explain simply', text: 'explain it more simply' },
  { id: 'example', label: 'Show an example', text: 'show a concrete example' },
  { id: 'why', label: 'Why does it work?', text: 'explain why it works' },
  { id: 'deeper', label: 'Go deeper', text: 'go deeper' },
]);

export const CLARIFY_TEXT = Object.freeze(Object.fromEntries(CLARIFICATIONS.map(({ id, text }) => [id, text])));
