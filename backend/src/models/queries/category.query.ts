import { Injectable } from '@nestjs/common';
import { BaseQuery } from './base.query';
import { DatabaseService } from '../../db/services/database.service';
import { DEFAULT_CATEGORIES } from '../../enums/default-categories';

export interface CategoryRow {
  id: number;
  uuid: string;
  user_id: number;
  slug: string;
  name: string;
  color: string;
  is_system: boolean;
  sort_order: number;
  is_active: boolean;
}

@Injectable()
export class CategoryQuery extends BaseQuery {
  constructor(db: DatabaseService) {
    super(db, 'categories');
  }

  listForUser(userId: number): Promise<CategoryRow[]> {
    return this.query().where({ user_id: userId, is_active: true }).orderBy('sort_order', 'asc');
  }

  findBySlug(userId: number, slug: string): Promise<CategoryRow | undefined> {
    return this.query().where({ user_id: userId, slug }).first();
  }

  findById(userId: number, id: number): Promise<CategoryRow | undefined> {
    return this.query().where({ user_id: userId, id }).first();
  }

  /**
   * Every mutation below is scoped to user_id as well as uuid. The uuid alone
   * would be enough to find the row, but pairing it with the owner means a
   * leaked or guessed uuid still cannot read or write another account's data.
   */
  findByUuid(userId: number, uuid: string): Promise<CategoryRow | undefined> {
    return this.query().where({ user_id: userId, uuid }).first();
  }

  /**
   * Case-insensitive display-name lookup. Renaming keeps the slug fixed, so the
   * slug unique index alone would happily allow two categories both shown as
   * "Career" — this is what stops that. `excludeUuid` skips the row being renamed.
   */
  findByName(userId: number, name: string, excludeUuid?: string): Promise<CategoryRow | undefined> {
    const q = this.query().where({ user_id: userId }).whereRaw('lower(name) = lower(?)', [name.trim()]);
    if (excludeUuid) q.andWhereNot({ uuid: excludeUuid });
    return q.first();
  }

  async update(userId: number, uuid: string, patch: Partial<CategoryRow>): Promise<CategoryRow | undefined> {
    const [row] = await this.query().where({ user_id: userId, uuid })
      .update({ ...patch, updated_at: this.getKnex().fn.now() }).returning('*');
    return row;
  }

  /** Hard delete. Callers must reassign the category's items first. */
  remove(userId: number, uuid: string): Promise<number> {
    return this.query().where({ user_id: userId, uuid }).del();
  }

  /** Write sort_order to match the given uuid order, in one transaction. */
  async applyOrder(userId: number, uuids: string[]): Promise<void> {
    await this.getKnex().transaction(async (trx) => {
      for (let i = 0; i < uuids.length; i++) {
        await trx(this.tableName).withSchema(this.db.schema)
          .where({ user_id: userId, uuid: uuids[i] })
          .update({ sort_order: i + 1, updated_at: trx.fn.now() });
      }
    });
  }

  /** Highest sort_order in use, so a new category lands at the end of the list. */
  async maxSortOrder(userId: number): Promise<number> {
    const row = await this.query().where({ user_id: userId }).max('sort_order as max').first();
    return Number(row?.max) || 0;
  }

  async create(userId: number, data: { slug: string; name: string; color: string; is_system?: boolean; sort_order?: number }): Promise<CategoryRow> {
    const [row] = await this.query()
      .insert({ user_id: userId, ...data, created_at: this.getKnex().fn.now(), updated_at: this.getKnex().fn.now() })
      .returning('*');
    return row;
  }

  /** Copy the default set into a new user's own rows. */
  async provisionDefaults(userId: number): Promise<void> {
    const rows = DEFAULT_CATEGORIES.map((c) => ({
      user_id: userId, slug: c.slug, name: c.name, color: c.color,
      is_system: true, sort_order: c.sort_order,
      created_at: this.getKnex().fn.now(), updated_at: this.getKnex().fn.now(),
    }));
    await this.query().insert(rows).onConflict(['user_id', 'slug']).ignore();
  }
}
