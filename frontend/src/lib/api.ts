import { z } from 'zod';

export class ApiError extends Error {
  constructor(
    readonly code: string,
    readonly status: number,
  ) {
    super(code);
  }
}
export async function api<T>(path: string, schema: z.ZodType<T>, method = 'GET', body?: unknown): Promise<T> {
  const response = await fetch(`/api/${path}`, {
    method,
    credentials: 'same-origin',
    headers: { 'Content-Type': 'application/json', 'X-Whiteboard-Request': '1' },
    body: body === undefined ? undefined : JSON.stringify(body),
    signal: AbortSignal.timeout(15000),
  });
  const data: unknown = await response.json();
  if (!response.ok) {
    const error = z.object({ code: z.string() }).safeParse(data);
    throw new ApiError(error.success ? error.data.code : 'serverError', response.status);
  }
  return schema.parse(data);
}
export const okSchema = z.object({ ok: z.boolean() });
