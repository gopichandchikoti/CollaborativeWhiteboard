import { Body, Controller, Delete, Get, Inject, Param, Post, Req } from '@nestjs/common';
import { Request } from 'express';
import { Auth } from './auth';
import { SharingService } from './sharing.service';
import { CollaborationGateway } from './collaboration/collaboration.gateway';

@Controller()
export class SharingController {
  constructor(
    @Inject(Auth) private readonly auth: Auth,
    @Inject(SharingService) private readonly sharing: SharingService,
    @Inject(CollaborationGateway) private readonly gateway: CollaborationGateway,
  ) {}
  @Get('boards/:id/members') members(@Req() request: Request, @Param('id') id: string) {
    return this.sharing.members(this.auth.user(request).id, id);
  }
  @Post('boards/:id/invites') invite(@Req() request: Request, @Param('id') id: string, @Body() body: unknown) {
    return this.sharing.invite(this.auth.user(request).id, id, body);
  }
  @Post('invites/accept') accept(@Req() request: Request, @Body() body: unknown) {
    return this.sharing.accept(this.auth.user(request).id, body);
  }
  @Post('boards/:id/members/:userId') role(
    @Req() request: Request,
    @Param('id') id: string,
    @Param('userId') userId: string,
    @Body() body: unknown,
  ) {
    const result = this.sharing.role(this.auth.user(request).id, id, userId, body);
    this.gateway.closeBoard(id);
    return result;
  }
  @Delete('boards/:id/members/:userId') revoke(
    @Req() request: Request,
    @Param('id') id: string,
    @Param('userId') userId: string,
  ) {
    const result = this.sharing.revoke(this.auth.user(request).id, id, userId);
    this.gateway.revalidate();
    return result;
  }
}
