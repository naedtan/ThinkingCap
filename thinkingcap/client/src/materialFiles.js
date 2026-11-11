// Local copies of attached files, so students can view them later.
// Gemini's Files API cannot hand uploaded files back, so the browser keeps
// its own copy in IndexedDB (much roomier than localStorage), keyed by the
// material id. Every call fails quietly: a missing copy only means "no preview".

const DB = 'thinkingcap-materials';
const STORE = 'files';

let opening = null;
function open() {
  if (!globalThis.indexedDB) return Promise.reject(new Error('IndexedDB unavailable'));
  opening ??= new Promise((resolve, reject) => {
    const request = indexedDB.open(DB, 1);
    request.onupgradeneeded = () => request.result.createObjectStore(STORE);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  }).catch((error) => {
    opening = null; // Allow a later retry.
    throw error;
  });
  return opening;
}

async function run(mode, action) {
  const db = await open();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, mode);
    const request = action(tx.objectStore(STORE));
    tx.oncomplete = () => resolve(request?.result);
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error);
  });
}

export async function saveMaterialFile(id, blob) {
  try {
    await run('readwrite', (store) => store.put(blob, id));
    return true;
  } catch {
    return false; // Storage full or blocked (e.g. some private windows).
  }
}

/** The stored Blob, or null when there is no local copy. */
export async function getMaterialFile(id) {
  try {
    return (await run('readonly', (store) => store.get(id))) ?? null;
  } catch {
    return null;
  }
}

export async function deleteMaterialFile(id) {
  try {
    await run('readwrite', (store) => store.delete(id));
  } catch {
    // Nothing to clean up.
  }
}

/** Remove copies that no saved session refers to any more. */
export async function pruneMaterialFiles(keepIds) {
  try {
    const keep = new Set(keepIds);
    const ids = await run('readonly', (store) => store.getAllKeys());
    await Promise.all(ids.filter((id) => !keep.has(id)).map(deleteMaterialFile));
  } catch {
    // Pruning is best-effort.
  }
}
