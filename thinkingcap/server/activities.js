// Adaptive guidance for ordinary teaching turns, using the existing transcript.
// This deliberately does not schedule every Nth turn or make an extra API call.
const KIND_TO_ACTIVITY = Object.freeze({
  diagnostic: 'guided', hint: 'guided', practice: 'practice', teachback: 'teachback', quiz: 'quizzes',
});

export function activityGuidance({ intent, learning, history }) {
  if (!['start', 'reply'].includes(intent)) return '';
  const enabled = Object.keys(learning.types).filter((id) => learning.types[id]);
  if (learning.level === 'low' || !enabled.length) {
    return 'Automatic activity planning: do not introduce an unsolicited activity. Still honor an explicit request for one.';
  }

  const tutorTurns = history.filter((turn) => turn.role === 'tutor');
  const lastTutor = tutorTurns.at(-1);
  const recentActivities = tutorTurns.slice(-6).map((turn) => KIND_TO_ACTIVITY[turn.kind]).filter(Boolean);
  let explanationRun = 0;
  for (let i = tutorTurns.length - 1; i >= 0 && tutorTurns[i].kind === 'concept'; i--) explanationRun++;

  return `Automatic activity planning for this response:
- Interaction level: ${learning.level}. Selected activities: ${enabled.join(', ')}.
- ${learning.level === 'high'
    ? 'Proactively include one selected activity in this response when the student has enough grounding to attempt it. Explanation-only replies are appropriate when introducing necessary groundwork, addressing confusion, giving feedback on an existing attempt, or honoring a request to skip activities.'
    : 'Balance explanations with activities. When recent explanations have introduced a concept the student can try, proactively include one selected activity rather than continuing indefinitely with explanations. Choose explanation-only when more groundwork or direct support is needed.'}
- Recent activities (oldest to newest, up to six tutor turns): ${recentActivities.join(', ') || 'none'}.
- Consecutive recent explanation turns: ${explanationRun}. If explanations are accumulating, favor an activity on the material already covered rather than adding more explanation.
- Choose the selected activity that best fits the concept and the student\'s response. Vary among selected types over time when useful; do not always fall back to guided questions. Do not introduce an unselected activity unless explicitly requested.
- Introduce the actual question, exercise, or quiz now. Do not merely ask "Would you like a quiz/practice problem?" or wait for the student to request one. You may give a brief explanation first in message, then the activity.
- For quizzes, use kind "quiz" and populate quiz with the question, options, correct_id, and explanation. For practice use kind "practice"; for teach-back use kind "teachback"; for guided questions use kind "hint" or "diagnostic". Each response contains at most one activity.
- Put non-quiz questions and exercise instructions in activity_prompt so the interface can highlight the student's task separately from message. Leave key_idea null while asking; do not put the answer in a takeaway or introductory explanation.
- A routine request such as "explain binary search" does not turn off automatic activities. Only an explicit request to skip activities or receive an explanation only overrides them. Always provide requested explanations instead of withholding help behind a question.
${['practice', 'teachback', 'diagnostic', 'hint'].includes(lastTutor?.kind)
    ? '- The most recent tutor turn asked the student to think or attempt something. Address their answer or need for help before introducing another task.' : ''}
${lastTutor?.kind === 'quiz' && lastTutor.text.includes('Student has not answered yet.')
    ? '- There is an unanswered quiz. Do not stack a new activity on it; respond to the student\'s question/help request unless they clearly choose to move on.' : ''}`;
}
