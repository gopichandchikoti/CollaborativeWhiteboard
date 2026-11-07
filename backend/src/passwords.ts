import { HttpException } from '@nestjs/common';
import { randomBytes, scrypt, timingSafeEqual } from 'node:crypto';

const settings = { N: 32768, r: 8, p: 3, maxmem: 64 * 1024 * 1024 };
let active = 0;

/** Admission precedes libuv work: rate limits alone do not bound queued KDF memory/CPU. */
export async function hashPassword(password: string, salt = randomBytes(16).toString('hex')) {
  if (active >= 2) throw new HttpException('rateLimited', 429);
  active++;
  try {
    const key = await new Promise<Buffer>((resolve, reject) => {
      scrypt(password, salt, 64, settings, (error, value) => (error ? reject(error) : resolve(value)));
    });
    return `${salt}:${key.toString('hex')}`;
  } finally {
    active--;
  }
}

export async function verifyPassword(password: string, stored: string) {
  const [salt, expected] = stored.split(':');
  const actual = (await hashPassword(password, salt)).split(':')[1];
  return timingSafeEqual(Buffer.from(actual, 'hex'), Buffer.from(expected, 'hex'));
}
