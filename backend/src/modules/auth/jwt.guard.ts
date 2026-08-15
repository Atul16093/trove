import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';

@Injectable()
export class JwtGuard implements CanActivate {
  constructor(private readonly jwt: JwtService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest();
    const header: string = req.headers['authorization'] || '';
    const token = header.startsWith('Bearer ') ? header.slice(7) : null;
    if (!token) throw new UnauthorizedException('Not signed in');
    try {
      const payload = await this.jwt.verifyAsync(token);
      req.user = { id: payload.sub, uuid: payload.uuid, email: payload.email };
      return true;
    } catch {
      throw new UnauthorizedException('Session expired');
    }
  }
}
