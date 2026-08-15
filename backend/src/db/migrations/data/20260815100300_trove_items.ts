import type { Knex } from "knex";

/**
 * A saved link — the core entity.
 *
 * Lifecycle: inserted as `processing` (category_id null), then a background
 * worker fetches metadata, asks the categorizer to classify it, and flips it to
 * `ready` (or `failed` if enrichment couldn't complete — the link is never lost).
 *
 * Dedupe: `url_hash` = sha256(canonical_url). A unique (user_id, url_hash) means
 * saving the same link twice keeps one row and just bumps `updated_at`.
 *
 * `caption` holds the original Instagram/post caption when available, kept for
 * later (e.g. extracting the real destination link out of the caption).
 */
export async function up(knex: Knex): Promise<void> {
    // lifecycle status through the enrichment pipeline
    await knex.raw(`
        DO $$ BEGIN
            CREATE TYPE trove_item_status AS ENUM ('processing', 'ready', 'failed');
        EXCEPTION WHEN duplicate_object THEN null; END $$;
    `);

    // which capture surface the link entered through
    await knex.raw(`
        DO $$ BEGIN
            CREATE TYPE trove_capture_source AS ENUM ('telegram', 'web', 'mobile_share', 'extension');
        EXCEPTION WHEN duplicate_object THEN null; END $$;
    `);

    await knex.schema.withSchema('data').createTable('items', table => {
        table.increments('id').primary();
        table.uuid('uuid').notNullable().defaultTo(knex.raw('gen_random_uuid()')).index('index_items_uuid');

        // ownership + classification
        table.integer('user_id').notNullable().index('index_items_user_id')
            .references('id').inTable('data.users').onDelete('CASCADE');
        table.integer('category_id').nullable().index('index_items_category_id')
            .references('id').inTable('data.categories').onDelete('SET NULL')
            .comment('Null while processing, or if the category was later deleted');

        // the link itself
        table.text('url').notNullable().comment('Original URL as received');
        table.text('canonical_url').nullable().comment('Normalized URL used for dedupe');
        table.string('url_hash', 64).notNullable().comment('sha256(canonical_url) — dedupe key');
        table.string('source_domain', 255).nullable().comment('e.g. instagram.com, wellfound.com');
        table.specificType('capture_source', 'trove_capture_source').notNullable().defaultTo('telegram');

        // enriched metadata
        table.string('title', 512).nullable();
        table.text('description').nullable();
        table.string('image_url', 1024).nullable();
        table.string('summary', 512).nullable().comment('One-line summary from the categorizer');
        table.specificType('tags', 'text[]').nullable();
        table.text('caption').nullable().comment('Original post/Instagram caption when available');

        // pipeline + engagement
        table.specificType('status', 'trove_item_status').notNullable().defaultTo('processing');
        table.integer('open_count').notNullable().defaultTo(0).comment('Rediscovery signal — the north-star metric');
        table.timestamp('last_opened_at').nullable();

        table.timestamp('deleted_at').nullable().comment('Soft remove / archive');
        table.timestamp('created_at').notNullable().defaultTo(knex.fn.now());
        table.timestamp('updated_at').notNullable().defaultTo(knex.fn.now());

        // one copy of a given link per user — re-saving just bumps updated_at
        table.unique(['user_id', 'url_hash'], { indexName: 'uq_items_user_url' });
    });

    // tag filtering (GIN over text[]) and recency browsing per user
    await knex.raw(`CREATE INDEX index_items_tags ON "data"."items" USING GIN (tags);`);
    await knex.raw(`CREATE INDEX index_items_user_created ON "data"."items" (user_id, created_at DESC);`);
}

export async function down(knex: Knex): Promise<void> {
    await knex.schema.withSchema('data').dropTableIfExists('items');
    await knex.raw(`DROP TYPE IF EXISTS trove_item_status;`);
    await knex.raw(`DROP TYPE IF EXISTS trove_capture_source;`);
}
