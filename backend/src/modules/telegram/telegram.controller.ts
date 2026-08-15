import { Controller, Get, Post, UseGuards } from '@nestjs/common';
import { TelegramService } from './telegram.service';
import { JwtGuard } from '../auth/jwt.guard';
import { CurrentUser, AuthUser } from '../../common/auth-user.decorator';
import { Modules, TelegramEndpoints } from '../../enums/endpoints.enum';
import { ResponseCode, ResponseService } from '../../common/response';
import { TelegramMessages } from '../../enums/messages.enum';

@Controller(Modules.TELEGRAM)
@UseGuards(JwtGuard)
export class TelegramController {
  constructor(private readonly telegram: TelegramService, private readonly response: ResponseService) {}

  @Post(TelegramEndpoints.CONNECT)
  async connect(@CurrentUser() u: AuthUser) {
    const data = await this.telegram.createConnectToken(u.id);
    return this.response.success(ResponseCode.CREATED, TelegramMessages.TOKEN_CREATED, data);
  }

  @Get(TelegramEndpoints.STATUS)
  async status(@CurrentUser() u: AuthUser) {
    const data = await this.telegram.status(u.id);
    return this.response.success(ResponseCode.SUCCESS, TelegramMessages.STATUS_OK, data);
  }
}
