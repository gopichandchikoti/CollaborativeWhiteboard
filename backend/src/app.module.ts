import { Module } from '@nestjs/common';
import { CollaborationGateway } from './collaboration/collaboration.gateway';
import { HealthController } from './health.controller';
import { Storage } from './storage';
import { Auth } from './auth';
import { Boards } from './boards';
import { AuthController } from './auth.controller';
import { BoardsController } from './boards.controller';
import { SharingController } from './sharing.controller';
import { ContentController } from './content.controller';
import { ContentService } from './content.service';
import { SharingService } from './sharing.service';

@Module({
  imports: [],
  controllers: [HealthController, AuthController, BoardsController, SharingController, ContentController],
  providers: [Storage, Auth, Boards, CollaborationGateway, ContentService, SharingService],
})
export class AppModule {}
