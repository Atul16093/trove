import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';

import { DatabaseService } from './db/services/database.service';
import { ResponseService } from './common/response';

import { UserQuery } from './models/queries/user.query';
import { CategoryQuery } from './models/queries/category.query';
import { ItemQuery } from './models/queries/item.query';
import { TelegramQuery } from './models/queries/telegram.query';

import { AuthController } from './modules/auth/auth.controller';
import { AuthService } from './modules/auth/auth.service';
import { JwtGuard } from './modules/auth/jwt.guard';

import { CategoryController } from './modules/categories/category.controller';
import { CategoryService } from './modules/categories/category.service';

import { ItemController } from './modules/items/item.controller';
import { ItemService } from './modules/items/item.service';

import { EnrichmentService } from './modules/enrichment/enrichment.service';
import { StorageService } from './modules/storage/storage.service';
import { FileController } from './modules/files/file.controller';

import { TelegramController } from './modules/telegram/telegram.controller';
import { TelegramService } from './modules/telegram/telegram.service';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    JwtModule.register({
      global: true,
      secret: process.env.JWT_SECRET || 'dev-secret-change-me',
      signOptions: { expiresIn: process.env.JWT_EXPIRES_IN || '7d' },
    }),
  ],
  controllers: [AuthController, CategoryController, ItemController, TelegramController, FileController],
  providers: [
    DatabaseService, ResponseService,
    UserQuery, CategoryQuery, ItemQuery, TelegramQuery,
    AuthService, JwtGuard,
    CategoryService, ItemService, EnrichmentService, StorageService, TelegramService,
  ],
})
export class AppModule {}
