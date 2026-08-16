import { Injectable, OnModuleDestroy } from '@nestjs/common';
import knex, { Knex } from 'knex';
import { buildConnection, dbSchema } from '../db-config';

@Injectable()
export class DatabaseService implements OnModuleDestroy {
  private readonly knexInstance: Knex;
  public readonly schema: string;

  constructor() {
    this.schema = dbSchema();
    this.knexInstance = knex({
      client: 'pg',
      // DATABASE_URL when set, otherwise the discrete DB_* vars. The app uses
      // the pooled endpoint; only migrations prefer DIRECT_URL.
      connection: buildConnection(),
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
