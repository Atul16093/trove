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
      // Key goes in a header, not the query string, so it can't leak into request logs.
      // AI_MODEL may be written either way ("gemini-2.0-flash" or "models/gemini-2.0-flash").
      url: `${cfg.baseUrl}/v1beta/models/${cfg.model.replace(/^models\//, '')}:generateContent`,
      headers: { 'content-type': 'application/json', 'x-goog-api-key': cfg.apiKey },
      body: {
        contents: [{ role: 'user', parts: [{ text: prompt }] }],
        generationConfig: { temperature: 0, maxOutputTokens: maxTokens, responseMimeType: 'application/json' },
      },
    }),
    extractText: (data) =>
      (data?.candidates?.[0]?.content?.parts ?? [])
        .map((p: any) => p?.text ?? '')
        .join(''),
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

/** Single-turn completion. Throws on transport errors and non-2xx responses. */
export async function complete(
  cfg: AiConfig,
  prompt: string,
  opts: { maxTokens?: number; timeoutMs?: number } = {},
): Promise<string> {
  const spec = PROVIDERS[cfg.provider];
  const { url, headers, body } = spec.request(cfg, prompt, opts.maxTokens ?? 300);

  const res = await fetch(url, {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(opts.timeoutMs ?? 15000),
  });

  if (!res.ok) {
    // Surface the provider's own error text (truncated) — "401 invalid api key" is
    // far more actionable than a JSON.parse failure three frames later.
    const detail = (await res.text().catch(() => '')).slice(0, 200);
    throw new Error(`${cfg.provider} ${res.status}${detail ? `: ${detail}` : ''}`);
  }

  const text = spec.extractText(await res.json()).trim();
  if (!text) throw new Error(`${cfg.provider} returned an empty completion`);
  return text;
}
