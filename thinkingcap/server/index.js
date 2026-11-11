import 'dotenv/config';
import { GoogleGenAI } from '@google/genai';
import { createApp } from './app.js';
import { configuredModels } from './models.js';

const PORT = process.env.PORT || 8787;
const HOST = process.env.HOST || '127.0.0.1';
const MODELS = configuredModels();
const ai = process.env.GEMINI_API_KEY ? new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY }) : null;

// Keep credentials/listening separate from the injectable HTTP application.
createApp({ ai, models: MODELS }).listen(PORT, HOST, () => {
  console.log(`ThinkingCap server: http://${HOST}:${PORT} (models: ${MODELS.join(' -> ')}, key: ${ai ? 'set' : 'MISSING'})`);
});
