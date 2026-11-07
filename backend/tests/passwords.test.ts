import { expect, it, vi } from 'vitest';
import type { scrypt as Scrypt } from 'node:crypto';
import { hashPassword, verifyPassword } from '../src/passwords';
import { accountSchema, registrationSchema } from '../src/contracts';

vi.mock('node:crypto', async (original) => {
  const actual = await original<typeof import('node:crypto')>();
  return {
    ...actual,
    scrypt: (
      password: string,
      salt: string,
      length: number,
      options: object,
      callback: Parameters<typeof Scrypt>[4],
    ) => {
      if (password === 'synthetic-provider-failure') callback(new Error('provider failed'), Buffer.alloc(0));
      else actual.scrypt(password, salt, length, options, callback);
    },
  };
});

it('bounds expensive in-flight password work without an unbounded queue and releases capacity', async () => {
  const first = hashPassword('Synthetic-long-password');
  const second = hashPassword('Synthetic-long-password');
  await expect(hashPassword('Synthetic-long-password')).rejects.toMatchObject({ status: 429 });
  const [hash] = await Promise.all([first, second]);
  expect(await verifyPassword('Synthetic-long-password', hash)).toBe(true);
  expect(await verifyPassword('Wrong-synthetic-password', hash)).toBe(false);
});

it('releases admission slots after a crypto provider failure', async () => {
  await expect(hashPassword('synthetic-provider-failure')).rejects.toThrow('provider failed');
  const values = await Promise.all([hashPassword('Synthetic-password-a'), hashPassword('Synthetic-password-b')]);
  expect(values).toHaveLength(2);
});

it('requires 15 Unicode code points for enrollment while preserving legacy login validation', () => {
  const account = { name: 'Synthetic', email: 'fixture@example.test', password: 'x'.repeat(12) };
  expect(accountSchema.safeParse(account).success).toBe(true);
  expect(registrationSchema.safeParse(account).success).toBe(false);
  expect(registrationSchema.safeParse({ ...account, password: '😀'.repeat(8) }).success).toBe(false);
  expect(registrationSchema.safeParse({ ...account, password: '😀'.repeat(15) }).success).toBe(true);
});
