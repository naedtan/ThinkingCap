import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import { GoogleGenAI } from '@google/genai';
import { buildRequest, normalizeTurn, tutorSchema, BadRequest } from './tutor.js';

const PORT = process.env.PORT || 8787;
const MODEL = process.env.GEMINI_MODEL || 'gemini-3.5-flash-lite';
const ai = process.env.GEMINI_API_KEY ? new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY }) : null;

const app = express();
app.use(cors({ origin: ['http://localhost:5173'] }));
app.use(express.json({ limit: '256kb' }));

app.get('/api/health', (_req, res) => res.json({ ok: true, model: MODEL, hasKey: Boolean(ai) }));

// One endpoint drives the whole tutor. The client sends an "intent" (start, reply, stuck,
// clarify, quiz, teachback, practice, summary) plus the session so far; the reply is one tutor turn.
app.post('/api/tutor', async (req, res) => {
  if (!ai) {
    return res.status(500).json({ error: 'Missing GEMINI_API_KEY. Copy server/.env.example to server/.env and add your key.' });
  }
  try {
    const { systemInstruction, contents } = buildRequest(req.body);
    // Newer Gemini models reject temperature/top_p/top_k, so none are set here.
    const response = await ai.models.generateContent({
      model: MODEL,
      contents,
      config: { systemInstruction, responseMimeType: 'application/json', responseSchema: tutorSchema },
    });
    res.json({ turn: normalizeTurn(JSON.parse(response.text)) });
  } catch (err) {
    if (err instanceof BadRequest) return res.status(400).json({ error: err.message });
    console.error('Tutor request failed:', err);
    res.status(502).json({ error: 'The tutor could not respond. Try again in a moment.' });
  }
});

app.listen(PORT, () => console.log(`ThinkingCap server: http://localhost:${PORT} (model: ${MODEL}, key: ${ai ? 'set' : 'MISSING'})`));
