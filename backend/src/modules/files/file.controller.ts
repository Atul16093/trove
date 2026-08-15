import { Controller, Get, Param, Post, Res, UploadedFile, UseGuards, UseInterceptors, Body, BadRequestException } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import type { Response } from 'express';
import { ItemService } from '../items/item.service';
import { JwtGuard } from '../auth/jwt.guard';
import { CurrentUser, AuthUser } from '../../common/auth-user.decorator';
import { ResponseCode, ResponseService } from '../../common/response';
import { ItemMessages } from '../../enums/messages.enum';

const MAX_BYTES = 25 * 1024 * 1024; // 25MB dev cap

@Controller('files')
@UseGuards(JwtGuard)
export class FileController {
  constructor(private readonly items: ItemService, private readonly response: ResponseService) {}

  /** Upload a file (dashboard "Add file", and later the mobile share target). */
  @Post()
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: MAX_BYTES } }))
  async upload(@CurrentUser() u: AuthUser, @UploadedFile() file: any, @Body('caption') caption?: string) {
    if (!file) throw new BadRequestException('No file provided');
    return this.items.ingestFile(u.id, {
      buffer: file.buffer, fileName: file.originalname, mime: file.mimetype,
      caption, captureSource: 'web',
    });
  }

  /** Stream a stored file back (auth via Bearer; frontend fetches as a blob). */
  @Get(':uuid')
  async download(@CurrentUser() u: AuthUser, @Param('uuid') uuid: string, @Res() res: Response) {
    const f = await this.items.fileBytes(u.id, uuid);
    if (!f) { res.status(ResponseCode.NOT_FOUND).json(this.response.error(ResponseCode.NOT_FOUND, ItemMessages.NOT_FOUND)); return; }
    res.setHeader('Content-Type', f.mime);
    res.setHeader('Content-Disposition', `inline; filename="${encodeURIComponent(f.name)}"`);
    res.send(f.buffer);
  }
}
