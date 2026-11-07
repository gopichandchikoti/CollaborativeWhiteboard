import { Body, Controller, Delete, Get, Inject, Param, Patch, Post, Req } from '@nestjs/common';
import { Request } from 'express';
import { z } from 'zod';
import { Auth } from './auth';
import { Boards } from './boards';
import { idSchema, titleSchema } from './contracts';
import { CollaborationGateway } from './collaboration/collaboration.gateway';
import { parse } from './validation';

@Controller()
export class BoardsController {
  constructor(
    @Inject(Auth) private readonly auth: Auth,
    @Inject(Boards) private readonly boards: Boards,
    @Inject(CollaborationGateway)
    private readonly gateway: CollaborationGateway,
  ) {}
  @Get('workspaces') workspaces(@Req() request: Request) {
    return this.boards.workspaces(this.auth.user(request).id);
  }
  @Post('workspaces') workspace(@Req() request: Request, @Body() body: unknown) {
    const { title } = parse(z.object({ title: titleSchema }), body);
    return this.boards.createWorkspace(this.auth.user(request).id, title);
  }
  @Patch('workspaces/:id') renameWorkspace(@Req() request: Request, @Param('id') id: string, @Body() body: unknown) {
    const { title } = parse(z.object({ title: titleSchema }), body);
    return this.boards.renameWorkspace(id, this.auth.user(request).id, title);
  }
  @Delete('workspaces/:id') deleteWorkspace(@Req() request: Request, @Param('id') id: string) {
    const result = this.boards.deleteWorkspace(id, this.auth.user(request).id);
    this.gateway.revalidate();
    return result;
  }
  @Get('boards') list(@Req() request: Request) {
    return this.boards.list(this.auth.user(request).id);
  }
  @Post('boards') create(@Req() request: Request, @Body() body: unknown) {
    const user = this.auth.user(request);
    const data = parse(z.object({ title: titleSchema, workspaceId: idSchema }), body);
    return this.boards.create(user.id, data.workspaceId, data.title);
  }
  @Get('boards/:id') get(@Req() request: Request, @Param('id') id: string) {
    return this.boards.require(id, this.auth.user(request).id);
  }
  @Patch('boards/:id') rename(@Req() request: Request, @Param('id') id: string, @Body() body: unknown) {
    const { title } = parse(z.object({ title: titleSchema }), body);
    return this.boards.rename(id, this.auth.user(request).id, title);
  }
  @Delete('boards/:id') remove(@Req() request: Request, @Param('id') id: string) {
    const result = this.boards.remove(id, this.auth.user(request).id);
    this.gateway.revalidate();
    return result;
  }
}
