import { Injectable, Logger } from '@nestjs/common';
import { createHash, randomUUID } from 'crypto';
import { promises as fs } from 'fs';
import * as path from 'path';

/**
 * Local-disk file storage (dev). Files land under STORAGE_DIR.
 * The public interface (save/read/remove by key) is storage-agnostic, so
 * swapping in S3 later is a drop-in replacement behind the same methods.
 */
@Injectable()
export class StorageService {
  private readonly logger = new Logger(StorageService.name);
  private readonly root: string;

  constructor() {
    this.root = path.resolve(process.env.STORAGE_DIR || path.join(process.cwd(), 'storage'));
  }

  private extFromName(name: string, mime: string): string {
    const fromName = path.extname(name || '').replace('.', '').toLowerCase();
    if (fromName) return fromName;
    const map: Record<string, string> = {
      'application/pdf': 'pdf', 'image/png': 'png', 'image/jpeg': 'jpg',
      'application/msword': 'doc',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'docx',
    };
    return map[mime] || 'bin';
  }

  /** Content hash — used as the dedupe key for files. */
  hash(buffer: Buffer): string {
    return createHash('sha256').update(buffer).digest('hex');
  }

  /** Persist bytes; returns the storage key to save on the item. */
  async save(buffer: Buffer, fileName: string, mime: string): Promise<{ key: string; size: number }> {
    const ext = this.extFromName(fileName, mime);
    const key = `${randomUUID()}.${ext}`;
    const abs = path.join(this.root, key);
    await fs.mkdir(this.root, { recursive: true });
    await fs.writeFile(abs, buffer);
    return { key, size: buffer.length };
  }

  /** Read bytes back for download. Guards against path traversal. */
  async read(key: string): Promise<Buffer> {
    const abs = path.join(this.root, key);
    if (!abs.startsWith(this.root)) throw new Error('Invalid storage key');
    return fs.readFile(abs);
  }

  async remove(key: string): Promise<void> {
    try {
      const abs = path.join(this.root, key);
      if (abs.startsWith(this.root)) await fs.unlink(abs);
    } catch (e: any) {
      this.logger.warn(`remove ${key}: ${e.message}`);
    }
  }
}
