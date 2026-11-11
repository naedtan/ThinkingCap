// Rules for study material a student attaches to a session, shared by the
// browser (what to offer and send) and the server (what to accept).
// The files themselves live in the Gemini Files API; sessions keep only a
// small record pointing at each one, so localStorage stays small.

export const MATERIAL_LIMITS = Object.freeze({
  perSession: 5,
  bytes: 20 * 1024 * 1024, // 20 MB per file
});

// Gemini deletes uploaded files after 48 hours. Treat a file as expired a
// little early so a tutor request never cites one that is about to vanish.
export const MATERIAL_TTL_MS = 48 * 60 * 60 * 1000;
const EXPIRY_MARGIN_MS = 10 * 60 * 1000;

const IMAGE_TYPES = Object.freeze({
  png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', webp: 'image/webp', heic: 'image/heic', heif: 'image/heif',
});
// Anything readable as plain text is sent to Gemini as text/plain.
const TEXT_EXTENSIONS = Object.freeze([
  'txt', 'md', 'markdown', 'csv', 'tsv', 'json', 'tex', 'html', 'css', 'xml', 'yaml', 'yml', 'sql',
  'py', 'js', 'jsx', 'ts', 'tsx', 'java', 'c', 'h', 'cpp', 'hpp', 'cs', 'go', 'rs', 'rb', 'swift', 'kt', 'm', 'r',
]);

export const MATERIAL_MIME_TYPES = Object.freeze(['application/pdf', ...new Set(Object.values(IMAGE_TYPES)), 'text/plain']);

// The file picker's `accept` attribute.
export const MATERIAL_ACCEPT = ['pdf', ...Object.keys(IMAGE_TYPES), ...TEXT_EXTENSIONS].map((ext) => `.${ext}`).join(',');

/** The MIME type to upload a file as, or null when it is not supported.
 * The extension wins because browsers often report '' for .md, .py, etc. */
export function materialMimeType(fileName = '', browserType = '') {
  const ext = /\.([a-z0-9]+)$/i.exec(String(fileName))?.[1]?.toLowerCase();
  if (ext === 'pdf') return 'application/pdf';
  if (ext && Object.hasOwn(IMAGE_TYPES, ext)) return IMAGE_TYPES[ext];
  if (ext && TEXT_EXTENSIONS.includes(ext)) return 'text/plain';
  const type = String(browserType).toLowerCase();
  if (MATERIAL_MIME_TYPES.includes(type)) return type;
  if (type.startsWith('text/')) return 'text/plain';
  return null;
}

/** Make a name unique among `taken` by adding " (2)", " (3)", ... before the extension. */
export function uniqueMaterialName(name, taken) {
  const used = new Set(taken);
  if (!used.has(name)) return name;
  const dot = name.lastIndexOf('.');
  const [stem, ext] = dot > 0 ? [name.slice(0, dot), name.slice(dot)] : [name, ''];
  for (let n = 2; ; n++) {
    const candidate = `${stem} (${n})${ext}`;
    if (!used.has(candidate)) return candidate;
  }
}

// How student messages mention files in the history sent to the tutor.
export const ATTACHED_NOTE = '[Attached: ';
export const REMOVED_NOTE = '[Attached earlier, now removed or expired and no longer available: ';

export function materialKind(mimeType) {
  if (mimeType === 'application/pdf') return 'PDF';
  if (mimeType?.startsWith('image/')) return 'image';
  return 'text';
}

// Only URIs that Gemini itself issued may be cited, never arbitrary URLs.
const GEMINI_FILE_URI = /^https:\/\/generativelanguage\.googleapis\.com\/v1[a-z0-9]*\/files\/[A-Za-z0-9_-]+$/;

/** A well-formed material record, or null. Used when loading saved sessions
 * and when the server reads a tutor request. */
export function cleanMaterial(material) {
  if (!material || typeof material !== 'object' || Array.isArray(material)) return null;
  const { id, mimeType, uri, expiresAt, sizeBytes } = material;
  // Names reach the prompt, so control characters (like newlines) are removed.
  const name = typeof material.name === 'string' ? material.name.replace(/[\u0000-\u001f\u007f]/g, ' ').trim() : '';
  if (!name) return null;
  if (!MATERIAL_MIME_TYPES.includes(mimeType)) return null;
  if (typeof uri !== 'string' || !GEMINI_FILE_URI.test(uri)) return null;
  return {
    id: typeof id === 'string' && id ? id : uri,
    name: name.slice(0, 120),
    mimeType,
    uri,
    expiresAt: typeof expiresAt === 'string' && Number.isFinite(Date.parse(expiresAt)) ? expiresAt : null,
    sizeBytes: Number.isFinite(sizeBytes) && sizeBytes >= 0 ? sizeBytes : null,
  };
}

/** True when Gemini has deleted (or is about to delete) the file. A record
 * with no expiry time is treated as expired, since it cannot be trusted. */
export function isMaterialExpired(material, now = Date.now()) {
  const expires = Date.parse(material?.expiresAt);
  return !Number.isFinite(expires) || expires - EXPIRY_MARGIN_MS <= now;
}

export function usableMaterials(materials, now = Date.now()) {
  return (Array.isArray(materials) ? materials : []).filter((m) => !isMaterialExpired(m, now));
}
