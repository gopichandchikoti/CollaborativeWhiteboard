import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import helmet from 'helmet';
import { json, Request, Response, NextFunction } from 'express';
import { Server } from 'node:http';
import { AppModule } from './app.module';
import { CollaborationGateway } from './collaboration/collaboration.gateway';
import { Errors, origins, security } from './security';

export async function createApplication() {
  const app = await NestFactory.create(AppModule, {
    bodyParser: false,
    logger: ['error', 'warn'],
  });
  app.use(helmet());
  app.use(security);
  const standardBody = json({ limit: '16kb', inflate: false });
  const imageBody = json({ limit: '6mb', inflate: false });
  app.use((request: Request, response: Response, next: NextFunction) => {
    const upload = request.method === 'POST' && /^\/boards\/[^/]+\/assets\/?$/.test(request.path);
    return (upload ? imageBody : standardBody)(request, response, next);
  });
  app.enableCors({ origin: [...origins], credentials: true });
  app.useGlobalFilters(new Errors());
  app.enableShutdownHooks();
  const server: Server = app.getHttpServer();
  server.requestTimeout = 15000;
  server.headersTimeout = 10000;
  server.keepAliveTimeout = 5000;
  server.maxHeadersCount = 100;
  server.maxConnections = 512;
  app.get(CollaborationGateway).attach(app.getHttpServer());
  return app;
}

async function bootstrap() {
  const port = Number(process.env.PORT ?? 5604);
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error('PORT must be an integer between 1 and 65535');
  }

  const app = await createApplication();
  try {
    await app.listen(port, '127.0.0.1');
  } catch (error) {
    await app.close();
    throw error;
  }
  console.log(JSON.stringify({ event: 'listening', port, service: 'whiteboard' }));
}

if (require.main === module) {
  bootstrap().catch(() => {
    console.error(JSON.stringify({ event: 'startupFailed' }));
    process.exitCode = 1;
  });
}
