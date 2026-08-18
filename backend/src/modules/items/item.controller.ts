import { Body, Controller, Delete, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';
import { ItemService } from './item.service';
import { JwtGuard } from '../auth/jwt.guard';
import { CurrentUser, AuthUser } from '../../common/auth-user.decorator';
import { Modules } from '../../enums/endpoints.enum';
import { CreateItemSchema, CreateItemDto, UpdateItemSchema, UpdateItemDto } from '../../models/dtos/item.dto';

@Controller(Modules.ITEMS)
@UseGuards(JwtGuard)
export class ItemController {
  constructor(private readonly items: ItemService) {}

  @Post()
  create(@CurrentUser() u: AuthUser, @Body(new ZodValidationPipe(CreateItemSchema)) dto: CreateItemDto) {
    return this.items.ingest(u.id, dto);
  }

  @Get()
  list(@CurrentUser() u: AuthUser, @Query('category') category?: string, @Query('search') search?: string) {
    return this.items.list(u.id, category, search);
  }

  /** Declared before the ':uuid' routes so the literal path wins. */
  @Post('reprocess')
  reprocess(@CurrentUser() u: AuthUser) {
    return this.items.reprocess(u.id);
  }

  @Get(':uuid')
  detail(@CurrentUser() u: AuthUser, @Param('uuid') uuid: string) {
    return this.items.detail(u.id, uuid);
  }

  @Patch(':uuid')
  update(@CurrentUser() u: AuthUser, @Param('uuid') uuid: string, @Body(new ZodValidationPipe(UpdateItemSchema)) dto: UpdateItemDto) {
    return this.items.update(u.id, uuid, dto);
  }

  @Delete(':uuid')
  remove(@CurrentUser() u: AuthUser, @Param('uuid') uuid: string) {
    return this.items.remove(u.id, uuid);
  }

  /** Re-runs enrichment for a single item; awaits it so the response has the new summary. */
  @Post(':uuid/regenerate')
  regenerate(@CurrentUser() u: AuthUser, @Param('uuid') uuid: string) {
    return this.items.regenerate(u.id, uuid);
  }

  @Post(':uuid/open')
  open(@CurrentUser() u: AuthUser, @Param('uuid') uuid: string) {
    return this.items.open(u.id, uuid);
  }
}
