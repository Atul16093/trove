import { Injectable } from '@nestjs/common';
import { ItemQuery, ItemRow } from '../../models/queries/item.query';
import { CategoryQuery } from '../../models/queries/category.query';
import { EnrichmentService } from '../enrichment/enrichment.service';
import { ResponseCode, ResponseService } from '../../common/response';
import { ItemMessages } from '../../enums/messages.enum';
import { canonicalizeUrl, hashUrl, domainOf, displayUrl, displayTitleFor, looksLikeUrl } from '../../common/utils/url.util';
import { CreateItemDto, UpdateItemDto } from '../../models/dtos/item.dto';
import { StorageService } from '../storage/storage.service';
import { FALLBACK_CATEGORY_SLUG } from '../../enums/default-categories';

/** Deterministic category guess for a file, from its name. Files aren't sent to Claude. */
function classifyFile(fileName: string): string {
  const s = (fileName || '').toLowerCase();
  const has = (...w: string[]) => w.some((x) => s.includes(x));
  if (has('resume', 'cv', 'offer', 'jd', 'job')) return 'jobs';
  if (has('invoice', 'quote', 'quotation', 'pricing', 'price', 'receipt', 'rate', 'proposal', 'budget')) return 'finance';
  if (has('course', 'lesson', 'notes', 'guide', 'ebook', 'syllabus', 'tutorial')) return 'learning';
  if (has('catalog', 'catalogue', 'product', 'lookbook', 'menu')) return 'shopping';
  return FALLBACK_CATEGORY_SLUG;
}

/** A short type tag, e.g. 'pdf', from mime/filename. */
function fileTypeTag(fileName: string, mime: string): string {
  const ext = (fileName.split('.').pop() || '').toLowerCase();
  if (ext && ext.length <= 5) return ext;
  if (mime.includes('pdf')) return 'pdf';
  if (mime.includes('word')) return 'doc';
  if (mime.includes('image')) return 'image';
  return 'file';
}

const DOC_EXTENSIONS = ['.pdf', '.doc', '.docx'];
const DOC_HOSTS = ['docs.google.com', 'drive.google.com', 'dropbox.com', '1drv.ms', 'sharepoint.com'];
const DOC_HOST_LABELS: Record<string, { tag: string; title: string }> = {
  'drive.google.com': { tag: 'drive', title: 'Google Drive file' },
  'dropbox.com': { tag: 'dropbox', title: 'Dropbox file' },
  '1drv.ms': { tag: 'onedrive', title: 'OneDrive file' },
  'sharepoint.com': { tag: 'sharepoint', title: 'SharePoint document' },
};

interface DocLink { tag: string; slug: string; title: string; }

/**
 * Document links — a raw PDF/Word file, or a Google Docs / Drive / Dropbox /
 * OneDrive / SharePoint share. Fetching their OG metadata returns junk (a login
 * wall or an empty viewer shell), so they get sorted deterministically at
 * ingest: no fetch, no Claude, straight to `ready`. Returns null for any other URL.
 */
function detectDocLink(url: string): DocLink | null {
  let u: URL;
  try {
    u = new URL(url.startsWith('http') ? url : 'https://' + url);
  } catch {
    return null;
  }
  const host = u.hostname.replace(/^www\./i, '').toLowerCase();
  let path = u.pathname;
  try { path = decodeURIComponent(path); } catch { /* keep the raw path */ }

  const ext = DOC_EXTENSIONS.find((e) => path.toLowerCase().endsWith(e));
  if (ext) {
    const fileName = path.split('/').filter(Boolean).pop() || `document${ext}`;
    return { tag: ext.slice(1), slug: 'learning', title: fileName };
  }

  const matched = DOC_HOSTS.find((h) => host === h || host.endsWith('.' + h));
  if (!matched) return null;

  if (matched === 'docs.google.com') {
    const kind = path.split('/').filter(Boolean)[0] || '';
    const title = kind === 'spreadsheets' ? 'Google Sheet'
      : kind === 'presentation' ? 'Google Slides'
      : kind === 'forms' ? 'Google Form'
      : 'Google Doc';
    return { tag: 'gdoc', slug: 'learning', title };
  }

  // Generic storage hosts hold anything, so they can't claim a topical category.
  const label = DOC_HOST_LABELS[matched];
  return { tag: label.tag, slug: FALLBACK_CATEGORY_SLUG, title: label.title };
}

@Injectable()
export class ItemService {
  constructor(
    private readonly items: ItemQuery,
    private readonly categories: CategoryQuery,
    private readonly enrichment: EnrichmentService,
    private readonly storage: StorageService,
    private readonly response: ResponseService,
  ) {}

  /**
   * The title to show. A stored title that's really just a URL counts as no
   * title at all — older rows were enriched with the raw link as a fallback —
   * so it's replaced with a derived label rather than dumped on the user.
   */
  private titleFor(row: ItemRow): string {
    if (row.kind === 'file') return row.file_name || row.title || 'File';
    const stored = (row.title || '').trim();
    if (stored && !looksLikeUrl(stored)) return stored;
    return displayTitleFor(row.canonical_url || row.url, row.source_domain);
  }

  private async view(userId: number, row: ItemRow) {
    const cat = row.category_id ? await this.categories.findById(userId, row.category_id) : null;
    const link = row.url || row.canonical_url;
    return {
      uuid: row.uuid, kind: row.kind, url: row.url, title: this.titleFor(row), summary: row.summary,
      displayUrl: displayUrl(link), note: row.note,
      description: row.description, imageUrl: row.image_url, sourceDomain: row.source_domain,
      tags: row.tags || [], caption: row.caption, status: row.status,
      captureSource: row.capture_source, openCount: row.open_count, lastOpenedAt: row.last_opened_at,
      fileName: row.file_name, fileMime: row.file_mime, fileSize: row.file_size,
      category: cat ? { uuid: cat.uuid, slug: cat.slug, name: cat.name, color: cat.color } : null,
      createdAt: row.created_at, updatedAt: row.updated_at,
    };
  }

  /** Resolve a category slug to the user's category id, falling back to "other". */
  private async resolveCategoryId(userId: number, slug: string): Promise<number | null> {
    const cat = await this.categories.findBySlug(userId, slug)
      || await this.categories.findBySlug(userId, FALLBACK_CATEGORY_SLUG);
    return cat ? cat.id : null;
  }

  /** Single ingestion path used by every capture surface (web, telegram, ...). */
  async ingest(userId: number, dto: CreateItemDto) {
    const canonical = canonicalizeUrl(dto.url);
    // Doc links are sorted here and land `ready`; everything else goes to enrichment.
    const doc = detectDocLink(canonical);
    const resolved = doc
      ? { status: 'ready' as const, title: doc.title.slice(0, 512), tags: [doc.tag], category_id: await this.resolveCategoryId(userId, doc.slug) }
      : { status: 'processing' as const, category_id: null };

    const { row, created } = await this.items.upsert({
      user_id: userId, url: dto.url, canonical_url: canonical, url_hash: hashUrl(canonical),
      source_domain: domainOf(canonical), caption: dto.caption || null,
      capture_source: dto.captureSource || 'web', ...resolved,
    });
    if (created && !doc) this.enrichment.enqueue(row.id);
    return this.response.success(ResponseCode.CREATED, ItemMessages.SAVED, await this.view(userId, row));
  }

  /**
   * Rescue sweep for links that never finished enrichment — stuck `processing`,
   * left `failed` by an older build, or still uncategorized. Re-queues them so
   * nothing already in the DB stays invisible on the dashboard.
   */
  async reprocess(userId: number) {
    const rows = await this.items.listUnresolved(userId);
    for (const row of rows) this.enrichment.enqueue(row.id);
    return this.response.success(ResponseCode.SUCCESS, ItemMessages.REPROCESSING, { queued: rows.length });
  }

  /**
   * Ingest a received file (PDF/doc) — e.g. a creator's rate card forwarded to
   * the Telegram bot. Content-hash dedupe; stored on disk; tagged by type and
   * sorted by filename (files are not sent to Claude).
   */
  async ingestFile(userId: number, file: { buffer: Buffer; fileName: string; mime: string; caption?: string; captureSource?: string; sourceLabel?: string }) {
    const hash = this.storage.hash(file.buffer);
    const existing = await this.items.findByUserHash(userId, hash);
    if (existing) {
      const row = await this.items.bump(existing.id);
      return this.response.success(ResponseCode.CREATED, ItemMessages.SAVED, await this.view(userId, row));
    }

    const { key, size } = await this.storage.save(file.buffer, file.fileName, file.mime);
    const slug = classifyFile(file.fileName);
    const categoryId = await this.resolveCategoryId(userId, slug);
    const row = await this.items.create({
      user_id: userId, kind: 'file', url: null, url_hash: hash,
      file_name: file.fileName, file_mime: file.mime, file_size: size, file_key: key,
      source_domain: file.sourceLabel || null, capture_source: (file.captureSource as any) || 'telegram',
      title: file.fileName, caption: file.caption || null,
      tags: [fileTypeTag(file.fileName, file.mime)],
      category_id: categoryId, status: 'ready',
    });
    return this.response.success(ResponseCode.CREATED, ItemMessages.SAVED, await this.view(userId, row));
  }

  /** Resolve a file item + its stored bytes for download. */
  async fileBytes(userId: number, uuid: string): Promise<{ buffer: Buffer; mime: string; name: string } | null> {
    const row = await this.items.findByUuid(userId, uuid);
    if (!row || row.kind !== 'file' || !row.file_key) return null;
    const buffer = await this.storage.read(row.file_key);
    return { buffer, mime: row.file_mime || 'application/octet-stream', name: row.file_name || 'file' };
  }

  async list(userId: number, categorySlug?: string, search?: string) {
    let categoryId: number | undefined;
    if (categorySlug && categorySlug !== 'all') {
      const cat = await this.categories.findBySlug(userId, categorySlug);
      categoryId = cat?.id;
    }
    const rows = await this.items.listForUser(userId, { categoryId, search });
    const data = await Promise.all(rows.map((r) => this.view(userId, r)));
    return this.response.success(ResponseCode.SUCCESS, ItemMessages.LISTED, data);
  }

  async detail(userId: number, uuid: string) {
    const row = await this.items.findByUuid(userId, uuid);
    if (!row) return this.response.error(ResponseCode.NOT_FOUND, ItemMessages.NOT_FOUND);
    return this.response.success(ResponseCode.SUCCESS, ItemMessages.FOUND, await this.view(userId, row));
  }

  async update(userId: number, uuid: string, dto: UpdateItemDto) {
    const patch: any = {};
    if (dto.title !== undefined) patch.title = dto.title;
    if (dto.note !== undefined) patch.note = dto.note || null;
    if (dto.tags !== undefined) {
      // Normalize on the way in so the same tag can't land twice in different cases.
      const cleaned = dto.tags.map((t) => t.trim().toLowerCase().replace(/^#+/, '')).filter(Boolean);
      patch.tags = Array.from(new Set(cleaned)).slice(0, 12);
    }
    if (dto.categoryUuid) {
      const cats = await this.categories.listForUser(userId);
      const cat = cats.find((c) => c.uuid === dto.categoryUuid);
      if (cat) patch.category_id = cat.id;
    }
    const row = await this.items.update(userId, uuid, patch);
    if (!row) return this.response.error(ResponseCode.NOT_FOUND, ItemMessages.NOT_FOUND);
    return this.response.success(ResponseCode.SUCCESS, ItemMessages.UPDATED, await this.view(userId, row));
  }

  async remove(userId: number, uuid: string) {
    const n = await this.items.softDelete(userId, uuid);
    if (!n) return this.response.error(ResponseCode.NOT_FOUND, ItemMessages.NOT_FOUND);
    return this.response.success(ResponseCode.SUCCESS, ItemMessages.DELETED);
  }

  async open(userId: number, uuid: string) {
    const row = await this.items.registerOpen(userId, uuid);
    if (!row) return this.response.error(ResponseCode.NOT_FOUND, ItemMessages.NOT_FOUND);
    return this.response.success(ResponseCode.SUCCESS, ItemMessages.OPENED, { openCount: row.open_count });
  }
}
