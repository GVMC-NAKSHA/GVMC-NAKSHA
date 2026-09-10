import { Body, Controller, Get, Post, Req, UnauthorizedException } from '@nestjs/common';
import { supabaseAdmin } from '../infra/supabase';
import { Public } from '../common/roles.decorator';
import { LoginDto } from './dto';

@Controller('auth')
export class AuthController {
  @Public()
  @Post('login')
  async login(@Body() dto: LoginDto) {
    const { data, error } = await supabaseAdmin.auth.signInWithPassword({ email: dto.email, password: dto.password });
    if (error) throw new UnauthorizedException(error.message);
    return { access_token: data.session!.access_token, refresh_token: data.session!.refresh_token,
             user: { id: data.user!.id, email: data.user!.email } };
  }

  @Public()
  @Post('refresh')
  async refresh(@Body('refresh_token') rt: string) {
    const { data, error } = await supabaseAdmin.auth.refreshSession({ refresh_token: rt });
    if (error) throw new UnauthorizedException(error.message);
    return { access_token: data.session!.access_token, refresh_token: data.session!.refresh_token };
  }

  @Get('me')
  me(@Req() req: any) { return req.user; }
}
