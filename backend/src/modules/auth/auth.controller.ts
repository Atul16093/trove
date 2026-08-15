import { Body, Controller, Get, Post, UseGuards } from '@nestjs/common';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';
import { AuthService } from './auth.service';
import { JwtGuard } from './jwt.guard';
import { CurrentUser, AuthUser } from '../../common/auth-user.decorator';
import { Modules, AuthEndpoints } from '../../enums/endpoints.enum';
import { RegisterSchema, RegisterDto, LoginSchema, LoginDto, GoogleSchema, GoogleDto } from '../../models/dtos/auth.dto';
import { ResponseCode, ResponseService } from '../../common/response';
import { AuthMessages } from '../../enums/messages.enum';
import { UserQuery } from '../../models/queries/user.query';

@Controller(Modules.AUTH)
export class AuthController {
  constructor(
    private readonly auth: AuthService,
    private readonly users: UserQuery,
    private readonly response: ResponseService,
  ) {}

  @Post(AuthEndpoints.REGISTER)
  register(@Body(new ZodValidationPipe(RegisterSchema)) dto: RegisterDto) {
    return this.auth.register(dto);
  }

  @Post(AuthEndpoints.LOGIN)
  login(@Body(new ZodValidationPipe(LoginSchema)) dto: LoginDto) {
    return this.auth.login(dto);
  }

  @Post(AuthEndpoints.GOOGLE)
  google(@Body(new ZodValidationPipe(GoogleSchema)) dto: GoogleDto) {
    return this.auth.google(dto);
  }

  @Get(AuthEndpoints.ME)
  @UseGuards(JwtGuard)
  async me(@CurrentUser() u: AuthUser) {
    const user = await this.users.findByUuid(u.uuid);
    if (!user) return this.response.error(ResponseCode.UNAUTHORIZED, AuthMessages.UNAUTHORIZED);
    return this.response.success(ResponseCode.SUCCESS, 'OK', {
      uuid: user.uuid, email: user.email, displayName: user.display_name, avatarUrl: user.avatar_url,
    });
  }
}
