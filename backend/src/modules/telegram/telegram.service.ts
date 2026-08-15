import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { randomBytes } from 'crypto';
import { Telegraf } from 'telegraf';
import { TelegramQuery } from '../../models/queries/telegram.query';
import { ItemService } from '../items/item.service';

const URL_RE = /(https?:\/\/[^\s]+)/i;

/**
 * Telegram capture: links the bot to a Trove account via a one-time token,
 * then turns every forwarded link into an ingested item (capture_source=telegram).
 * Uses long polling so it runs locally without a public webhook URL.
 */
@Injectable()
export class TelegramService implements OnModuleInit {
  private readonly logger = new Logger(TelegramService.name);
  private bot: Telegraf | null = null;

  constructor(private readonly telegram: TelegramQuery, private readonly items: ItemService) {}

  onModuleInit(): void {
    const token = process.env.TELEGRAM_BOT_TOKEN;
    if (!token) { this.logger.warn('TELEGRAM_BOT_TOKEN unset — bot disabled (web capture still works)'); return; }
    this.bot = new Telegraf(token);

    this.bot.start(async (ctx) => {
      const payload = (ctx.startPayload || '').trim();
      if (!payload) { await ctx.reply('👋 Welcome to Trove. Open the app and tap "Connect Telegram" to link your account.'); return; }
      const conn = await this.telegram.findByToken(payload);
      if (!conn || (conn.link_token_expires_at && new Date(conn.link_token_expires_at) < new Date())) {
        await ctx.reply('That connect link has expired. Generate a new one from the Trove app.'); return;
      }
      await this.telegram.confirmLink(conn.id, String(ctx.chat.id), ctx.from?.username || null);
      await ctx.reply('✅ Connected! Now just forward any link here and it lands in Trove, sorted.');
    });

    this.bot.on('message', async (ctx) => {
      const msg: any = ctx.message;
      if ('text' in msg && msg.text?.startsWith('/')) return;

      const conn = await this.telegram.findByChatId(String(ctx.chat.id));
      if (!conn || !conn.linked_at) { await ctx.reply('This chat isn\'t linked yet — connect it from the Trove app first.'); return; }

      // 1) a document / file (PDF, doc, etc.) — e.g. a creator's rate card
      const doc = msg.document || (Array.isArray(msg.photo) ? this.largestPhoto(msg.photo) : null);
      if (doc) {
        try {
          const fileName = msg.document?.file_name || `photo_${Date.now()}.jpg`;
          const mime = msg.document?.mime_type || 'image/jpeg';
          const buffer = await this.downloadTelegramFile(doc.file_id);
          await this.items.ingestFile(conn.user_id, {
            buffer, fileName, mime, caption: msg.caption || undefined,
            captureSource: 'telegram', sourceLabel: this.sourceLabel(ctx),
          });
          await ctx.reply(`Saved 📎 ${fileName}`);
        } catch (e: any) {
          this.logger.warn(`file capture failed: ${e.message}`);
          await ctx.reply('That file was too large or I couldn\'t fetch it (Telegram caps bot downloads at 20MB).');
        }
        return;
      }

      // 2) a link inside text
      const text = ('text' in msg ? msg.text : '') || '';
      const match = text.match(URL_RE);
      if (!match) { await ctx.reply('Send me a link or a file (PDF, doc) and I\'ll save it. 🔗📎'); return; }
      const caption = text.replace(match[0], '').trim() || undefined;
      await this.items.ingest(conn.user_id, { url: match[0], caption, captureSource: 'telegram' });
      await ctx.reply('Saved ✅');
    });

    this.bot.launch().then(() => this.logger.log('Telegram bot started (polling)'));
  }

  private largestPhoto(photos: any[]): any {
    return photos.reduce((a, b) => ((b.file_size || 0) > (a.file_size || 0) ? b : a), photos[0]);
  }

  private sourceLabel(ctx: any): string | undefined {
    const from = ctx.message?.forward_from || ctx.message?.forward_sender_name;
    if (typeof from === 'string') return from;
    if (from?.username) return `@${from.username}`;
    if (from?.first_name) return from.first_name;
    return undefined;
  }

  /** Fetch a Telegram file's bytes by file_id (bot API caps this at ~20MB). */
  private async downloadTelegramFile(fileId: string): Promise<Buffer> {
    const link = await this.bot!.telegram.getFileLink(fileId);
    const res = await fetch(link.href, { signal: AbortSignal.timeout(20000) });
    if (!res.ok) throw new Error(`download ${res.status}`);
    return Buffer.from(await res.arrayBuffer());
  }

  async createConnectToken(userId: number): Promise<{ token: string; deepLink: string; expiresAt: Date }> {
    const token = randomBytes(16).toString('hex');
    const expiresAt = new Date(Date.now() + 15 * 60 * 1000);
    await this.telegram.upsertPending(userId, token, expiresAt);
    const username = process.env.TELEGRAM_BOT_USERNAME || 'YourTroveBot';
    return { token, deepLink: `https://t.me/${username}?start=${token}`, expiresAt };
  }

  async status(userId: number) {
    const conn = await this.telegram.findByUserId(userId);
    return { connected: !!(conn && conn.linked_at), username: conn?.telegram_username || null };
  }
}
