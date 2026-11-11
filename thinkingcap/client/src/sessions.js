import { normalizeTurn } from '../../shared/turns.mjs';
import { TUTOR_INTENTS } from '../../shared/conversation.mjs';
import { cleanMaterial } from '../../shared/materials.mjs';

const isObject = (value) => value !== null && typeof value === 'object' && !Array.isArray(value);
const nonempty = (value) => typeof value === 'string' && value.trim().length > 0;

function restoreTurn(turn, fallbackId) {
  if (!isObject(turn)) return null;
  const id = nonempty(turn.id) ? turn.id : fallbackId;
  if (turn.role === 'student') {
    if (typeof turn.text !== 'string') return null;
    const attachments = Array.isArray(turn.attachments) ? turn.attachments.filter(nonempty) : [];
    return attachments.length ? { id, role: 'student', text: turn.text, attachments } : { id, role: 'student', text: turn.text };
  }
  if (turn.role !== 'tutor' || turn.kind === 'modes') return null;
  if (turn.kind === 'error') {
    // Retired hint-button requests resume through the current clarification flow.
    const retry = turn.retry?.intent === 'stuck'
      ? { intent: 'clarify', extra: { detail: 'I am stuck. Please help me understand the current topic.' } }
      : isObject(turn.retry) && TUTOR_INTENTS.includes(turn.retry.intent) ? turn.retry : undefined;
    return { id, role: 'tutor', kind: 'error', message: nonempty(turn.message) ? turn.message : 'The tutor could not respond.', retry };
  }
  try {
    const restored = { ...turn, id, role: 'tutor', ...normalizeTurn(turn) };
    if (!restored.quiz?.options.some((option) => option.id === restored.picked)) delete restored.picked;
    if (!isObject(restored.stats)) delete restored.stats;
    return restored;
  } catch {
    // A damaged card should not erase the rest of this session or other ones.
    return null;
  }
}

/** Repair local data one record at a time; no API requests occur during load. */
export function migrateStore(saved) {
  const input = isObject(saved) ? saved : {};
  const courses = (Array.isArray(input.courses) ? input.courses : [])
    .filter((course) => isObject(course) && nonempty(course.id) && nonempty(course.name));
  const courseIds = new Set(courses.map((course) => course.id));
  const seen = new Set();
  const sessions = [];
  for (const item of Array.isArray(input.sessions) ? input.sessions : []) {
    if (!isObject(item) || !nonempty(item.id) || seen.has(item.id)) continue;
    const { modes, ...session } = item;
    const turns = (Array.isArray(session.turns) ? session.turns : [])
      .map((turn, index) => restoreTurn(turn, `${session.id}:turn:${index}`)).filter(Boolean);
    const topic = nonempty(session.topic) ? session.topic : turns.find((turn) => turn.role === 'student')?.text;
    if (!nonempty(topic)) continue;
    seen.add(session.id);
    // Expired files are kept so the composer can say which ones to add again.
    const materials = (Array.isArray(session.materials) ? session.materials : []).map(cleanMaterial).filter(Boolean);
    sessions.push({ ...session, topic, title: nonempty(session.title) ? session.title : topic.slice(0, 36),
      courseId: courseIds.has(session.courseId) ? session.courseId : null, turns, materials });
  }
  return { courses, sessions, activeId: seen.has(input.activeId) ? input.activeId : null };
}

export function needsStart(turns) {
  return !turns.some((turn) => turn.role === 'tutor' && !['modes', 'error'].includes(turn.kind));
}
