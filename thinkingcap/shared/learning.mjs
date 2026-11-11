// Shared contract for browser storage and the tutor API. Never forward arbitrary
// preference text to the model: only these IDs and boolean flags are supported.
export const LEVELS = ['low', 'medium', 'high'];
export const ACTIVITY_TYPES = ['guided', 'practice', 'teachback', 'quizzes'];
export const STYLES = ['concise', 'stepwise'];

const isObject = (value) => value !== null && typeof value === 'object' && !Array.isArray(value);
const own = (value, key) => Object.hasOwn(value, key);

// The server rejects invalid supplied values; old/malformed browser data is
// repaired field by field. Missing fields always receive the same defaults.
export function normalizeLearning(value, { strict = false } = {}) {
  const invalid = (path, fallback) => {
    if (strict) throw new TypeError(`Invalid learning preference: ${path}.`);
    return fallback;
  };
  if (value === undefined) value = {};
  if (!isObject(value)) value = invalid('learning must be an object', {});

  const choice = (key, allowed, fallback) => {
    if (!own(value, key)) return fallback;
    return allowed.includes(value[key]) ? value[key] : invalid(key, fallback);
  };
  let types = own(value, 'types') ? value.types : {};
  if (!isObject(types)) types = invalid('types must be an object', {});

  return {
    level: choice('level', LEVELS, 'medium'),
    types: Object.fromEntries(ACTIVITY_TYPES.map((id) => [
      id,
      !own(types, id) ? true : typeof types[id] === 'boolean' ? types[id] : invalid(`types.${id} must be a boolean`, true),
    ])),
    style: choice('style', STYLES, 'concise'),
  };
}
