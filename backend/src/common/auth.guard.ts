import {
  CanActivate, ExecutionContext, ForbiddenException, Inject, Injectable, UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Pool } from 'pg';
import { ROLES_KEY } from './roles.decorator';
import { getSupabaseAdmin } from '../infra/supabase';
import { PG } from '../infra/infra.module';
import { one } from '../infra/pg.provider';

// AUTH_DEV_BYPASS=true  -> no Supabase needed. The request's role comes from the `x-dev-role`
//   header (default 'admin'); every route is otherwise open. docker-compose sets this for local
//   runs. NEVER set it in a deployed environment.
const DEV_BYPASS = (process.env.AUTH_DEV_BYPASS ?? 'false').toLowerCase() === 'true';
const DEV_USER_ID = '00000000-0000-0000-0000-000000000000';

// PROFILES_SOURCE (only used when DEV_BYPASS is off):
//   'local'    (default) — role + ward_scope live in the local Postgres `profiles` table; the
//              guard self-provisions a row on first sign-in and makes the FIRST user 'admin'.
//   'supabase' — read them from the Supabase-hosted `profiles` table.
const PROFILES_SOURCE = (process.env.PROFILES_SOURCE ?? 'local').toLowerCase();

const ROLES = ['admin', 'official', 'analyst', 'citizen'];

@Injectable()
export class AuthGuard implements CanActivate {
  constructor(private reflector: Reflector, @Inject(PG) private pg: Pool) {}

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>('isPublic', [ctx.getHandler(), ctx.getClass()]);
    if (isPublic) return true;

    const req = ctx.switchToHttp().getRequest();

    let role: string;
    let wardScope: string[];
    let userId: string;
    let email: string | undefined;

    if (DEV_BYPASS) {
      const hdr = String(req.headers['x-dev-role'] ?? 'admin').toLowerCase();
      role = ROLES.includes(hdr) ? hdr : 'admin';
      wardScope = [];
      userId = DEV_USER_ID;
      email = 'dev@local';
    } else {
      const token = req.headers.authorization?.replace('Bearer ', '');
      if (!token) throw new UnauthorizedException('missing bearer token');
      try {
        const { data, error } = await getSupabaseAdmin().auth.getUser(token);
        if (error || !data.user) throw new UnauthorizedException('invalid token');
        userId = data.user.id;
        email = data.user.email;
      } catch (e: any) {
        throw new UnauthorizedException(e?.message ?? 'invalid token');
      }
      ({ role, wardScope } =
        PROFILES_SOURCE === 'supabase'
          ? await this.roleFromSupabase(userId)
          : await this.roleFromLocal(userId, email));
    }

    req.user = { id: userId, email, role, wardScope };

    const roles = this.reflector.getAllAndOverride<string[]>(ROLES_KEY, [ctx.getHandler(), ctx.getClass()]);
    if (roles?.length && !roles.includes(role))
      throw new ForbiddenException(`requires role: ${roles.join('|')}`);
    return true;
  }

  private async roleFromSupabase(userId: string) {
    const { data: profile } = await getSupabaseAdmin()
      .from('profiles').select('role, ward_scope').eq('id', userId).single();
    return { role: profile?.role ?? 'citizen', wardScope: profile?.ward_scope ?? [] };
  }

  private async roleFromLocal(userId: string, email?: string) {
    await this.pg.query(
      `INSERT INTO auth.users (id, email) VALUES ($1, $2) ON CONFLICT (id) DO NOTHING`,
      [userId, email ?? null],
    );
    const hasAdmin = await one(this.pg, `SELECT 1 FROM profiles WHERE role = 'admin' LIMIT 1`);
    const defaultRole = hasAdmin ? 'citizen' : 'admin';
    const row = await one<{ role: string; ward_scope: string[] }>(this.pg, `
      INSERT INTO profiles (id, email, role)
      VALUES ($1, $2, $3)
      ON CONFLICT (id) DO UPDATE SET email = EXCLUDED.email
      RETURNING role, ward_scope`, [userId, email ?? null, defaultRole]);
    return { role: row?.role ?? 'citizen', wardScope: row?.ward_scope ?? [] };
  }
}
