/** Read/repair a saved value, falling back when storage or JSON is unavailable. */
export function readStored(key, normalize, storage) {
  try {
    const raw = (storage ?? globalThis.localStorage).getItem(key);
    return normalize(raw ? JSON.parse(raw) : undefined);
  } catch {
    return normalize(undefined);
  }
}

export function writeStored(key, value, storage) {
  try {
    (storage ?? globalThis.localStorage).setItem(key, JSON.stringify(value));
    return true;
  } catch {
    // The current in-memory session remains usable if storage is unavailable/full.
    return false;
  }
}
