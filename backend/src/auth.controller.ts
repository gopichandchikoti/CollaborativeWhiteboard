import { Body, Controller, Get, Inject, Post, Req, Res } from '@nestjs/common';
import { Request, Response } from 'express';
import { Auth } from './auth';
import { CollaborationGateway } from './collaboration/collaboration.gateway';

@Controller('auth')
export class AuthController {
  constructor(
    @Inject(Auth) private readonly auth: Auth,
    @Inject(CollaborationGateway) private readonly gateway: CollaborationGateway,
  ) {}
  @Get('me') me(@Req() request: Request) {
    return this.auth.user(request);
  }
  @Post('register') async register(@Body() body: unknown, @Res({ passthrough: true }) response: Response) {
    const result = await this.auth.register(body);
    this.cookie(response, result.token);
    return result.user;
  }
  @Post('login') async login(@Body() body: unknown, @Res({ passthrough: true }) response: Response) {
    const result = await this.auth.login(body);
    this.gateway.revalidate();
    this.cookie(response, result.token);
    return result.user;
  }
  @Post('logout') logout(@Req() request: Request, @Res({ passthrough: true }) response: Response) {
    this.auth.logout(request);
    this.gateway.revalidate();
    response.clearCookie('whiteboard_session', {
      path: '/',
      sameSite: 'strict',
      httpOnly: true,
    });
    return { ok: true };
  }
  private cookie(response: Response, token: string) {
    response.cookie('whiteboard_session', token, {
      httpOnly: true,
      sameSite: 'strict',
      secure: process.env.NODE_ENV === 'production',
      maxAge: 86400000,
      path: '/',
    });
  }
}
