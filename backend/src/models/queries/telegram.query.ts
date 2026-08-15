import { Injectable } from '@nestjs/common';
import { BaseQuery } from './base.query';
import { DatabaseService } from '../../db/services/database.service';

export interface TelegramRow {
  id: number;
  user_id: number;
  telegram_chat_id: string | null;
  telegram_username: string | null;
  link_token: string | null;
  link_token_expires_at: Date | null;
  linked_at: Date | null;
  is_active: boolean;
}

@Injectable()
export class TelegramQuery extends BaseQuery {
  constructor(db: DatabaseService) {
    super(db, 'telegram_connections');
  }

  findByUserId(userId: number): Promise<TelegramRow | undefined> {
    return this.query().where({ user_id: userId }).first();
  }

  findByToken(token: string): Promise<TelegramRow | undefined> {
    return this.query().where({ link_token: token }).first();
  }

  findByChatId(chatId: string): Promise<TelegramRow | undefined> {
    return this.query().where({ telegram_chat_id: chatId }).first();
  }

  async upsertPending(userId: number, token: string, expiresAt: Date): Promise<TelegramRow> {
    const existing = await this.findByUserId(userId);
    if (existing) {
      const [row] = await this.query().where({ user_id: userId })
        .update({ link_token: token, link_token_expires_at: expiresAt, updated_at: this.getKnex().fn.now() })
        .returning('*');
      return row;
    }
    const [row] = await this.query()
      .insert({ user_id: userId, link_token: token, link_token_expires_at: expiresAt, created_at: this.getKnex().fn.now(), updated_at: this.getKnex().fn.now() })
      .returning('*');
    return row;
  }

  async confirmLink(id: number, chatId: string, username: string | null): Promise<void> {
    await this.query().where({ id }).update({
      telegram_chat_id: chatId, telegram_username: username, linked_at: this.getKnex().fn.now(),
      link_token: null, link_token_expires_at: null, updated_at: this.getKnex().fn.now(),
    });
  }
}
