import { Body, Controller, Delete, Get, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';
import { CategoryService } from './category.service';
import { JwtGuard } from '../auth/jwt.guard';
import { CurrentUser, AuthUser } from '../../common/auth-user.decorator';
import { Modules } from '../../enums/endpoints.enum';
import {
  CreateCategorySchema, CreateCategoryDto,
  UpdateCategorySchema, UpdateCategoryDto,
  ReorderCategoriesSchema, ReorderCategoriesDto,
} from '../../models/dtos/category.dto';

@Controller(Modules.CATEGORIES)
@UseGuards(JwtGuard)
export class CategoryController {
  constructor(private readonly categories: CategoryService) {}

  @Get()
  list(@CurrentUser() u: AuthUser) { return this.categories.list(u.id); }

  @Post()
  create(@CurrentUser() u: AuthUser, @Body(new ZodValidationPipe(CreateCategorySchema)) dto: CreateCategoryDto) {
    return this.categories.create(u.id, dto);
  }

  /** Declared before the ':uuid' routes so the literal path wins. */
  @Patch('reorder')
  reorder(@CurrentUser() u: AuthUser, @Body(new ZodValidationPipe(ReorderCategoriesSchema)) dto: ReorderCategoriesDto) {
    return this.categories.reorder(u.id, dto);
  }

  @Patch(':uuid')
  update(
    @CurrentUser() u: AuthUser,
    @Param('uuid') uuid: string,
    @Body(new ZodValidationPipe(UpdateCategorySchema)) dto: UpdateCategoryDto,
  ) {
    return this.categories.update(u.id, uuid, dto);
  }

  @Delete(':uuid')
  remove(@CurrentUser() u: AuthUser, @Param('uuid') uuid: string) {
    return this.categories.remove(u.id, uuid);
  }
}
