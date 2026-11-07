import { IncomingHttpHeaders } from 'node:http';

export const origins = new Set(['http://localhost:5603', 'http://127.0.0.1:5603']);

/** Validate the serialized authority rather than trusting DNS or forwarded headers. */
export function localRequestAllowed(headers: IncomingHttpHeaders) {
  const host = headers.host ?? '';
  const match = /^(localhost|127\.0\.0\.1)(?::([1-9]\d{0,4}))?$/.exec(host);
  if (!match || (match[2] && Number(match[2]) > 65535)) return false;
  if (headers['sec-fetch-site'] === 'cross-site') return false;
  return headers.origin === undefined || origins.has(headers.origin);
}
