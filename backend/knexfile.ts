import type { Knex } from 'knex';
import * as dotenv from 'dotenv';
dotenv.config();

const config: Knex.Config = {
  client: 'pg',
  connection: {
    host: process.env.DB_HOST || 'localhost',
    port: Number(process.env.DB_PORT || 5432),
    user: process.env.DB_USER || 'trove',
    password: process.env.DB_PASSWORD || 'trove',
    database: process.env.DB_NAME || 'trove',
  },
  migrations: {
    directory: './src/db/migrations/data',
    extension: 'ts',
    loadExtensions: ['.ts'],
  },
};

export default config;
