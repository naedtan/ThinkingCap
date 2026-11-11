import express from 'express';
import cors from 'cors';
import { buildRequest, normalizeTurn, tutorSchema, BadRequest } from './tutor.js';
import { configuredModels, generateWithFallback, ModelUnavailable } from './models.js';
import { materialsRouter } from './materials.js';

/** Build the HTTP application without listening or loading credentials. Inject
 * a model client/logger for tests; index.js owns environment and startup. */
export function createApp({ ai = null, models = configuredModels(), logger = console, wait } = {}) {
  const app = express();
  app.disable('x-powered-by');
  app.use(cors({ origin: ['http://localhost:5173', 'http://127.0.0.1:5173'] }));
  app.use(express.json({ limit: '256kb' }));
  app.use(materialsRouter({ ai, logger, wait }));

  app.get('/api/health', (_req, res) => res.json({ ok: true, model: models[0], fallbackModels: models.slice(1), hasKey: Boolean(ai) }));

  app.post('/api/tutor', async (req, res) => {
    const controller = new AbortController();
    const onClose = () => { if (!res.writableEnded) controller.abort(); };
    res.on('close', onClose);
    try {
      const { systemInstruction, contents } = buildRequest(req.body);
      if (!ai) {
        return res.status(500).json({ error: 'Missing GEMINI_API_KEY. Copy server/.env.example to server/.env and add your key.' });
      }
      const { response, model } = await generateWithFallback({
        ai, models, signal: controller.signal,
        request: { contents, config: { systemInstruction, responseMimeType: 'application/json', responseSchema: tutorSchema } },
        onFailure: ({ model, status }) => logger.warn(`Tutor model attempt failed: ${model} (HTTP ${status})`),
      });
      const turn = normalizeTurn(JSON.parse(response.text));
      if (model !== models[0]) logger.info(`Tutor used fallback model: ${model}`);
      res.json({ turn, model });
    } catch (error) {
      if (controller.signal.aborted) return;
      if (error instanceof BadRequest) return res.status(400).json({ error: error.message });
      if (error instanceof ModelUnavailable) return res.status(error.status).json({ error: error.message });
      // Do not log prompts, keys, or entire SDK objects. The HTTP status is
      // enough to distinguish access failures from malformed model output.
      logger.error('Tutor request failed:', { name: error.name, status: error.status });
      // An expired or deleted attachment also comes back as 400/403.
      const hasMaterials = Array.isArray(req.body?.materials) && req.body.materials.length > 0;
      const message = hasMaterials && [400, 403].includes(error.status)
        ? 'Gemini could not open the attached material. Files expire 48 hours after upload, so remove it and add it again. If that does not help, check the server API key.'
        : [401, 403].includes(error.status) || /API_KEY_INVALID|API key not valid/.test(error.message)
          ? 'Gemini rejected the configured API credentials or project access. Check the server API key and Google AI Studio permissions.'
          : 'The tutor could not respond. Try again in a moment.';
      res.status(502).json({ error: message });
    } finally {
      res.off('close', onClose);
    }
  });

  // Body-parser errors happen before the route. Always return the same JSON
  // error shape so the browser can display a useful message (not an HTML page).
  app.use((error, req, res, _next) => {
    if (error.type === 'entity.too.large' && req.path === '/api/materials') return res.status(413).json({ error: 'Files can be up to 20 MB each.' });
    if (error.type === 'entity.too.large') return res.status(413).json({ error: 'This request is too large. Start a new session or shorten the message.' });
    if (error.type === 'entity.parse.failed') return res.status(400).json({ error: 'Request body must be valid JSON.' });
    logger.error('HTTP request failed:', { name: error.name, status: error.status });
    res.status(500).json({ error: 'The server could not process this request.' });
  });
  return app;
}
