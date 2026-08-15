import { createParamDecorator, ExecutionContext } from '@nestjs/common';

export interface AuthUser { id: number; uuid: string; email: string; }

export const CurrentUser = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): AuthUser => ctx.switchToHttp().getRequest().user,
);
