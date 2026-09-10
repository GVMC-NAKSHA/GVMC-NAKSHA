import { CanActivate, ExecutionContext, ForbiddenException, Injectable, UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ROLES_KEY } from './roles.decorator';
import { supabaseAdmin } from '../infra/supabase';

@Injectable()
export class AuthGuard implements CanActivate {
  constructor(private reflector: Reflector) {}

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>('isPublic', [ctx.getHandler(), ctx.getClass()]);
    if (isPublic) return true;

    const req = ctx.switchToHttp().getRequest();
    const token = req.headers.authorization?.replace('Bearer ', '');
    if (!token) throw new UnauthorizedException('missing bearer token');

    const { data, error } = await supabaseAdmin.auth.getUser(token);
    if (error || !data.user) throw new UnauthorizedException('invalid token');

    const { data: profile } = await supabaseAdmin
      .from('profiles').select('role, ward_scope').eq('id', data.user.id).single();
    req.user = { id: data.user.id, email: data.user.email, role: profile?.role ?? 'citizen',
                 wardScope: profile?.ward_scope ?? [] };

    const roles = this.reflector.getAllAndOverride<string[]>(ROLES_KEY, [ctx.getHandler(), ctx.getClass()]);
    if (roles?.length && !roles.includes(req.user.role)) throw new ForbiddenException(`requires role: ${roles.join('|')}`);
    return true;
  }
}
