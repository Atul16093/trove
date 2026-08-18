import { createHash } from 'crypto';

const TRACKING_PARAMS = new Set([
  'utm_source', 'utm_medium', 'utm_campaign', 'utm_term', 'utm_content',
  'fbclid', 'gclid', 'igshid', 'igsh', 'ref', 'ref_src', 'mc_cid', 'mc_eid',
]);

/** Normalize a URL so the same link saved twice produces the same hash. */
export function canonicalizeUrl(input: string): string {
  let raw = input.trim();
  if (!/^https?:\/\//i.test(raw)) raw = 'https://' + raw;
  try {
    const u = new URL(raw);
    u.hostname = u.hostname.replace(/^www\./i, '').toLowerCase();
    u.protocol = 'https:';
    u.hash = '';
    for (const p of [...u.searchParams.keys()]) {
      if (TRACKING_PARAMS.has(p.toLowerCase())) u.searchParams.delete(p);
    }
    u.searchParams.sort();
    let out = u.toString();
    if (out.endsWith('/') && u.pathname !== '/') out = out.slice(0, -1);
    return out;
  } catch {
    return raw;
  }
}

export function hashUrl(canonical: string): string {
  return createHash('sha256').update(canonical).digest('hex');
}

export function domainOf(url: string): string | null {
  try {
    return new URL(url.startsWith('http') ? url : 'https://' + url).hostname.replace(/^www\./i, '');
  } catch {
    return null;
  }
}

/**
 * Display-only tracking params. Deliberately a superset of TRACKING_PARAMS and
 * kept separate from it: canonicalizeUrl feeds url_hash, so widening that set
 * would change dedupe keys for links already in the DB.
 */
const DISPLAY_TRACKING_PARAMS = new Set([
  ...TRACKING_PARAMS,
  'si', '_e', '_nc_cat', '_nc_ht', 'img_index', 'share_id', 'story_media_id',
  'source', 'campaign', 'trk', 'trk_contact', 'spm', 'scmp', 'yclid', 'msclkid',
  'utm_id', 'utm_name', 'utm_reader', 'utm_social', 'utm_brand',
]);

const isTrackingParam = (p: string): boolean => {
  const k = p.toLowerCase();
  return DISPLAY_TRACKING_PARAMS.has(k) || k.startsWith('utm_');
};

/** Redirect wrappers that carry the real destination in a `u` / `q` param. */
const REDIRECT_WRAPPERS: Record<string, string> = {
  'l.instagram.com': 'u',
  'l.facebook.com': 'u',
  'lm.facebook.com': 'u',
  'away.vk.com': 'to',
  'out.reddit.com': 'url',
};

/** Unwrap `l.instagram.com/?u=<encoded>` style links to the destination they point at. */
export function unwrapRedirect(url: string): string {
  try {
    const u = new URL(url.startsWith('http') ? url : 'https://' + url);
    const param = REDIRECT_WRAPPERS[u.hostname.replace(/^www\./i, '').toLowerCase()];
    if (!param) return url;
    const target = u.searchParams.get(param);
    if (!target) return url;
    const decoded = decodeURIComponent(target);
    // Only follow the unwrap if it actually yields an http(s) URL.
    return /^https?:\/\//i.test(decoded) ? decoded : url;
  } catch {
    return url;
  }
}

/** The URL with redirect wrappers unwrapped and tracking params dropped. */
export function stripTracking(url: string): string {
  const unwrapped = unwrapRedirect(url);
  try {
    const u = new URL(unwrapped.startsWith('http') ? unwrapped : 'https://' + unwrapped);
    for (const p of [...u.searchParams.keys()]) if (isTrackingParam(p)) u.searchParams.delete(p);
    u.hash = '';
    let out = u.toString();
    if (out.endsWith('/') && u.pathname !== '/') out = out.slice(0, -1);
    return out;
  } catch {
    return unwrapped;
  }
}

/**
 * A short, clean URL for display: no scheme, no `www.`, no tracking params, and
 * never longer than `maxLen`. The real `url` is kept untouched for opening.
 */
export function displayUrl(url: string | null, maxLen = 60): string | null {
  if (!url) return null;
  const clean = stripTracking(url).replace(/^https?:\/\//i, '').replace(/^www\./i, '');
  return clean.length > maxLen ? clean.slice(0, maxLen - 1).trimEnd() + '…' : clean;
}

/** "2401.00001.pdf" parses as domain-like, but it's a filename and a fine title. */
const BARE_FILENAME = /^[^/\s]+\.(pdf|docx?|xlsx?|pptx?|csv|txt|zip|rtf|epub|md|key|pages|numbers|png|jpe?g|gif|webp|svg)$/i;

/** True for a string that is really just a URL — not a title worth showing. */
export function looksLikeUrl(s: string): boolean {
  const t = s.trim();
  if (!t || /\s/.test(t)) return false;
  if (/^https?:\/\//i.test(t)) return true;
  if (BARE_FILENAME.test(t)) return false;
  return /^(?:[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.)+[a-z]{2,}(?:[/?#]|$)/i.test(t);
}

const INSTAGRAM_HOSTS = ['instagram.com', 'instagr.am', 'cdninstagram.com'];

export function isInstagramUrl(url: string): boolean {
  const host = domainOf(unwrapRedirect(url));
  return !!host && INSTAGRAM_HOSTS.some((h) => host === h || host.endsWith('.' + h));
}

/**
 * Retailers that bot-block scrapers hard enough that we routinely have no title.
 * A named label ("Amazon product") reads far better on the dashboard than the bare
 * host, and much better than the block page's own title. Matched on the registrable
 * host so amazon.in / amazon.co.uk / smile.amazon.com all land on the same label.
 */
const MERCHANT_LABELS: { match: RegExp; label: string }[] = [
  { match: /(^|\.)(amazon|amzn)\./i, label: 'Amazon product' },
  { match: /(^|\.)(flipkart|fkrt)\./i, label: 'Flipkart product' },
  { match: /(^|\.)myntra\./i, label: 'Myntra product' },
];

/** "Amazon product" for a known retailer host, else null. */
export function merchantLabelFor(host: string | null): string | null {
  if (!host) return null;
  return MERCHANT_LABELS.find((m) => m.match.test(host))?.label ?? null;
}

/**
 * A human-readable title for an item with no fetched title — never the raw URL.
 * Instagram gets a shape-aware label ("Instagram reel"), bot-blocked retailers get
 * a product label ("Amazon product"); everything else falls back to the bare source
 * domain ("jobs24x.com").
 */
export function displayTitleFor(url: string | null, sourceDomain: string | null): string {
  const link = url ? unwrapRedirect(url) : null;
  const host = (link ? domainOf(link) : null) || sourceDomain;

  if (link && isInstagramUrl(link)) {
    let segment = '';
    try {
      segment = (new URL(link.startsWith('http') ? link : 'https://' + link).pathname.split('/').filter(Boolean)[0] || '').toLowerCase();
    } catch { /* fall through to the plain label */ }
    if (segment === 'reel' || segment === 'reels') return 'Instagram reel';
    if (segment === 'p') return 'Instagram post';
    if (segment === 'tv') return 'Instagram video';
    if (segment === 'stories') return 'Instagram story';
    if (segment === 'explore') return 'Instagram';
    return segment ? `Instagram · @${segment}` : 'Instagram';
  }

  return merchantLabelFor(host) || host || 'Saved link';
}
