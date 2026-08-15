import type { Knex } from "knex";

/**
 * Categories are per-user.
 *
 * At signup, the default set is copied into rows owned by that user
 * (is_system = true). This lets each user rename, recolor, reorder, or delete
 * defaults independently and add their own on top — without touching a shared
 * global table. `slug` is the stable machine key the categorizer maps into;
 * `name` is the editable display label.
 */
export async function up(knex: Knex): Promise<void> {
    await knex.schema.withSchema('data').createTable('categories', table => {
        table.increments('id').primary();
        table.uuid('uuid').notNullable().defaultTo(knex.raw('gen_random_uuid()')).index('index_categories_uuid');

        // owner
        table.integer('user_id').notNullable().index('index_categories_user_id')
            .references('id').inTable('data.users').onDelete('CASCADE');

        // stable key + display
        table.string('slug', 60).notNullable().comment('Stable key the categorizer maps into, e.g. "jobs"');
        table.string('name', 120).notNullable();
        table.string('color', 9).notNullable().defaultTo('#6C6B64');

        table.boolean('is_system').notNullable().defaultTo(false).comment('True for defaults provisioned at signup');
        table.integer('sort_order').notNullable().defaultTo(0);
        table.boolean('is_active').notNullable().defaultTo(true);

        table.timestamp('created_at').notNullable().defaultTo(knex.fn.now());
        table.timestamp('updated_at').notNullable().defaultTo(knex.fn.now());

        // one slug per user
        table.unique(['user_id', 'slug'], { indexName: 'uq_categories_user_slug' });
    });
}

export async function down(knex: Knex): Promise<void> {
    await knex.schema.withSchema('data').dropTableIfExists('categories');
}
