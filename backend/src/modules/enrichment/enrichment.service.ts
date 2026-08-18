import { Injectable, Logger } from '@nestjs/common';
import { ItemQuery } from '../../models/queries/item.query';
import { CategoryQuery } from '../../models/queries/category.query';
import { CATEGORY_SLUGS, FALLBACK_CATEGORY_SLUG } from '../../enums/default-categories';
import { unwrapRedirect, isInstagramUrl, displayTitleFor, looksLikeUrl } from '../../common/utils/url.util';
import { AiConfig, complete, resolveAiConfig } from './ai-provider';

interface Metadata { title: string | null; description: string | null; image: string | null; }
interface Classification { slug: string; summary: string; tags: string[]; }

const EMPTY_META: Metadata = { title: null, description: null, image: null };

/**
 * Enrichment: fetch link metadata, then classify with an LLM.
 * The provider is env-configurable (see ai-provider.ts). If no key is set — or the
 * call fails for any reason — a keyword fallback runs so the app still works
 * end-to-end. In production this is queued (BullMQ) — here it runs async inline.
 *
 * Invariant: an item that enters process() always leaves it `ready` with a
 * non-null category_id. Enrichment is best-effort decoration — a dead metadata
 * fetch, a failed AI call or a login-wall page must never strand a saved
 * link where the dashboard can't see it.
 */
@Injectable()
export class EnrichmentService {
  private readonly logger = new Logger(EnrichmentService.name);
  private readonly warned = new Set<string>();

  constructor(private readonly items: ItemQuery, private readonly categories: CategoryQuery) {}

  /** Fire-and-forget: enrich an item, then flip it to ready. */
  enqueue(itemId: number): void {
    setImmediate(() => this.process(itemId).catch((e) => this.logger.error(`enrich ${itemId}: ${e.message}`)));
  }

  /** Public so the reprocess sweep can re-run a stranded item. */
  async process(itemId: number): Promise<void> {
    const item = await this.items.findById(itemId);
    if (!item || item.kind === 'file') return; // files are enriched at ingest, not here
    const stored = item.canonical_url || item.url;
    if (!stored) return;
    // l.instagram.com/?u=… wrappers hide the real destination from every lookup below.
    const link = unwrapRedirect(stored);

    // Each stage is isolated: a failure in one must not skip the next.
    let meta = EMPTY_META;
    try {
      // Instagram serves a login wall to OG scrapers; oEmbed gives the real caption.
      meta = (isInstagramUrl(link) ? await this.fetchInstagramMeta(link) : null) || await this.fetchMetadata(link);
    } catch (e: any) {
      this.logger.warn(`metadata failed for ${itemId}: ${e.message}`);
    }

    let cls: Classification;
    try {
      cls = await this.classify(link, meta, item.caption);
    } catch (e: any) {
      this.logger.warn(`classify failed for ${itemId}: ${e.message}`);
      cls = this.safeKeywordFallback(link, meta, item.caption);
    }

    // Columns are bounded (title/summary 512, image_url 1024) — clamp so a long
    // value can't turn a successful enrichment into a failed write. The fallback
    // is a derived label, never the raw URL: that renders as a wall of tracking junk.
    const keptTitle = item.title && !looksLikeUrl(item.title) ? item.title : null;
    const title = (meta.title || keptTitle || displayTitleFor(link, item.source_domain)).slice(0, 512);
    const categoryId = await this.resolveCategoryId(item.user_id, cls.slug);

    try {
      await this.items.updateEnrichment(itemId, {
        title, description: meta.description, image_url: meta.image ? meta.image.slice(0, 1024) : null,
        summary: cls.summary.slice(0, 512), tags: cls.tags, category_id: categoryId, status: 'ready',
      });
    } catch (e: any) {
      // Even the enriched write can fail (e.g. an over-long title). Land the item
      // in a visible state anyway rather than leaving it stuck in processing.
      this.logger.warn(`enrichment write failed for ${itemId}: ${e.message}`);
      await this.items.updateEnrichment(itemId, { title, category_id: categoryId, status: 'ready' })
        .catch((err: any) => this.logger.error(`could not resolve item ${itemId}: ${err.message}`));
    }
  }

  /**
   * Never returns null when the user has any category at all:
   * requested slug → "other" → the user's first category.
   */
  private async resolveCategoryId(userId: number, slug: string): Promise<number | null> {
    try {
      const direct = await this.categories.findBySlug(userId, slug);
      if (direct) return direct.id;
      const fallback = await this.categories.findBySlug(userId, FALLBACK_CATEGORY_SLUG);
      if (fallback) return fallback.id;
      const all = await this.categories.listForUser(userId);
      return all.length ? all[0].id : null;
    } catch (e: any) {
      this.logger.warn(`category lookup failed for user ${userId}: ${e.message}`);
      return null;
    }
  }

  /** keywordFallback is pure, but guard it so the last line of defence can't throw. */
  private safeKeywordFallback(url: string, meta: Metadata, caption: string | null): Classification {
    try {
      return this.keywordFallback(url, meta, caption);
    } catch {
      return { slug: FALLBACK_CATEGORY_SLUG, summary: '', tags: [] };
    }
  }

  /**
   * Instagram via the official oEmbed endpoint: real caption + thumbnail, no
   * scraping and no transcription. Needs a Facebook app token
   * (INSTAGRAM_OEMBED_TOKEN or FACEBOOK_APP_TOKEN); without one — or on any
   * failure, or for a private/deleted post — it returns null and the caller
   * falls back to the generic OG fetch. It never throws.
   */
  private async fetchInstagramMeta(url: string): Promise<Metadata | null> {
    const token = process.env.INSTAGRAM_OEMBED_TOKEN || process.env.FACEBOOK_APP_TOKEN;
    if (!token) return null;
    try {
      const endpoint = new URL('https://graph.facebook.com/v21.0/instagram_oembed');
      endpoint.searchParams.set('url', url);
      endpoint.searchParams.set('access_token', token);
      endpoint.searchParams.set('omitscript', 'true');
      endpoint.searchParams.set('fields', 'author_name,title,thumbnail_url');

      const res = await fetch(endpoint.toString(), { signal: AbortSignal.timeout(8000) });
      if (!res.ok) {
        this.logger.warn(`instagram oembed ${res.status} for ${url}`);
        return null;
      }
      const data: any = await res.json();

      // oEmbed puts the post caption in `title` — often multi-line and long.
      const caption = typeof data?.title === 'string' ? data.title.trim() : '';
      const author = typeof data?.author_name === 'string' ? data.author_name.trim() : '';
      const image = typeof data?.thumbnail_url === 'string' ? data.thumbnail_url : null;
      const headline = caption ? caption.split('\n')[0].trim().slice(0, 160) : '';

      // Nothing usable — let the generic path have a go rather than locking in a blank.
      if (!headline && !caption && !image && !author) return null;

      return {
        title: headline || (author ? `${author} on Instagram` : null),
        // The full caption is what gives the classifier something to work with,
        // so an Instagram save gets a real category instead of defaulting to Other.
        description: caption || null,
        image,
      };
    } catch (e: any) {
      this.logger.warn(`instagram oembed failed for ${url}: ${e.message}`);
      return null;
    }
  }

  private async fetchMetadata(url: string): Promise<Metadata> {
    try {
      const res = await fetch(url, { headers: { 'User-Agent': 'TroveBot/1.0 (+https://trove.app)' }, signal: AbortSignal.timeout(8000) });
      const html = await res.text();
      const pick = (prop: string) => {
        const re = new RegExp(`<meta[^>]+(?:property|name)=["']${prop}["'][^>]+content=["']([^"']+)["']`, 'i');
        const m = html.match(re); return m ? this.decode(m[1]) : null;
      };
      const titleTag = html.match(/<title[^>]*>([^<]+)<\/title>/i);
      return {
        title: pick('og:title') || (titleTag ? this.decode(titleTag[1]).trim() : null),
        description: pick('og:description') || pick('description'),
        image: pick('og:image'),
      };
    } catch {
      return { title: null, description: null, image: null };
    }
  }

  private decode(s: string): string {
    return s.replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'");
  }

  /**
   * Ask the configured provider to categorize the link; fall back to keywords on any
   * failure. Config is resolved per call so an env change lands on the next restart
   * without special-casing, and a bad AI_PROVIDER degrades instead of crashing boot.
   */
  private async classify(url: string, meta: Metadata, caption: string | null): Promise<Classification> {
    let cfg: AiConfig | null = null;
    try {
      cfg = resolveAiConfig();
    } catch (e: any) {
      this.warnOnce(`ai config: ${e.message} — using keyword fallback`);
    }
    if (!cfg) return this.keywordFallback(url, meta, caption);

    try {
      const text = await complete(cfg, this.classifyPrompt(url, meta, caption), { maxTokens: 300, timeoutMs: 15000 });
      return this.parseClassification(text);
    } catch (e: any) {
      // Rate limits and bad keys look identical from the item's point of view, but not
      // from the operator's — log once per distinct message so a misconfigured free-tier
      // key is visible without flooding the log on every save.
      this.warnOnce(`ai classify (${cfg.provider}/${cfg.model}) failed: ${e.message}`);
      return this.keywordFallback(url, meta, caption);
    }
  }

  /** Identical across providers — the JSON contract is the abstraction boundary. */
  private classifyPrompt(url: string, meta: Metadata, caption: string | null): string {
    const context = [`URL: ${url}`, meta.title && `Title: ${meta.title}`, meta.description && `Description: ${meta.description}`, caption && `Caption: ${caption}`]
      .filter(Boolean).join('\n');
    return `You categorize saved links. Reply with ONLY a JSON object, no prose, no markdown fences.
Schema: {"category": one of ${JSON.stringify(CATEGORY_SLUGS)}, "summary": "one concise sentence, max 20 words", "tags": ["2-4 short lowercase tags"]}
If nothing fits, use "${FALLBACK_CATEGORY_SLUG}".

Link:
${context}`;
  }

  /**
   * Small models wrap JSON in fences or a sentence of preamble far more often than
   * Claude does, so recover the first {...} block rather than trusting the whole string.
   */
  private parseClassification(text: string): Classification {
    const cleaned = text.replace(/```(?:json)?/gi, '').trim();
    const start = cleaned.indexOf('{');
    const end = cleaned.lastIndexOf('}');
    if (start === -1 || end <= start) throw new Error('no JSON object in completion');
    const json = JSON.parse(cleaned.slice(start, end + 1));

    const slug = CATEGORY_SLUGS.includes(json.category) ? json.category : FALLBACK_CATEGORY_SLUG;
    return {
      slug,
      summary: String(json.summary || '').slice(0, 500),
      tags: Array.isArray(json.tags) ? json.tags.slice(0, 4).map(String) : [],
    };
  }

  /** Dedupe repeated provider errors — one bad key would otherwise log on every item. */
  private warnOnce(message: string): void {
    if (this.warned.has(message)) return;
    if (this.warned.size > 50) this.warned.clear();
    this.warned.add(message);
    this.logger.warn(message);
  }

  private keywordFallback(url: string, meta: Metadata, caption: string | null): Classification {
    const s = `${url} ${meta.title || ''} ${meta.description || ''} ${caption || ''}`.toLowerCase();
    const has = (...w: string[]) => w.some((x) => s.includes(x));
    let slug = FALLBACK_CATEGORY_SLUG;
    if (has('job', 'career', 'hiring', 'wellfound', 'linkedin/jobs')) slug = 'jobs';
    else if (has('ai', 'gpt', 'openai', 'prompt', 'perplexity', 'claude', 'llm')) slug = 'ai_tools';
    else if (has('shop', 'store', 'amazon', 'buy', 'product', 'cart')) slug = 'shopping';
    else if (has('course', 'learn', 'tutorial', 'docs', 'book', 'udemy')) slug = 'learning';
    else if (has('invest', 'finance', 'money', 'budget', 'stock', 'crypto')) slug = 'finance';
    else if (has('notion', 'linear', 'figma', 'productivity', 'tool')) slug = 'productivity';
    else if (has('design', 'portfolio', 'inspiration', 'dribbble')) slug = 'inspiration';
    else if (has('article', 'blog', 'substack', 'news', 'read')) slug = 'reading';
    return { slug, summary: meta.description ? meta.description.slice(0, 160) : `Saved from ${meta.title || url}`, tags: [] };
  }
}
