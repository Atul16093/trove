import { Injectable, OnModuleDestroy } from '@nestjs/common';
import knex, { Knex } from 'knex';

@Injectable()
export class DatabaseService implements OnModuleDestroy {
  private readonly knexInstance: Knex;
  public readonly schema: string;

  constructor() {
    this.schema = process.env.DB_SCHEMA || 'data';
    this.knexInstance = knex({
      client: 'pg',
      connection: {
        host: process.env.DB_HOST || 'localhost',
        port: Number(process.env.DB_PORT || 5432),
        user: process.env.DB_USER || 'trove',
        password: process.env.DB_PASSWORD || 'trove',
        database: process.env.DB_NAME || 'trove',
      },
      pool: { min: 2, max: 10 },
    });
  }

  getKnex(): Knex {
    return this.knexInstance;
  }

  async onModuleDestroy(): Promise<void> {
    await this.knexInstance.destroy();
  }
}
