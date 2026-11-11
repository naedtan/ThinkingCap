// Gemini output and saved tutor cards cross a trust boundary. Keep only fields
// the UI understands, especially quiz IDs that are used for rendering/grading.
export const KINDS = Object.freeze(['diagnostic', 'concept', 'hint', 'quiz', 'teachback', 'feedback', 'practice', 'summary']);

const text = (value) => typeof value === 'string' ? value.trim() : '';
const list = (value) => Array.isArray(value) ? [...new Set(value.map(text).filter(Boolean))] : [];

function normalizeQuiz(raw) {
  if (!raw || !text(raw.question) || !Array.isArray(raw.options)) return null;
  if (raw.options.length < 2 || raw.options.length > 6) return null;
  const options = raw.options.map((option) => ({ id: text(option?.id), text: text(option?.text) }));
  if (options.some((option) => !option.id || !option.text)) return null;
  if (new Set(options.map(({ id }) => id)).size !== options.length) return null;
  if (!options.some(({ id }) => id === raw.correct_id) || !text(raw.explanation)) return null;
  return { question: text(raw.question), options, correct_id: raw.correct_id, explanation: text(raw.explanation) };
}

export function normalizeTurn(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw) || !text(raw.message)) {
    throw new TypeError('The tutor returned an invalid or empty response.');
  }
  const quiz = normalizeQuiz(raw.quiz);
  const kind = KINDS.includes(raw.kind) ? raw.kind : 'concept';
  return {
    kind: kind === 'quiz' && !quiz ? 'concept' : kind,
    message: text(raw.message),
    key_idea: text(raw.key_idea) || null,
    suggestions: Array.isArray(raw.suggestions) ? raw.suggestions
      .filter((suggestion) => text(suggestion?.title) && text(suggestion?.prompt))
      .map((suggestion) => ({ title: text(suggestion.title), prompt: text(suggestion.prompt) })) : [],
    starters: list(raw.starters), strengths: list(raw.strengths), missing: list(raw.missing),
    learned: list(raw.learned), keep_working_on: list(raw.keep_working_on), quiz,
  };
}
