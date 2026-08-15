import { Injectable } from '@nestjs/common';
import { BaseQuery } from './base.query';
import { DatabaseService } from '../../db/services/database.service';

export interface ItemRow {
  id: number;
  uuid: string;
  user_id: number;
  category_id: number | null;
  url: string | null;
  canonical_url: string | null;
  url_hash: string;
  source_domain: string | null;
  capture_source: string;
  kind: 'link' | 'file';
  file_name: string | null;
  file_mime: string | null;
  file_size: number | null;
  file_key: string | null;
  title: string | null;
  description: string | null;
  image_url: string | null;
  summary: string | null;
  tags: string[] | null;
  caption: string | null;
  note: string | null;
  status: 'processing' | 'ready' | 'failed';
  open_count: number;
  last_opened_at: Date | null;
  created_at: Date;
  updated_at: Date;
}

@Injectable()
export class ItemQuery extends BaseQuery {
  constructor(db: DatabaseService) {
    super(db, 'items');
  }

  /** Upsert on (user_id, url_hash): dedupe keeps one row, bumps updated_at. Returns the row + whether it was new. */
  async upsert(data: Partial<ItemRow>): Promise<{ row: ItemRow; created: boolean }> {
    const existing = await this.query().where({ user_id: data.user_id, url_hash: data.url_hash }).first();
    if (existing) {
      const [row] = await this.query().where({ id: existing.id })
        .update({ updated_at: this.getKnex().fn.now(), deleted_at: null }).returning('*');
      return { row, created: false };
    }
    const [row] = await this.query()
      .insert({ ...data, created_at: this.getKnex().fn.now(), updated_at: this.getKnex().fn.now() })
      .returning('*');
    return { row, created: true };
  }

  findByUserHash(userId: number, urlHash: string): Promise<ItemRow | undefined> {
    return this.query().where({ user_id: userId, url_hash: urlHash }).first();
  }

  async create(data: Partial<ItemRow>): Promise<ItemRow> {
    const [row] = await this.query()
      .insert({ ...data, created_at: this.getKnex().fn.now(), updated_at: this.getKnex().fn.now() })
      .returning('*');
    return row;
  }

  async bump(id: number): Promise<ItemRow> {
    const [row] = await this.query().where({ id })
      .update({ updated_at: this.getKnex().fn.now(), deleted_at: null }).returning('*');
    return row;
  }

  listForUser(userId: number, opts: { categoryId?: number; search?: string } = {}): Promise<ItemRow[]> {
    let q = this.query().where({ user_id: userId }).whereNull('deleted_at');
    if (opts.categoryId) q = q.andWhere({ category_id: opts.categoryId });
    if (opts.search) {
      const s = `%${opts.search}%`;
      q = q.andWhere((b) => b.whereILike('title', s).orWhereILike('summary', s).orWhereILike('source_domain', s).orWhereILike('file_name', s));
    }
    return q.orderBy('updated_at', 'desc');
  }

  /**
   * Links that never finished enrichment: still `processing`, left `failed` by an
   * older build, or `ready` but uncategorized. Files are excluded — enrichment
   * skips them, so re-queuing one would be a no-op.
   */
  listUnresolved(userId: number): Promise<ItemRow[]> {
    return this.query().where({ user_id: userId, kind: 'link' }).whereNull('deleted_at')
      .andWhere((b) => b.whereIn('status', ['processing', 'failed']).orWhereNull('category_id'))
      .orderBy('updated_at', 'desc');
  }

  findByUuid(userId: number, uuid: string): Promise<ItemRow | undefined> {
    return this.query().where({ user_id: userId, uuid }).whereNull('deleted_at').first();
  }

  findById(id: number): Promise<ItemRow | undefined> {
    return this.query().where({ id }).first();
  }

  async update(userId: number, uuid: string, patch: Partial<ItemRow>): Promise<ItemRow | undefined> {
    const [row] = await this.query().where({ user_id: userId, uuid })
      .update({ ...patch, updated_at: this.getKnex().fn.now() }).returning('*');
    return row;
  }

  async updateEnrichment(id: number, patch: Partial<ItemRow>): Promise<void> {
    await this.query().where({ id }).update({ ...patch, updated_at: this.getKnex().fn.now() });
  }

  /**
   * Move every item in one category to another. Scoped to the owner as well as
   * the category id so a deletion can never touch another account's items.
   * Returns how many items moved.
   */
  reassignCategory(userId: number, fromCategoryId: number, toCategoryId: number | null): Promise<number> {
    return this.query().where({ user_id: userId, category_id: fromCategoryId })
      .update({ category_id: toCategoryId, updated_at: this.getKnex().fn.now() });
  }

  async softDelete(userId: number, uuid: string): Promise<number> {
    return this.query().where({ user_id: userId, uuid }).update({ deleted_at: this.getKnex().fn.now() });
  }

  async registerOpen(userId: number, uuid: string): Promise<ItemRow | undefined> {
    const [row] = await this.query().where({ user_id: userId, uuid })
      .update({ open_count: this.getKnex().raw('open_count + 1'), last_opened_at: this.getKnex().fn.now() })
      .returning('*');
    return row;
  }
}
