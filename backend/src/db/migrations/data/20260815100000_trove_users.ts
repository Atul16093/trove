import type { Knex } from "knex";

/**
 * Trove users.
 *
 * Supports two sign-in methods: email + password, and Google.
 * A CHECK constraint guarantees every account is reachable by at least one of
 * them (password_hash and google_id are each nullable, but not both).
 */
export async function up(knex: Knex): Promise<void> {
    await knex.schema.withSchema('data').createTable('users', table => {
        // primary key
        table.increments('id').primary();

        // public identifier exposed to the frontend (never leak the integer id)
        table.uuid('uuid').notNullable().defaultTo(knex.raw('gen_random_uuid()')).index('index_users_uuid');

        // credentials
        table.string('email', 255).notNullable().unique().index('index_users_email');
        table.string('password_hash', 255).nullable().comment('bcrypt hash; null for Google-only accounts');
        table.string('google_id', 255).nullable().unique().index('index_users_google_id').comment('Google account "sub" claim');

        // profile
        table.string('display_name', 120).nullable();
        table.string('avatar_url', 512).nullable();

        // state
        table.boolean('email_verified').notNullable().defaultTo(false);
        table.timestamp('last_login_at').nullable();
        table.boolean('is_active').notNullable().defaultTo(true);

        table.timestamp('created_at').notNullable().defaultTo(knex.fn.now());
        table.timestamp('updated_at').notNullable().defaultTo(knex.fn.now());
    });

    // A user must have at least one usable auth method
    await knex.raw(`
        ALTER TABLE "data"."users"
        ADD CONSTRAINT chk_users_auth_method
        CHECK (password_hash IS NOT NULL OR google_id IS NOT NULL);
    `);
}

export async function down(knex: Knex): Promise<void> {
    await knex.schema.withSchema('data').dropTableIfExists('users');
}
