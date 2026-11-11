// Everything about *how the AI teaches* lives in this file:
// the response schema, the learning-preference behaviors, and per-intent directives.
// Edit the strings below to change tutor behavior; no other file needs to change.
import { Type } from '@google/genai';
import { normalizeLearning } from '../shared/learning.mjs';

export class BadRequest extends Error {}

export const KINDS = ['diagnostic', 'concept', 'hint', 'quiz', 'teachback', 'feedback', 'practice', 'summary'];

const strings = { type: Type.ARRAY, nullable: true, items: { type: Type.STRING } };

// One flat schema for every kind of tutor turn. Fields that do not apply come back null.
export const tutorSchema = {
  type: Type.OBJECT,
  properties: {
    kind: { type: Type.STRING, enum: KINDS },
    message: { type: Type.STRING },
    key_idea: { type: Type.STRING, nullable: true },
    suggestions: {
      type: Type.ARRAY,
      nullable: true,
      items: {
        type: Type.OBJECT,
        properties: { title: { type: Type.STRING }, prompt: { type: Type.STRING } },
        required: ['title', 'prompt'],
      },
    },
    starters: strings,
    quiz: {
      type: Type.OBJECT,
      nullable: true,
      properties: {
        question: { type: Type.STRING },
        options: {
          type: Type.ARRAY,
          items: {
            type: Type.OBJECT,
            properties: { id: { type: Type.STRING }, text: { type: Type.STRING } },
            required: ['id', 'text'],
          },
        },
        correct_id: { type: Type.STRING },
        explanation: { type: Type.STRING },
      },
      required: ['question', 'options', 'correct_id', 'explanation'],
    },
    strengths: strings,
    missing: strings,
    learned: strings,
    keep_working_on: strings,
  },
  required: ['kind', 'message'],
};

const ACTIVITIES = {
  guided:
    'Guided questions: ask one short reflective question that helps the student reason toward the idea. Use kind "diagnostic" for a prior-knowledge check or "hint" for a guiding question.',
  practice:
    'Practice problems: use kind "practice" and give one short problem without its solution. Offer feedback on the student\'s attempt.',
  teachback:
    'Teach-back activities: use kind "teachback" and invite the student to explain a concept in their own words after some groundwork. Offer feedback on their explanation.',
  quizzes:
    'Mini quizzes: use kind "quiz" with one relevant multiple-choice question, 3 options (ids "a", "b", "c"), one correct_id, and an explanation. Put the question in quiz and a short lead-in in message.',
};

const FREQUENCY = {
  low: 'Mostly direct explanations. Introduce interactive activities only when the student explicitly requests them. Do not add unsolicited questions or check-ins.',
  medium: 'Balance explanations with occasional selected activities when helpful. Do not introduce an activity in every reply or interrupt an unfinished explanation or student attempt.',
  high: 'Frequently offer selected activities when useful to the topic and the student\'s progress. Give at most one activity at a time, and allow explanations and feedback between activities.',
};

const EXPLANATIONS = {
  concise: 'Concise explanations: focus on the answer, core reasoning, and key takeaway. Avoid unnecessary detail.',
  stepwise: 'Step-by-step explanations: break reasoning into small, connected steps. Use short paragraphs and make each step clear. This changes presentation, not activity frequency; do not require a question or permission between steps.',
};

function learningInstructions(learning) {
  const enabled = Object.keys(ACTIVITIES).filter((id) => learning.types[id]);
  const disabled = Object.keys(ACTIVITIES).filter((id) => !learning.types[id]);
  return `Current sidebar preferences (use these for this response, even if earlier turns used different preferences):
Interaction level: ${learning.level}. ${FREQUENCY[learning.level]}
Explanation style: ${EXPLANATIONS[learning.style]}
Activities you may introduce automatically:
${enabled.length ? enabled.map((id) => `- ${ACTIVITIES[id]}`).join('\n') : '- None. Give explanations and feedback without unsolicited activities or questions. Do not ask the student to choose an activity.'}
${disabled.length ? `Do not introduce these activities automatically: ${disabled.join(', ')}.` : ''}
Selected activity types are options, not a checklist; do not include all of them in one response.
Preference priority: an explicit student request (including Quiz me, Practice it, Teach it back, hints, direct explanations, and clarification) takes priority over the default frequency, activity toggles, and explanation style for that request. A direct-help request must receive an explanation without requiring an attempt first. Giving feedback on an existing attempt remains appropriate even if that activity was just turned off. Never silently change the student's preferences.`;
}

const SYSTEM = `You are ThinkingCap, an AI tutor inside a learning interface. Help the student understand and reason while respecting their control over the learning experience.

Rules:
- Keep explanations manageable and focused. Give a complete direct explanation or worked solution when requested; do not withhold it behind mandatory questions or attempts.
- Aim to keep "message" under 120 words, allowing more when needed for a requested complete explanation. Plain text only: no markdown, no bullet characters. Friendly and direct.
- Build on what the student has said. Do not repeat what they already know.
- Be accurate. If the student is wrong, say so kindly and explain the gap. Ask a guiding question only when appropriate to the current preferences or request.
- Work for any academic subject.
- Only fill the fields the task asks for. Leave the others null.`;

const DIRECTIVES = {
  start:
    'Begin helping with the student\'s topic immediately using the current sidebar preferences. Normally use kind "concept" and give a useful initial explanation with a one-sentence key_idea. If guided questions are enabled, the interaction level is not low, and the student has not explicitly requested direct help, you may instead use kind "diagnostic" for a brief prior-knowledge check with 3 optional suggestions (intuition, experience, mechanics). Never ask the student to select a learning style or block help until they configure preferences. Honor any specific activity or explanation requested in their message.',
  reply:
    'Respond to the student\'s latest message using the current sidebar preferences. If they are answering a teach-back or practice prompt, use kind "feedback": name what they got right in strengths and gaps in missing, with useful corrections. Otherwise explain with kind "concept" and a one-sentence key_idea, or offer one enabled activity when appropriate to the interaction level. Honor explicit requests for any activity or direct explanation. Do not automatically end every reply with a question.',
  stuck:
    'The student is stuck and wants a hint. Use kind "hint" with 3 suggestions: a first-instinct nudge, a smaller example, and a real-world analogy. If the student has already asked for hints in this session, make each hint more concrete. Offer a useful hint rather than a full solution, unless the student explicitly asks for a full explanation; never require a fixed number of attempts.',
  clarify:
    'The student is confused about your most recent explanation. Use kind "concept". This overrides the default activity frequency and any rule about withholding answers: explain directly instead of asking a guiding question. Address exactly what they asked for: clarification requested = [{clarifications}]; their note = "{detail}". Use the current explanation style unless their request asks for a different approach. If the transcript shows they already asked for clarification on this idea, take a different approach than before (a new analogy, a smaller step, or a worked example). Keep it focused and put a one-sentence takeaway in key_idea. Do not add an unsolicited activity or require a check-in.',
  quiz:
    'Use kind "quiz". Write one multiple-choice question testing the idea just discussed, with 3 options (ids "a", "b", "c"), plausible distractors based on common misconceptions, exactly one correct_id, and an explanation of why it is right and why the best distractor is not. message is a one-sentence lead-in.',
  teachback:
    'Use kind "teachback". Invite the student to explain the concept in their own words, as if teaching a friend. Do not explain it yourself. Give 3 suggestions (a title plus a guiding question naming a part they could cover) and 2 to 3 sentence starters in starters.',
  practice:
    'Use kind "practice". Give one new short problem or prompt about this topic for the student to try on their own. Do not include the solution. Add 1 or 2 starters if useful.',
  summary:
    'Use kind "summary" for the whole session so far. message is a two-sentence recap of the main topics. Put 2 to 4 short ideas in learned; prefix any idea that was only explained to the student, not demonstrated by them (a right quiz answer or a solid teach-back), with "Covered:". Put 1 to 3 short items in keep_working_on, grounded in wrong quiz answers, teach-back gaps, or repeated clarification requests. Never claim mastery the transcript does not show. If the session is very short, say so and keep the lists short.',
};

const CLARIFY_LABELS = {
  simple: 'explain it more simply',
  example: 'show a concrete example',
  why: 'explain why it works',
  deeper: 'go deeper',
};

const clip = (value, max) => String(value ?? '').slice(0, max);

// Most intents only need the recent turns. A summary covers the whole session, so it gets a
// longer window; sessions can be resumed days later and early topics should still count.
const WINDOWS = {
  default: { turns: 24, chars: 1500 },
  summary: { turns: 60, chars: 900 },
};

// Counts the client computes from the session (quizzes, hints, ...). Only numbers get through.
const STAT_LABELS = [
  ['quizzes', 'quizzes answered'],
  ['quizzesCorrect', 'of those answered correctly'],
  ['hints', 'hints requested'],
  ['clarifications', 'clarification requests'],
  ['teachbacks', 'teach-backs attempted'],
  ['practice', 'practice attempts'],
];

function statsLine(stats) {
  if (!stats || typeof stats !== 'object') return '';
  const parts = STAT_LABELS.map(([key, label]) => {
    const n = Number(stats[key]);
    return Number.isFinite(n) && n >= 0 ? `${Math.min(Math.floor(n), 999)} ${label}` : null;
  }).filter(Boolean);
  return parts.length ? `\n\nActivity so far (counted by the app): ${parts.join('; ')}.` : '';
}

export function buildRequest(body = {}) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) throw new BadRequest('Expected a request object.');
  const directive = Object.hasOwn(DIRECTIVES, body.intent) ? DIRECTIVES[body.intent] : null;
  if (!directive) throw new BadRequest('Unknown intent.');
  const topic = clip(body.topic, 500).trim();
  if (!topic) throw new BadRequest('Missing topic.');

  let learning;
  try {
    learning = normalizeLearning(body.learning, { strict: true });
  } catch (err) {
    throw new BadRequest(err.message);
  }

  const window = WINDOWS[body.intent] || WINDOWS.default;
  const history = (Array.isArray(body.history) ? body.history : []).slice(-window.turns);
  const transcript = history
    .map((t) => `[${t.role === 'student' ? 'student' : `tutor:${clip(t.kind, 20)}`}] ${clip(t.text, window.chars)}`)
    .join('\n');

  const clarifications = (Array.isArray(body.clarifications) ? body.clarifications : [])
    .filter((c) => typeof c === 'string' && Object.hasOwn(CLARIFY_LABELS, c))
    .map((c) => CLARIFY_LABELS[c])
    .join(', ');
  const detail = clip(body.detail, 400).trim();

  if (body.intent === 'clarify' && !clarifications && !detail) {
    throw new BadRequest('Choose what would help, or describe what is confusing.');
  }

  // Function replacers keep "$&" and similar patterns in a student's note from being expanded.
  const task = directive
    .replace('{clarifications}', () => clarifications || 'none')
    .replace('{detail}', () => detail || 'none');

  const systemInstruction = `${SYSTEM}\n\n${learningInstructions(learning)}`;

  const stats = body.intent === 'summary' ? statsLine(body.stats) : '';
  const contents = `Student's topic or question: ${topic}\n\nSession so far:\n${transcript || '(nothing yet)'}${stats}\n\nTask now: ${task}`;
  return { systemInstruction, contents };
}

// Gemini follows the schema, but we still guard against odd output before it reaches the UI.
export function normalizeTurn(raw = {}) {
  const list = (v) => (Array.isArray(v) ? v.filter((x) => typeof x === 'string' && x.trim()) : []);
  const turn = {
    kind: KINDS.includes(raw.kind) ? raw.kind : 'concept',
    message: String(raw.message ?? '').trim(),
    key_idea: raw.key_idea ? String(raw.key_idea) : null,
    suggestions: Array.isArray(raw.suggestions) ? raw.suggestions.filter((s) => s?.title && s?.prompt) : [],
    starters: list(raw.starters),
    strengths: list(raw.strengths),
    missing: list(raw.missing),
    learned: list(raw.learned),
    keep_working_on: list(raw.keep_working_on),
    quiz: null,
  };
  const q = raw.quiz;
  if (q?.question && Array.isArray(q.options) && q.options.length >= 2 && q.options.some((o) => o.id === q.correct_id)) {
    turn.quiz = q;
  } else if (turn.kind === 'quiz') {
    turn.kind = 'concept';
  }
  return turn;
}
