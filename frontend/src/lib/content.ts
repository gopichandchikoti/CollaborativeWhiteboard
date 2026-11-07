import { z } from 'zod';
import bundled from '../../public/collaborative-whiteboard.model.json';
import { ApiError } from './api';

export type ContentKey = keyof typeof bundled.locales.en;
const modelSchema = z.object({
  schemaVersion: z.literal(1),
  defaultLocale: z.string(),
  locales: z.record(z.string(), z.record(z.string(), z.string().min(1))),
});
export function validateModel(input: unknown) {
  const model = modelSchema.parse(input);
  const defaults = model.locales[model.defaultLocale];
  if (!defaults) throw new Error('Missing default locale');
  const expected = Object.keys(bundled.locales.en).sort();
  for (const values of Object.values(model.locales)) {
    if (JSON.stringify(Object.keys(values).sort()) !== JSON.stringify(expected))
      throw new Error('Content key mismatch');
    for (const key of expected) {
      const tokens = (text: string) =>
        [...text.matchAll(/\{(\w+)\}/g)]
          .map((match) => match[1])
          .sort()
          .join();
      if (tokens(values[key]) !== tokens(defaults[key])) throw new Error('Placeholder mismatch');
    }
  }
  return model;
}
let model = validateModel(bundled);
let locale = model.defaultLocale;
export function setLocale(value: string) {
  locale = model.locales[value] ? value : model.defaultLocale;
  document.documentElement.lang = locale;
  document.documentElement.dir = /^(ar|he|fa|ur)(-|$)/.test(locale) ? 'rtl' : 'ltr';
}
export async function loadContent() {
  try {
    const response = await fetch(`${import.meta.env.BASE_URL}collaborative-whiteboard.model.json`, {
      signal: AbortSignal.timeout(5000),
    });
    if (!response.ok) throw new Error('Content unavailable');
    model = validateModel(await response.json());
    setLocale(localStorage.getItem('whiteboard.locale') ?? navigator.language.split('-')[0]);
    return true;
  } catch {
    setLocale(model.defaultLocale);
    return false;
  }
}
export function t(key: ContentKey, values: Record<string, string | number> = {}) {
  const value = model.locales[locale]?.[key] ?? model.locales[model.defaultLocale][key] ?? bundled.locales.en[key];
  return value.replace(/\{(\w+)\}/g, (_, name: string) => String(values[name] ?? ''));
}
export function errorText(error: unknown) {
  const key = error instanceof ApiError ? `error.${error.code}` : 'error.generic';
  return key in bundled.locales.en ? t(key as ContentKey) : t('error.generic');
}
export function dateText(value: string) {
  return new Intl.DateTimeFormat(locale, { dateStyle: 'medium' }).format(new Date(value));
}
