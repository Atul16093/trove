import 'reflect-metadata';
import * as dotenv from 'dotenv';
dotenv.config();
import { NestFactory } from '@nestjs/core';
import { Logger } from '@nestjs/common';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule, { logger: ['log', 'warn', 'error'] });
  app.setGlobalPrefix('api');
  const configuredOrigins = (process.env.CORS_ORIGIN || 'http://localhost:3000').split(',').map((o) => o.trim());
  app.enableCors({
    origin: (origin, cb) => {
      if (!origin || configuredOrigins.includes(origin)) return cb(null, true);
      if (/^http:\/\/(localhost|127\.0\.0\.1|10\.\d+\.\d+\.\d+|192\.168\.\d+\.\d+|172\.(1[6-9]|2\d|3[0-1])\.\d+\.\d+)(:\d+)?$/.test(origin)) {
        return cb(null, true);
      }
      return cb(new Error(`CORS blocked: ${origin}`), false);
    },
    credentials: true,
  });
  const port = Number(process.env.PORT || 4000);
  await app.listen(port, '0.0.0.0');
  new Logger('Bootstrap').log(`Trove API listening on http://0.0.0.0:${port}/api`);
}
bootstrap();
