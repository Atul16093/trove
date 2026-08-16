import type { Knex } from 'knex';

/**
 * Postgres connection settings, shared by the runtime app (DatabaseService) and
 * the migration CLI (knexfile) so the two can't drift apart.
 *
 * Managed providers — Supabase, Neon, RDS, Railway — hand out a single
 * connection string; local dev uses the discrete DB_* vars. A URL always wins
 * when one is present. DB_SSL=true adds the relaxed TLS those providers expect.
 *
 * Env is read inside the function rather than at import time: knexfile calls
 * dotenv.config() after its imports have already been evaluated, so reading at
 * module scope would capture the values from before .env was loaded.
 */
export function buildConnection(preferredUrl?: string): Knex.PgConnectionConfig {
  const ssl = process.env.DB_SSL === 'true' ? { rejectUnauthorized: false } : undefined;
  const connectionString = preferredUrl || process.env.DATABASE_URL;

  if (connectionString) return { connectionString, ...(ssl && { ssl }) };

  return {
    host: process.env.DB_HOST || 'localhost',
    port: Number(process.env.DB_PORT || 5432),
    user: process.env.DB_USER || 'trove',
    password: process.env.DB_PASSWORD || 'trove',
    database: process.env.DB_NAME || 'trove',
    ...(ssl && { ssl }),
  };
}

/** The schema every table lives in. Queries and migrations both target it. */
export function dbSchema(): string {
  return process.env.DB_SCHEMA || 'data';
}
