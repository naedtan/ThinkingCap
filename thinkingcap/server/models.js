// Text models with a Gemini API Free tier, checked 2026-11-11:
// https://ai.google.dev/gemini-api/docs/pricing
// This list does not select or verify the Google project's billing tier.
import { setTimeout as delay } from 'node:timers/promises';

export const FREE_TIER_MODELS = Object.freeze([
  // Prefer the models that have been more available during local testing.
  'gemini-3.6-flash',
  'gemini-3.5-flash-lite',
  'gemini-3.8-flash',
  'gemini-3.1-flash-lite',
]);

export function configuredModels(env = process.env) {
  const primary = env.GEMINI_MODEL?.trim() || FREE_TIER_MODELS[0];
  const fallbacks = env.GEMINI_FALLBACK_MODELS === undefined
    ? FREE_TIER_MODELS.filter((model) => model !== primary)
    : env.GEMINI_FALLBACK_MODELS.split(',').map((model) => model.trim()).filter(Boolean);
  const models = [...new Set([primary, ...fallbacks])];
  for (const model of models) {
    if (!FREE_TIER_MODELS.includes(model)) {
      throw new Error(`Unsupported GEMINI model "${model}". Choose from: ${FREE_TIER_MODELS.join(', ')}.`);
    }
  }
  return models;
}

const TRANSIENT_STATUSES = [408, 429, 500, 502, 503, 504];
const NETWORK_CODES = ['ECONNRESET', 'ECONNREFUSED', 'ENOTFOUND', 'EAI_AGAIN', 'ETIMEDOUT', 'UND_ERR_CONNECT_TIMEOUT'];

function failureStatus(error) {
  if (Number.isInteger(error?.status)) return error.status;
  if (['AbortError', 'TimeoutError'].includes(error?.name)
    || NETWORK_CODES.includes(error?.cause?.code)
    || NETWORK_CODES.includes(error?.code)
    || (error instanceof TypeError && error.message === 'fetch failed')) return 408;
  return null;
}

export class ModelUnavailable extends Error {
  constructor(attempts) {
    const quotaOnly = attempts.every(({ status }) => status === 429);
    super(quotaOnly
      ? 'All configured tutor models reached their current rate or quota limits. Check your limits in Google AI Studio or try again later.'
      : 'The tutor models are temporarily busy or unavailable. Please try again shortly.');
    this.status = quotaOnly ? 429 : 503;
    this.attempts = attempts;
  }
}

// One attempt per distinct model, at most four. Disable the SDK's own retries
// so nested retry loops cannot multiply calls. No conversation is mutated here.
export async function generateWithFallback({
  ai, models, request, signal,
  sleep = (ms, signal) => delay(ms, undefined, { signal }),
  random = Math.random,
  onFailure = () => {},
}) {
  if (!Array.isArray(models) || !models.length || models.length > FREE_TIER_MODELS.length
    || new Set(models).size !== models.length || models.some((model) => !FREE_TIER_MODELS.includes(model))) {
    throw new TypeError('Expected one to four distinct supported tutor models.');
  }
  const attempts = [];
  for (const [index, model] of models.entries()) {
    signal?.throwIfAborted();
    if (index) await sleep(1000 * 2 ** (index - 1) + Math.floor(random() * 250), signal);
    signal?.throwIfAborted();
    try {
      const response = await ai.models.generateContent({
        ...request,
        model,
        config: {
          ...request.config,
          ...(signal ? { abortSignal: signal } : {}),
          httpOptions: { timeout: 20000, retryOptions: { attempts: 1 } },
        },
      });
      return { response, model };
    } catch (error) {
      if (signal?.aborted) throw signal.reason;
      const status = failureStatus(error);
      // A missing model can be unavailable to a particular project/API version.
      // Other client errors (400/401/403) require a fix, not more model calls.
      if (!TRANSIENT_STATUSES.includes(status) && status !== 404) throw error;
      attempts.push({ model, status });
      onFailure({ model, status });
    }
  }
  throw new ModelUnavailable(attempts);
}
