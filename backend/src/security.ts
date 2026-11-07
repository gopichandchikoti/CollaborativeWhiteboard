import { ArgumentsHost, Catch, ExceptionFilter, HttpException } from '@nestjs/common';
import { NextFunction, Request, Response } from 'express';
import { randomUUID } from 'node:crypto';
import { localRequestAllowed, origins } from './request-policy';

export { origins } from './request-policy';
const buckets = new Map<string, { count: number; expires: number }>();
export function security(request: Request, response: Response, next: NextFunction) {
  const requestId = randomUUID();
  response.setHeader('X-Request-Id', requestId);
  response.setHeader('Cache-Control', 'no-store');
  if (!localRequestAllowed(request.headers) || invalidOrigin(request)) {
    response.status(403).json({ code: 'invalidOrigin', requestId });
    return;
  }
  if (!admit(request)) {
    response.setHeader('Retry-After', '60');
    response.status(429).json({ code: 'rateLimited', requestId });
    return;
  }
  next();
}
function admit(request: Request) {
  const sensitive = request.path.startsWith('/auth');
  const key = `${request.ip}:${sensitive ? 'auth' : 'api'}`;
  const now = Date.now();
  if (buckets.size >= 10000)
    buckets.forEach((value, id) => {
      if (value.expires < now) buckets.delete(id);
    });
  if (!buckets.has(key) && buckets.size >= 10000) return false;
  const bucket = buckets.get(key) ?? { count: 0, expires: now + 60000 };
  if (bucket.expires < now) {
    bucket.count = 0;
    bucket.expires = now + 60000;
  }
  buckets.set(key, bucket);
  return ++bucket.count <= (sensitive ? 30 : 600);
}
function invalidOrigin(request: Request) {
  const mutation = !['GET', 'HEAD', 'OPTIONS'].includes(request.method);
  return mutation && (!origins.has(request.headers.origin ?? '') || request.headers['x-whiteboard-request'] !== '1');
}

@Catch()
export class Errors implements ExceptionFilter {
  catch(error: unknown, host: ArgumentsHost) {
    const response = host.switchToHttp().getResponse<Response>();
    const { status, code } = publicError(error);
    const requestId = response.getHeader('X-Request-Id');
    if (status >= 500) console.error(JSON.stringify({ event: 'requestFailed', status, requestId }));
    response.status(status).json({ code, requestId });
  }
}

function publicError(error: unknown) {
  if (error instanceof HttpException) return httpError(error);
  // Body-parser failures occur before controllers; never return their body, stack or internal message.
  const type = error && typeof error === 'object' && 'type' in error ? error.type : undefined;
  const parsed = typeof type === 'string' ? parserErrors.get(type) : undefined;
  if (parsed) return parsed;
  if (error instanceof SyntaxError) return { status: 400, code: 'invalidInput' };
  return { status: 500, code: 'serverError' };
}

function httpError(error: HttpException) {
  const status = error.getStatus();
  const fallback = status === 413 ? 'limitReached' : 'invalidInput';
  const code = status >= 500 ? 'serverError' : knownCodes.has(error.message) ? error.message : fallback;
  return { status, code };
}

const knownCodes = new Set([
  'invalidAccount',
  'accountExists',
  'invalidCredentials',
  'signInRequired',
  'notFound',
  'readOnly',
  'invalidInput',
  'limitReached',
  'inviteExpired',
  'alreadyOwner',
  'invalidImage',
  'invalidAsset',
  'invalidUpdate',
  'rateLimited',
]);
const parserErrors = new Map([
  ['entity.too.large', { status: 413, code: 'limitReached' }],
  ['encoding.unsupported', { status: 415, code: 'invalidInput' }],
  ['charset.unsupported', { status: 415, code: 'invalidInput' }],
  ['request.aborted', { status: 400, code: 'invalidInput' }],
  ['request.size.invalid', { status: 400, code: 'invalidInput' }],
]);
