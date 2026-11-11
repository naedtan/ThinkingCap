const ACTIVITY_KINDS = ['diagnostic', 'hint', 'teachback', 'practice'];

/** Keep the question separate from background text. New responses use the
 * explicit field; legacy activity cards use a conservative trailing-question
 * fallback so existing conversations improve without regenerating them. */
export function activityPresentation(turn) {
  const message = turn.message || '';
  if (turn.quiz) return { message, prompt: null }; // Quizzes have their own question.
  if (typeof turn.activity_prompt === 'string' && turn.activity_prompt.trim()) {
    const prompt = turn.activity_prompt.trim();
    return { message: message.endsWith(prompt) ? message.slice(0, -prompt.length).trim() : message, prompt };
  }
  if (!ACTIVITY_KINDS.includes(turn.kind)) return { message, prompt: null };

  const markers = [...message.matchAll(/\b(?:In your own words[,:]?|To test your intuition:|Your turn:|Try this:)\s*/gi)];
  if (markers.length) {
    const index = markers.at(-1).index;
    return { message: message.slice(0, index).trim(), prompt: message.slice(index).trim() };
  }
  const question = message.match(/(?:^|[.!?]\s+|\n+)([^.!?\n]+\?)\s*$/);
  if (question) {
    const index = message.lastIndexOf(question[1]);
    return { message: message.slice(0, index).trim(), prompt: question[1].trim() };
  }
  // Exercises and teach-back invitations can be imperatives, not questions.
  if (['practice', 'teachback', 'diagnostic'].includes(turn.kind)) return { message: '', prompt: message };
  return { message, prompt: null };
}
