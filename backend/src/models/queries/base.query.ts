import { Knex } from 'knex';
import { DatabaseService } from '../../db/services/database.service';

/**
 * BaseQuery — thin data-access base, mirroring the pinaypal query layer.
 * Every query class targets one table in the `data` schema.
 */
export abstract class BaseQuery {
  protected readonly tableName: string;

  constructor(protected readonly db: DatabaseService, tableName: string) {
    this.tableName = tableName;
  }

  protected getKnex(): Knex {
    return this.db.getKnex();
  }

  /** Query builder scoped to this table in the data schema. */
  protected query(): Knex.QueryBuilder {
    return this.getKnex()(this.tableName).withSchema(this.db.schema);
  }
}
