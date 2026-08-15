import type { Knex } from 'knex';

/**
 * Extends `items` to hold files (PDFs, docs) in addition to links.
 *
 * A file item has kind='file', no URL, and instead a stored file: original
 * name, mime type, size, and a storage key pointing at the bytes on disk.
 * Dedupe still works via url_hash — for files it holds the sha256 of the file
 * contents, so the same document saved twice keeps one row.
 */
export async function up(knex: Knex): Promise<void> {
  await knex.raw(`
    DO $$ BEGIN
      CREATE TYPE trove_item_kind AS ENUM ('link', 'file');
    EXCEPTION WHEN duplicate_object THEN null; END $$;
  `);

  // links no longer own the table exclusively — a file item has no URL
  await knex.schema.withSchema('data').alterTable('items', (table) => {
    table.specificType('kind', 'trove_item_kind').notNullable().defaultTo('link').index('index_items_kind');
    table.string('file_name', 512).nullable().comment('Original filename, e.g. rate-card.pdf');
    table.string('file_mime', 160).nullable().comment('e.g. application/pdf');
    table.bigInteger('file_size').nullable().comment('Bytes');
    table.text('file_key').nullable().comment('Storage key/path for the stored bytes');
  });

  // url is required only for links now
  await knex.raw(`ALTER TABLE "data"."items" ALTER COLUMN "url" DROP NOT NULL;`);
}

export async function down(knex: Knex): Promise<void> {
  await knex.raw(`ALTER TABLE "data"."items" ALTER COLUMN "url" SET NOT NULL;`);
  await knex.schema.withSchema('data').alterTable('items', (table) => {
    table.dropColumn('kind');
    table.dropColumn('file_name');
    table.dropColumn('file_mime');
    table.dropColumn('file_size');
    table.dropColumn('file_key');
  });
  await knex.raw(`DROP TYPE IF EXISTS trove_item_kind;`);
}
