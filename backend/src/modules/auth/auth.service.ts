import { Injectable } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { OAuth2Client } from 'google-auth-library';
import * as bcrypt from 'bcryptjs';
import { UserQuery, UserRow } from '../../models/queries/user.query';
import { CategoryQuery } from '../../models/queries/category.query';
import { ResponseCode, ResponseService } from '../../common/response';
import { AuthMessages } from '../../enums/messages.enum';
import { RegisterDto, LoginDto, GoogleDto } from '../../models/dtos/auth.dto';

@Injectable()
export class AuthService {
  private readonly googleClient = new OAuth2Client(process.env.GOOGLE_CLIENT_ID);

  constructor(
    private readonly users: UserQuery,
    private readonly categories: CategoryQuery,
    private readonly jwt: JwtService,
    private readonly response: ResponseService,
  ) {}

  private sign(user: UserRow): string {
    return this.jwt.sign({ sub: user.id, uuid: user.uuid, email: user.email });
  }

  private publicUser(user: UserRow) {
    return { uuid: user.uuid, email: user.email, displayName: user.display_name, avatarUrl: user.avatar_url };
  }

  async register(dto: RegisterDto) {
    const existing = await this.users.findByEmail(dto.email);
    if (existing) return this.response.error(ResponseCode.CONFLICT, AuthMessages.EMAIL_TAKEN);

    const password_hash = await bcrypt.hash(dto.password, 10);
    const user = await this.users.create({ email: dto.email, password_hash, display_name: dto.displayName || null });
    await this.categories.provisionDefaults(user.id);

    return this.response.success(ResponseCode.CREATED, AuthMessages.REGISTERED, {
      token: this.sign(user), user: this.publicUser(user),
    });
  }

  async login(dto: LoginDto) {
    const user = await this.users.findByEmail(dto.email);
    if (!user || !user.password_hash) return this.response.error(ResponseCode.UNAUTHORIZED, AuthMessages.INVALID_CREDENTIALS);
    const ok = await bcrypt.compare(dto.password, user.password_hash);
    if (!ok) return this.response.error(ResponseCode.UNAUTHORIZED, AuthMessages.INVALID_CREDENTIALS);
    await this.users.touchLogin(user.id);
    return this.response.success(ResponseCode.SUCCESS, AuthMessages.LOGGED_IN, {
      token: this.sign(user), user: this.publicUser(user),
    });
  }

  async google(dto: GoogleDto) {
    let payload;
    try {
      const ticket = await this.googleClient.verifyIdToken({ idToken: dto.idToken, audience: process.env.GOOGLE_CLIENT_ID });
      payload = ticket.getPayload();
    } catch {
      return this.response.error(ResponseCode.UNAUTHORIZED, AuthMessages.GOOGLE_FAILED);
    }
    if (!payload?.email || !payload.sub) return this.response.error(ResponseCode.UNAUTHORIZED, AuthMessages.GOOGLE_FAILED);

    let user = await this.users.findByGoogleId(payload.sub);
    if (!user) {
      user = await this.users.findByEmail(payload.email);
      if (!user) {
        user = await this.users.create({
          email: payload.email, google_id: payload.sub, display_name: payload.name || null,
          avatar_url: payload.picture || null, email_verified: true,
        });
        await this.categories.provisionDefaults(user.id);
      }
    }
    await this.users.touchLogin(user.id);
    return this.response.success(ResponseCode.SUCCESS, AuthMessages.LOGGED_IN, {
      token: this.sign(user), user: this.publicUser(user),
    });
  }
}
