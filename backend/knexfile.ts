import type { Knex } from 'knex';
import * as dotenv from 'dotenv';
import { buildConnection } from './src/db/db-config';

dotenv.config();

const config: Knex.Config = {
  client: 'pg',
  // Migrations go through DIRECT_URL when it's set, falling back to
  // DATABASE_URL and then the discrete DB_* vars. Transaction-mode poolers
  // (pgbouncer) can't hold the session-level locks DDL needs, so the direct
  // endpoint is the safe one to run schema changes over.
  connection: buildConnection(process.env.DIRECT_URL),
  migrations: {
    directory: './src/db/migrations/data',
    extension: 'ts',
    loadExtensions: ['.ts'],
  },
};

export default config;
