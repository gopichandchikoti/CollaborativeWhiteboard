import { Body, Controller, Delete, Get, Inject, Param, Post, Req, Res } from '@nestjs/common';
import { Request, Response } from 'express';
import { Auth } from './auth';
import { ContentService } from './content.service';
import { CollaborationGateway } from './collaboration/collaboration.gateway';

@Controller('boards/:id')
export class ContentController {
  constructor(
    @Inject(Auth) private readonly auth: Auth,
    @Inject(ContentService) private readonly content: ContentService,
    @Inject(CollaborationGateway) private readonly gateway: CollaborationGateway,
  ) {}
  @Post('assets') upload(@Req() request: Request, @Param('id') id: string, @Body() body: unknown) {
    return this.content.upload(this.auth.user(request).id, id, body);
  }
  @Get('assets/:assetId') asset(
    @Req() request: Request,
    @Param('id') id: string,
    @Param('assetId') assetId: string,
    @Res() response: Response,
  ) {
    const bytes = this.content.asset(this.auth.user(request).id, id, assetId);
    response.setHeader('Content-Security-Policy', "default-src 'none'; sandbox");
    response.type('image/png').send(bytes);
  }
  @Get('comments') comments(@Req() request: Request, @Param('id') id: string) {
    return this.content.comments(this.auth.user(request).id, id);
  }
  @Post('comments') comment(@Req() request: Request, @Param('id') id: string, @Body() body: unknown) {
    return this.content.comment(this.auth.user(request).id, id, body);
  }
  @Delete('comments/:commentId') resolveComment(
    @Req() request: Request,
    @Param('id') id: string,
    @Param('commentId') commentId: string,
  ) {
    return this.content.resolveComment(this.auth.user(request).id, id, commentId);
  }
  @Get('history') history(@Req() request: Request, @Param('id') id: string) {
    return this.content.history(this.auth.user(request).id, id);
  }
  @Post('history') checkpoint(@Req() request: Request, @Param('id') id: string, @Body() body: unknown) {
    return this.content.checkpoint(this.auth.user(request).id, id, body);
  }
  @Post('history/:snapshotId/restore') restore(
    @Req() request: Request,
    @Param('id') id: string,
    @Param('snapshotId') snapshotId: string,
  ) {
    const result = this.content.restore(this.auth.user(request).id, id, snapshotId);
    this.gateway.closeBoard(id);
    return result;
  }
  @Post('compact') compact(@Req() request: Request, @Param('id') id: string) {
    const result = this.content.compact(this.auth.user(request).id, id);
    this.gateway.closeBoard(id);
    return result;
  }
  @Post('export') export(@Req() request: Request, @Param('id') id: string) {
    return this.content.export(this.auth.user(request).id, id);
  }
}
