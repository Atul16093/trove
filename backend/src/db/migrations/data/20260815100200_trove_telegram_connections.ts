import type { Knex } from "knex";

/**
 * Links a Telegram account to a Trove user so forwarded links attach to the
 * right account.
 *
 * Flow:
 *   1. User taps "Connect Telegram" → a row is created with a one-time
 *      `link_token` (chat_id still null, linked_at still null = pending).
 *   2. User opens t.me/TroveBot?start=<token>; the bot receives /start <token>,
 *      matches the token, and fills in `telegram_chat_id` + `linked_at`.
 *   3. From then on, the bot resolves incoming links by `telegram_chat_id`.
 *
 * One Telegram account per user for v1 (user_id and telegram_chat_id both unique).
 */
export async function up(knex: Knex): Promise<void> {
    await knex.schema.withSchema('data').createTable('telegram_connections', table => {
        table.increments('id').primary();
        table.uuid('uuid').notNullable().defaultTo(knex.raw('gen_random_uuid()'));

        table.integer('user_id').notNullable().unique().index('index_telegram_user_id')
            .references('id').inTable('data.users').onDelete('CASCADE');

        // filled in when the bot receives /start <token>. bigInteger: Telegram ids exceed int4.
        table.bigInteger('telegram_chat_id').nullable().unique().index('index_telegram_chat_id');
        table.string('telegram_username', 64).nullable();

        // one-time linking token
        table.string('link_token', 64).nullable().index('index_telegram_link_token');
        table.timestamp('link_token_expires_at').nullable();
        table.timestamp('linked_at').nullable().comment('Null while the connection is still pending');

        table.boolean('is_active').notNullable().defaultTo(true);
        table.timestamp('created_at').notNullable().defaultTo(knex.fn.now());
        table.timestamp('updated_at').notNullable().defaultTo(knex.fn.now());
    });
}

export async function down(knex: Knex): Promise<void> {
    await knex.schema.withSchema('data').dropTableIfExists('telegram_connections');
}
