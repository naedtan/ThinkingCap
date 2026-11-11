// POST /api/materials: receive one file from the browser, check it, and hand
// it to the Gemini Files API. The response is the small record the browser
// stores in the session; later tutor requests cite the file by its URI.
import express from 'express';
import { setTimeout as delay } from 'node:timers/promises';
import { MATERIAL_LIMITS, MATERIAL_MIME_TYPES, MATERIAL_TTL_MS } from '../shared/materials.mjs';

class UploadError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

/** Check that the bytes really are the type the browser claimed, so a renamed
 * file (or a binary passed off as text) is rejected here, not by Gemini. */
export function contentMatchesType(mimeType, buf) {
  const at = (offset, text) => buf.subarray(offset, offset + text.length).toString('latin1') === text;
  switch (mimeType) {
    case 'application/pdf': return buf.subarray(0, 1024).toString('latin1').includes('%PDF-');
    case 'image/png': return buf.length > 8 && buf[0] === 0x89 && at(1, 'PNG');
    case 'image/jpeg': return buf.length > 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff;
    case 'image/webp': return at(0, 'RIFF') && at(8, 'WEBP');
    case 'image/heic':
    case 'image/heif': return at(4, 'ftyp');
    case 'text/plain':
      if (buf.includes(0)) return false;
      try {
        new TextDecoder('utf-8', { fatal: true }).decode(buf);
        return true;
      } catch {
        return false;
      }
    default: return false;
  }
}

function fileName(header) {
  try {
    // Strip path pieces and control characters; the name is only a label.
    const name = decodeURIComponent(String(header || '')).split(/[\\/]/).pop().replace(/[\u0000-\u001f\u007f]/g, '').trim();
    return name.slice(0, 120);
  } catch {
    return '';
  }
}

export function materialsRouter({ ai, logger = console, wait = (ms, signal) => delay(ms, undefined, { signal }) }) {
  const router = express.Router();

  router.post('/api/materials', express.raw({ type: () => true, limit: MATERIAL_LIMITS.bytes }), async (req, res) => {
    const controller = new AbortController();
    const onClose = () => { if (!res.writableEnded) controller.abort(); };
    res.on('close', onClose);
    try {
      const mimeType = String(req.get('content-type') || '').split(';')[0].trim().toLowerCase();
      const name = fileName(req.get('x-material-name'));
      if (!MATERIAL_MIME_TYPES.includes(mimeType)) throw new UploadError(415, 'Add a PDF, an image (PNG, JPEG, WebP, HEIC), or a text file.');
      if (!name) throw new UploadError(400, 'The file needs a name.');
      if (!Buffer.isBuffer(req.body) || !req.body.length) throw new UploadError(400, `${name} is empty.`);
      if (!contentMatchesType(mimeType, req.body)) throw new UploadError(415, `${name} does not look like a valid ${mimeType === 'text/plain' ? 'text' : mimeType.split('/')[1].toUpperCase()} file.`);
      if (!ai) throw new UploadError(500, 'Missing GEMINI_API_KEY. Copy server/.env.example to server/.env and add your key.');

      let file = await ai.files.upload({
        file: new Blob([req.body], { type: mimeType }),
        config: { mimeType, displayName: name, abortSignal: controller.signal },
      });
      // PDFs and images are usually ready at once; wait briefly if Gemini is still processing.
      for (let i = 0; file.state === 'PROCESSING' && i < 15; i++) {
        await wait(1000, controller.signal);
        file = await ai.files.get({ name: file.name, config: { abortSignal: controller.signal } });
      }
      if (file.state === 'PROCESSING') throw new UploadError(504, `Gemini is still processing ${name}. Try adding it again in a moment.`);
      if (file.state === 'FAILED') throw new UploadError(422, `Gemini could not read ${name}.`);
      if (!file.uri) throw new UploadError(502, `Gemini did not return a link for ${name}.`);

      res.json({
        material: {
          id: file.name,
          name,
          mimeType,
          uri: file.uri,
          sizeBytes: req.body.length,
          expiresAt: file.expirationTime || new Date(Date.now() + MATERIAL_TTL_MS).toISOString(),
        },
      });
    } catch (error) {
      if (controller.signal.aborted) return;
      if (error instanceof UploadError) return res.status(error.status).json({ error: error.message });
      // Log the status only: never file contents or SDK objects.
      logger.error('Material upload failed:', { name: error.name, status: error.status });
      const message = [401, 403].includes(error.status) || /API_KEY_INVALID|API key not valid/.test(error.message)
        ? 'Gemini rejected the API key. Put a valid key from aistudio.google.com/apikey in server/.env and restart the server.'
        : 'The file could not be uploaded. Try again in a moment.';
      res.status(502).json({ error: message });
    } finally {
      res.off('close', onClose);
    }
  });

  return router;
}
