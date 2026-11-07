import { ArgumentsHost, BadRequestException, HttpException } from '@nestjs/common';
import { Request, Response } from 'express';
import { expect, it, vi } from 'vitest';
import { Errors, security } from '../src/security';

function response() {
  const result = {
    setHeader: vi.fn(),
    getHeader: vi.fn(() => 'synthetic-id'),
    status: vi.fn(),
    json: vi.fn(),
  };
  result.status.mockReturnValue(result);
  return result;
}
function request(ip: string, path = '/boards', method = 'GET', headers = {}) {
  return { ip, path, method, headers: { host: '127.0.0.1:5604', ...headers } } as Request;
}
it('limits authentication and general traffic and renews expired windows', () => {
  vi.useFakeTimers();
  const res = response();
  const next = vi.fn();
  for (let count = 0; count < 31; count++)
    security(request('auth-burst', '/auth/login'), res as unknown as Response, next);
  expect(res.status).toHaveBeenCalledWith(429);
  expect(next).toHaveBeenCalledTimes(30);
  next.mockClear();
  for (let count = 0; count < 601; count++) security(request('general-burst'), res as unknown as Response, next);
  expect(next).toHaveBeenCalledTimes(600);
  vi.advanceTimersByTime(61000);
  security(request('general-burst'), res as unknown as Response, next);
  expect(next).toHaveBeenCalledTimes(601);
  vi.useRealTimers();
});
it('checks origins and anti-CSRF headers while allowing safe HTTP methods', () => {
  const res = response();
  const next = vi.fn();
  security(request('csrf-test', '/boards', 'POST'), res as unknown as Response, next);
  expect(res.status).toHaveBeenCalledWith(403);
  security(
    request('csrf-test', '/boards', 'POST', {
      origin: 'http://localhost:5603',
      'x-whiteboard-request': '1',
    }),
    res as unknown as Response,
    next,
  );
  expect(next).toHaveBeenCalledTimes(1);
  security(request('csrf-test', '/boards', 'OPTIONS'), res as unknown as Response, next);
  expect(next).toHaveBeenCalledTimes(2);
});
it('bounds live client buckets and permits traffic again after expiration', () => {
  vi.useFakeTimers();
  const res = response();
  const next = vi.fn();
  for (let count = 0; count < 10002; count++) security(request(`bounded-${count}`), res as unknown as Response, next);
  expect(next.mock.calls.length).toBeLessThan(10002);
  expect(res.status).toHaveBeenCalledWith(429);
  const admitted = next.mock.calls.length;
  vi.advanceTimersByTime(61000);
  security(request('cleanup'), res as unknown as Response, next);
  vi.useRealTimers();
  expect(next).toHaveBeenCalledTimes(admitted + 1);
});
it('sanitizes unexpected exceptions and retains intentional error codes and correlation IDs', () => {
  const res = response();
  const log = vi.spyOn(console, 'error').mockImplementation(() => undefined);
  const host = {
    switchToHttp: () => ({ getResponse: () => res }),
  } as unknown as ArgumentsHost;
  const errors = new Errors();
  errors.catch(new Error('private database path'), host);
  expect(res.json).toHaveBeenCalledWith({
    code: 'serverError',
    requestId: 'synthetic-id',
  });
  expect(log).toHaveBeenCalledOnce();
  errors.catch(new BadRequestException('invalidInput'), host);
  expect(res.status).toHaveBeenLastCalledWith(400);
  errors.catch(new SyntaxError('malformed body'), host);
  expect(res.json).toHaveBeenLastCalledWith({ code: 'invalidInput', requestId: 'synthetic-id' });
  errors.catch(new HttpException('private-internal-message', 500), host);
  expect(res.json).toHaveBeenLastCalledWith({ code: 'serverError', requestId: 'synthetic-id' });
  for (const [type, status] of [
    ['entity.too.large', 413],
    ['encoding.unsupported', 415],
    ['charset.unsupported', 415],
    ['request.aborted', 400],
    ['request.size.invalid', 400],
  ] as const) {
    errors.catch(Object.assign(new Error('private parser details'), { type }), host);
    expect(res.status).toHaveBeenLastCalledWith(status);
  }
  errors.catch(null, host);
  expect(res.status).toHaveBeenLastCalledWith(500);
  log.mockRestore();
});
