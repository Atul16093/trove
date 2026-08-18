/**
 * Provider-agnostic text completion for enrichment.
 *
 * One prompt in, one raw string out — the caller owns the JSON contract. Adding a
 * provider means adding a PROVIDERS entry, not touching the classifier.
 *
 * Config (all optional — with none of it set the caller keeps its keyword fallback):
 *   AI_PROVIDER  anthropic | gemini | groq | openrouter   (default: anthropic)
 *   AI_API_KEY   key for that provider
 *   AI_MODEL     model id (default: see PROVIDERS below)
 *   AI_BASE_URL  override the API host, e.g. a proxy or self-hosted gateway
 *
 * Back-compat: ANTHROPIC_API_KEY / ANTHROPIC_MODEL still work when no AI_* vars are set.
 */

export type AiProviderName = 'anthropic' | 'gemini' | 'groq' | 'openrouter';

export interface AiConfig {
  provider: AiProviderName;
  apiKey: string;
  model: string;
  baseUrl: string;
}

export interface AiRequest {
  url: string;
  headers: Record<string, string>;
  body: unknown;
}

interface ProviderSpec {
  defaultBaseUrl: string;
  defaultModel: string;
  /** Build the HTTP call for a single-turn prompt. */
  request(cfg: AiConfig, prompt: string, maxTokens: number): AiRequest;
  /** Pull the assistant's text out of the parsed response body. */
  extractText(data: any): string;
  /** Optional: explain a 2xx response that carried no text (safety block, token cap). */
  emptyReason?(data: any): string | null;
}

const OPENAI_COMPATIBLE = (defaultBaseUrl: string, defaultModel: string): ProviderSpec => ({
  defaultBaseUrl,
  defaultModel,
  request: (cfg, prompt, maxTokens) => ({
    url: `${cfg.baseUrl}/chat/completions`,
    headers: { 'content-type': 'application/json', authorization: `Bearer ${cfg.apiKey}` },
    body: {
      model: cfg.model,
      max_tokens: maxTokens,
      temperature: 0,
      // Honoured by Groq and most OpenRouter models; harmlessly ignored by the rest,
      // and the caller strips fences anyway.
      response_format: { type: 'json_object' },
      messages: [{ role: 'user', content: prompt }],
    },
  }),
  extractText: (data) => String(data?.choices?.[0]?.message?.content ?? ''),
});

const PROVIDERS: Record<AiProviderName, ProviderSpec> = {
  anthropic: {
    defaultBaseUrl: 'https://api.anthropic.com',
    defaultModel: 'claude-sonnet-4-6',
    request: (cfg, prompt, maxTokens) => ({
      url: `${cfg.baseUrl}/v1/messages`,
      headers: {
        'content-type': 'application/json',
        'x-api-key': cfg.apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: { model: cfg.model, max_tokens: maxTokens, messages: [{ role: 'user', content: prompt }] },
    }),
    extractText: (data) =>
      (Array.isArray(data?.content) ? data.content : [])
        .filter((b: any) => b?.type === 'text')
        .map((b: any) => b.text)
        .join(''),
  },

  gemini: {
    defaultBaseUrl: 'https://generativelanguage.googleapis.com',
    defaultModel: 'gemini-2.0-flash',
    request: (cfg, prompt, maxTokens) => ({
      // AI_MODEL may be written either way ("gemini-2.0-flash" or "models/gemini-2.0-flash").
      // The key rides in the query string per Google's documented form; redactUrl() strips
      // it from anything we log.
      url: `${cfg.baseUrl}/v1beta/models/${cfg.model.replace(/^models\//, '')}:generateContent?key=${encodeURIComponent(cfg.apiKey)}`,
      headers: { 'content-type': 'application/json' },
      body: {
        contents: [{ parts: [{ text: prompt }] }],
        // responseMimeType is the one addition to the plain format: it makes Gemini emit
        // bare JSON instead of a ```json fence, which the caller would otherwise strip.
        generationConfig: {
          temperature: 0.2,
          maxOutputTokens: maxTokens,
          responseMimeType: 'application/json',
          // On 2.5 Flash, thinking tokens are drawn from maxOutputTokens *before* any
          // answer is emitted — the model burns the budget reasoning and gets cut off
          // mid-JSON. Categorizing a link needs no reasoning, so switch it off.
          // Only sent where it's supported: 2.5 Flash accepts 0, 2.5 Pro cannot go
          // below 128, and 2.0 rejects the field outright.
          ...(/2\.5-flash/i.test(cfg.model) ? { thinkingConfig: { thinkingBudget: 0 } } : {}),
        },
      },
    }),
    extractText: (data) =>
      (data?.candidates?.[0]?.content?.parts ?? []).map((p: any) => p?.text ?? '').join(''),
    // A 200 with no text is Gemini's shape for a safety block, or for a thinking model
    // that spent the whole token budget before answering. Name which, so an empty
    // completion isn't indistinguishable from a network problem in the log.
    emptyReason: (data) => data?.promptFeedback?.blockReason || data?.candidates?.[0]?.finishReason || null,
  },

  // Both are OpenAI-shaped; only the host and sensible default model differ.
  groq: OPENAI_COMPATIBLE('https://api.groq.com/openai/v1', 'llama-3.3-70b-versatile'),
  openrouter: OPENAI_COMPATIBLE('https://openrouter.ai/api/v1', 'meta-llama/llama-3.3-70b-instruct:free'),
};

export const AI_PROVIDER_NAMES = Object.keys(PROVIDERS) as AiProviderName[];

function isProviderName(v: string): v is AiProviderName {
  return (AI_PROVIDER_NAMES as string[]).includes(v);
}

/**
 * A provider call that failed, with everything needed to tell the three cases apart:
 * a real timeout (`aborted`), an auth/format rejection (`status` + `body`), or a
 * transport failure (neither). The message is already log-ready.
 */
export class AiError extends Error {
  readonly aborted: boolean;
  readonly status: number | null;
  readonly body: string | null;

  constructor(message: string, opts: { aborted?: boolean; status?: number | null; body?: string | null } = {}) {
    super(message);
    this.name = 'AiError';
    this.aborted = opts.aborted ?? false;
    this.status = opts.status ?? null;
    this.body = opts.body ?? null;
  }
}

/** Gemini carries the key in the query string — never let it reach a log line. */
export function redactUrl(url: string): string {
  return url.replace(/([?&](?:key|api_key|access_token)=)[^&]+/gi, '$1REDACTED');
}

/**
 * Read provider config from the environment.
 * Returns null when no key is configured (caller falls back to keywords) and throws
 * on a genuinely bad AI_PROVIDER value so the misconfiguration is visible in logs.
 */
export function resolveAiConfig(env: NodeJS.ProcessEnv = process.env): AiConfig | null {
  const apiKey = (env.AI_API_KEY || '').trim() || (env.ANTHROPIC_API_KEY || '').trim();
  if (!apiKey) return null;

  const requested = (env.AI_PROVIDER || '').trim().toLowerCase();
  let provider: AiProviderName = 'anthropic';
  if (requested) {
    if (!isProviderName(requested)) {
      throw new Error(`unknown AI_PROVIDER "${requested}" (expected one of ${AI_PROVIDER_NAMES.join(', ')})`);
    }
    provider = requested;
  }
  const spec = PROVIDERS[provider];

  // ANTHROPIC_MODEL stays honoured on the anthropic path so existing deploys don't shift models.
  const legacyModel = provider === 'anthropic' ? (env.ANTHROPIC_MODEL || '').trim() : '';
  return {
    provider,
    apiKey,
    model: (env.AI_MODEL || '').trim() || legacyModel || spec.defaultModel,
    baseUrl: ((env.AI_BASE_URL || '').trim() || spec.defaultBaseUrl).replace(/\/+$/, ''),
  };
}

/**
 * Single-turn completion. Always throws AiError on failure, so the caller can log the
 * real cause (timeout vs 4xx vs empty) instead of a bare "operation was aborted".
 *
 * 30s default: Gemini is routinely slower to first byte than the OpenAI-compatible
 * hosts, and 15s was cutting it off mid-generation.
 */
export async function complete(
  cfg: AiConfig,
  prompt: string,
  opts: { maxTokens?: number; timeoutMs?: number } = {},
): Promise<string> {
  const spec = PROVIDERS[cfg.provider];
  const timeoutMs = opts.timeoutMs ?? 30000;
  const { url, headers, body } = spec.request(cfg, prompt, opts.maxTokens ?? 300);
  const where = `${cfg.provider}/${cfg.model}`;

  let res: Response;
  try {
    res = await fetch(url, {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(timeoutMs),
    });
  } catch (e: any) {
    // AbortSignal.timeout rejects with a TimeoutError DOMException; an explicit
    // abort gives AbortError. Both mean "we gave up waiting" — say so plainly.
    const aborted = e?.name === 'TimeoutError' || e?.name === 'AbortError';
    if (aborted) {
      throw new AiError(`${where} timed out after ${timeoutMs}ms (${e.name})`, { aborted: true });
    }
    throw new AiError(`${where} request failed: ${e?.message || e} (POST ${redactUrl(url)})`);
  }

  if (!res.ok) {
    // The provider's own error body is the whole diagnosis — Gemini returns
    // {"error":{"code":400,"message":"API key not valid",...}} — so keep a real slice of it.
    const detail = (await res.text().catch(() => '')).slice(0, 500);
    throw new AiError(`${where} HTTP ${res.status} ${res.statusText}${detail ? ` — ${detail}` : ''}`, {
      status: res.status,
      body: detail || null,
    });
  }

  const data = await res.json().catch(() => null);
  const text = spec.extractText(data).trim();
  if (!text) {
    const reason = spec.emptyReason?.(data);
    throw new AiError(`${where} returned no text${reason ? ` (finishReason: ${reason})` : ''}`, {
      status: res.status,
      body: JSON.stringify(data ?? '').slice(0, 500),
    });
  }
  return text;
}
