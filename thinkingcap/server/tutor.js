// Everything about *how the AI teaches* lives in this file:
// the response schema, the teaching-mode behaviors, and the per-intent directives.
// Edit the strings below to change tutor behavior; no other file needs to change.
import { Type } from '@google/genai';

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

export const MODES = {
  guided:
    'Guided questions: use Socratic questioning. Ask one short question at a time that moves the student toward the idea. Do not state the answer. Offer hints that get more specific each time, and only reveal the idea after the student has tried and asked for a hint at least twice.',
  stepwise:
    'Step-by-step explanations: explain in small steps, one idea per turn, 2 to 4 sentences, then check in before moving on.',
  practice:
    'Independent practice: give the student a short problem or prompt to try on their own. Respond to their attempt with feedback and hints, not full solutions.',
  teachback:
    'Teach-back: after a little groundwork, ask the student to explain the concept in their own words. Give feedback that names missing or shaky ideas as questions.',
};

const SYSTEM = `You are ThinkingCap, an AI tutor inside a learning interface. Your job is to get the student to think, not to hand over answers.

Rules:
- Never give a complete explanation in one turn. Reveal one idea at a time.
- Keep "message" under 80 words. Plain text only: no markdown, no bullet characters. Friendly and direct.
- Build on what the student has said. Do not repeat what they already know.
- Be accurate. If the student is wrong, say so kindly and ask a question that exposes the gap.
- Work for any academic subject.
- Only fill the fields the task asks for. Leave the others null.`;

const DIRECTIVES = {
  start:
    'Begin the session with kind "diagnostic". Ask what the student already knows or how familiar they are with the topic, and say a rough guess is fine. Give exactly 3 suggestions, each a different angle (intuition, experience, mechanics), with a short title and a prompt written as a sentence the student could say. Do not explain the topic yet.',
  reply:
    'Respond to the student\'s latest message. If the previous tutor turn was a teach-back or practice prompt, use kind "feedback": put what they got right in strengths and what is missing or shaky in missing, each phrased as a nudge or question, not a lecture. Otherwise use kind "concept" (reveal the next small idea and put a one-sentence takeaway in key_idea) or kind "hint" (if the student seems off track), following the learning style. End with one question or invitation.',
  stuck:
    'The student is stuck and wants a hint. Use kind "hint" with 3 suggestions: a first-instinct nudge, a smaller example, and a real-world analogy. If the student has already asked for hints in this session, make each hint more concrete. Do not give the full answer unless they have asked for hints three or more times.',
  clarify:
    'The student is confused. Use kind "concept". Address exactly what they asked for: clarification requested = [{clarifications}]; their note = "{detail}". Keep it short and put a one-sentence takeaway in key_idea.',
  quiz:
    'Use kind "quiz". Write one multiple-choice question testing the idea just discussed, with 3 options (ids "a", "b", "c"), plausible distractors based on common misconceptions, exactly one correct_id, and an explanation of why it is right and why the best distractor is not. message is a one-sentence lead-in.',
  teachback:
    'Use kind "teachback". Invite the student to explain the concept in their own words, as if teaching a friend. Do not explain it yourself. Give 3 suggestions (a title plus a guiding question naming a part they could cover) and 2 to 3 sentence starters in starters.',
  practice:
    'Use kind "practice". Give one new short problem or prompt about this topic for the student to try on their own. Do not include the solution. Add 1 or 2 starters if useful.',
  summary:
    'Use kind "summary". message is a two-sentence recap. Put 2 to 4 short items the student covered or demonstrated in learned, and 1 to 3 short items to revisit in keep_working_on.',
};

const CLARIFY_LABELS = {
  simple: 'explain it more simply',
  example: 'show a concrete example',
  why: 'explain why it works',
  deeper: 'go deeper',
};

const clip = (value, max) => String(value ?? '').slice(0, max);

export function buildRequest(body = {}) {
  const directive = DIRECTIVES[body.intent];
  if (!directive) throw new BadRequest('Unknown intent.');
  const topic = clip(body.topic, 500).trim();
  if (!topic) throw new BadRequest('Missing topic.');

  const modes = (Array.isArray(body.modes) ? body.modes : []).filter((m) => MODES[m]);
  if (!modes.length) modes.push('guided');

  const history = (Array.isArray(body.history) ? body.history : []).slice(-24);
  const transcript = history
    .map((t) => `[${t.role === 'student' ? 'student' : `tutor:${clip(t.kind, 20)}`}] ${clip(t.text, 1500)}`)
    .join('\n');

  const clarifications = (Array.isArray(body.clarifications) ? body.clarifications : [])
    .map((c) => CLARIFY_LABELS[c])
    .filter(Boolean)
    .join(', ');

  const task = directive
    .replace('{clarifications}', clarifications || 'none')
    .replace('{detail}', clip(body.detail, 400) || 'none');

  const systemInstruction = `${SYSTEM}\n\nLearning style the student chose (combine them):\n${modes
    .map((m) => `- ${MODES[m]}`)
    .join('\n')}`;

  const contents = `Student's topic or question: ${topic}\n\nSession so far:\n${transcript || '(nothing yet)'}\n\nTask now: ${task}`;
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
