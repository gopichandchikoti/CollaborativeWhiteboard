import { afterEach, expect, it, vi } from 'vitest';
import model from '../public/collaborative-whiteboard.model.json';
import { dateText, errorText, loadContent, setLocale, t, validateModel } from '../src/lib/content';
import { api, ApiError } from '../src/lib/api';
import { z } from 'zod';
afterEach(() => {
  vi.unstubAllGlobals();
  localStorage.clear();
  setLocale('en');
});
it('validates schema, locale keys and placeholder parity, and falls back without raw content keys', () => {
  expect(() => validateModel({})).toThrow();
  expect(() => validateModel({ ...model, defaultLocale: 'missing' })).toThrow();
  expect(() => validateModel({ ...model, locales: { en: { one: 'x' } } })).toThrow();
  const missingPlaceholder = { ...model.locales.en, 'share.revoke': 'No placeholder' };
  expect(() => validateModel({ ...model, locales: { ...model.locales, es: missingPlaceholder } })).toThrow();
  setLocale('unknown');
  expect(t('app.name')).toBe('Collaborative Whiteboard');
  expect(t('library.updated', { date: 'Today' })).toContain('Today');
  expect(t('library.updated')).not.toContain('{date}');
  expect(dateText('2026-11-07T12:00:00Z')).toContain('2026');
  expect(errorText(new ApiError('readOnly', 403))).toContain('role');
  expect(errorText(new ApiError('unknown', 500))).toBe(t('error.generic'));
  expect(errorText(new Error('private trace'))).toBe(t('error.generic'));
});
it('loads validated external content, supports RTL and uses the bundled fallback on failure', async () => {
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => new Response(JSON.stringify({ ...model, locales: { ...model.locales, ar: model.locales.en } }))),
  );
  localStorage.setItem('whiteboard.locale', 'ar');
  expect(await loadContent()).toBe(true);
  expect(document.documentElement.dir).toBe('rtl');
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => new Response('', { status: 500 })),
  );
  expect(await loadContent()).toBe(false);
  expect(document.documentElement.dir).toBe('ltr');
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => {
      throw new Error('offline');
    }),
  );
  expect(await loadContent()).toBe(false);
});
it('validates success responses and exposes deliberate sanitized API errors', async () => {
  const fetcher = vi.fn(
    async (_input: RequestInfo | URL, _init?: RequestInit) => new Response(JSON.stringify({ ok: true })),
  );
  vi.stubGlobal('fetch', fetcher);
  expect(await api('fixture', z.object({ ok: z.boolean() }))).toEqual({ ok: true });
  await api('fixture', z.object({ ok: z.boolean() }), 'POST', { title: 'Test' });
  expect(fetcher.mock.calls[0]?.[0]).toBe('/api/fixture');
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => new Response(JSON.stringify({ code: 'readOnly' }), { status: 403 })),
  );
  await expect(api('fixture', z.unknown())).rejects.toMatchObject({ code: 'readOnly', status: 403 });
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => new Response('{}', { status: 500 })),
  );
  await expect(api('fixture', z.unknown())).rejects.toMatchObject({ code: 'serverError' });
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => new Response('{"ok": "invalid"}')),
  );
  await expect(api('fixture', z.object({ ok: z.boolean() }))).rejects.toThrow();
});
