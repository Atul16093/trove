import { Injectable } from '@nestjs/common';
import { BaseQuery } from './base.query';
import { DatabaseService } from '../../db/services/database.service';

export interface UserRow {
  id: number;
  uuid: string;
  email: string;
  password_hash: string | null;
  google_id: string | null;
  display_name: string | null;
  avatar_url: string | null;
  email_verified: boolean;
  is_active: boolean;
  created_at: Date;
}

@Injectable()
export class UserQuery extends BaseQuery {
  constructor(db: DatabaseService) {
    super(db, 'users');
  }

  findByEmail(email: string): Promise<UserRow | undefined> {
    return this.query().where({ email: email.toLowerCase() }).first();
  }

  findByGoogleId(googleId: string): Promise<UserRow | undefined> {
    return this.query().where({ google_id: googleId }).first();
  }

  findByUuid(uuid: string): Promise<UserRow | undefined> {
    return this.query().where({ uuid }).first();
  }

  async create(data: Partial<UserRow>): Promise<UserRow> {
    const [row] = await this.query()
      .insert({ ...data, email: (data.email || '').toLowerCase(), created_at: this.getKnex().fn.now(), updated_at: this.getKnex().fn.now() })
      .returning('*');
    return row;
  }

  async touchLogin(id: number): Promise<void> {
    await this.query().where({ id }).update({ last_login_at: this.getKnex().fn.now(), updated_at: this.getKnex().fn.now() });
  }
}
