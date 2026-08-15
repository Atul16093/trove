import { Injectable } from '@nestjs/common';
import { CategoryQuery, CategoryRow } from '../../models/queries/category.query';
import { ItemQuery } from '../../models/queries/item.query';
import { ResponseCode, ResponseService } from '../../common/response';
import { CategoryMessages } from '../../enums/messages.enum';
import { CreateCategoryDto, UpdateCategoryDto, ReorderCategoriesDto } from '../../models/dtos/category.dto';
import { FALLBACK_CATEGORY_SLUG } from '../../enums/default-categories';

const slugify = (name: string) =>
  name.toLowerCase().trim().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 60) || 'category';

/**
 * Categories are per-user. Every read and every write in here is scoped to the
 * authenticated user's id — a uuid from another account resolves to nothing,
 * so it 404s rather than leaking or mutating a stranger's row.
 */
@Injectable()
export class CategoryService {
  constructor(
    private readonly categories: CategoryQuery,
    private readonly items: ItemQuery,
    private readonly response: ResponseService,
  ) {}

  private view(c: CategoryRow, count = 0) {
    return { uuid: c.uuid, slug: c.slug, name: c.name, color: c.color, isSystem: c.is_system, sortOrder: c.sort_order, count };
  }

  async list(userId: number) {
    // Safety net: the nine defaults must exist on every account. Insert is
    // ON CONFLICT (user_id, slug) DO NOTHING, so this never duplicates and
    // never overwrites a default the user has renamed or recolored.
    await this.categories.provisionDefaults(userId);

    const cats = await this.categories.listForUser(userId);
    const rows = await this.items.listForUser(userId);
    const counts: Record<number, number> = {};
    for (const r of rows) if (r.category_id) counts[r.category_id] = (counts[r.category_id] || 0) + 1;
    const data = cats.map((c) => this.view(c, counts[c.id] || 0));
    return this.response.success(ResponseCode.SUCCESS, CategoryMessages.LISTED, data);
  }

  async create(userId: number, dto: CreateCategoryDto) {
    const slug = slugify(dto.name);
    const clash = await this.categories.findBySlug(userId, slug)
      || await this.categories.findByName(userId, dto.name);
    if (clash) return this.response.error(ResponseCode.CONFLICT, CategoryMessages.SLUG_TAKEN);
    const cat = await this.categories.create(userId, {
      slug, name: dto.name.trim(), color: dto.color || '#8E8E93',
      is_system: false, // user-created categories are always deletable
      sort_order: (await this.categories.maxSortOrder(userId)) + 1,
    });
    return this.response.success(ResponseCode.CREATED, CategoryMessages.CREATED, this.view(cat));
  }

  /** Rename and/or recolor. Allowed on defaults too — only deletion is blocked. */
  async update(userId: number, uuid: string, dto: UpdateCategoryDto) {
    const existing = await this.categories.findByUuid(userId, uuid);
    if (!existing) return this.response.error(ResponseCode.NOT_FOUND, CategoryMessages.NOT_FOUND);

    const patch: Partial<CategoryRow> = {};
    if (dto.name !== undefined) {
      if (await this.categories.findByName(userId, dto.name, uuid)) {
        return this.response.error(ResponseCode.CONFLICT, CategoryMessages.SLUG_TAKEN);
      }
      patch.name = dto.name.trim();
    }
    if (dto.color !== undefined) patch.color = dto.color;

    // slug is deliberately left alone: the categorizer maps into it, so renaming
    // "Jobs" to "Career" must not break classification of future saves.
    const row = await this.categories.update(userId, uuid, patch);
    if (!row) return this.response.error(ResponseCode.NOT_FOUND, CategoryMessages.NOT_FOUND);
    return this.response.success(ResponseCode.SUCCESS, CategoryMessages.UPDATED, this.view(row));
  }

  /**
   * Delete a user-created category. Its items are never deleted — they move to
   * the user's "Other" category first, then the row goes. Defaults are locked.
   */
  async remove(userId: number, uuid: string) {
    const cat = await this.categories.findByUuid(userId, uuid);
    if (!cat) return this.response.error(ResponseCode.NOT_FOUND, CategoryMessages.NOT_FOUND);
    if (cat.is_system) return this.response.error(ResponseCode.FORBIDDEN, CategoryMessages.SYSTEM_LOCKED);

    // Make sure "Other" exists before we move anything into it.
    await this.categories.provisionDefaults(userId);
    const fallback = await this.categories.findBySlug(userId, FALLBACK_CATEGORY_SLUG);

    const moved = await this.items.reassignCategory(userId, cat.id, fallback ? fallback.id : null);
    await this.categories.remove(userId, uuid);
    return this.response.success(ResponseCode.SUCCESS, CategoryMessages.DELETED, {
      moved, movedTo: fallback ? fallback.slug : null,
    });
  }

  /**
   * Rewrite sort_order to match the given uuid order. Unknown uuids — another
   * account's, or one deleted in a racing tab — are dropped rather than applied.
   */
  async reorder(userId: number, dto: ReorderCategoriesDto) {
    const owned = new Set((await this.categories.listForUser(userId)).map((c) => c.uuid));
    const valid = dto.uuids.filter((u) => owned.has(u));
    if (!valid.length) return this.response.error(ResponseCode.NOT_FOUND, CategoryMessages.NOT_FOUND);

    await this.categories.applyOrder(userId, valid);
    const cats = await this.categories.listForUser(userId);
    return this.response.success(ResponseCode.SUCCESS, CategoryMessages.REORDERED, cats.map((c) => this.view(c)));
  }
}
