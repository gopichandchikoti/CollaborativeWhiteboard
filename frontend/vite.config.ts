import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { createHash } from 'node:crypto';
import model from './public/collaborative-whiteboard.model.json' with { type: 'json' };

const headers = {
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'DENY',
  'Referrer-Policy': 'no-referrer',
  'Permissions-Policy': 'camera=(), microphone=(), geolocation=()',
};

function contentPolicy(html: string) {
  const hashes = [...html.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/gi)]
    .filter((match) => match[1].trim())
    .map((match) => `'sha256-${createHash('sha256').update(match[1]).digest('base64')}'`);
  return [
    "default-src 'none'",
    `script-src 'self' ${hashes.join(' ')}`,
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob:",
    "font-src 'self'",
    "connect-src 'self' ws://localhost:5603 ws://127.0.0.1:5603",
    "base-uri 'none'",
    "object-src 'none'",
    "form-action 'self'",
  ].join('; ');
}

export default defineConfig({
  plugins: [
    react(),
    {
      name: 'whiteboard-content-metadata',
      transformIndexHtml: {
        order: 'post',
        handler(html) {
          const titled = html.replace('<title></title>', `<title>${model.locales.en['app.name']}</title>`);
          const meta = `<meta http-equiv="Content-Security-Policy" content="${contentPolicy(titled)}">`;
          return titled.replace('<head>', `<head>${meta}`);
        },
      },
    },
  ],
  server: {
    headers,
    host: '127.0.0.1',
    port: 5603,
    strictPort: true,
    proxy: {
      '/api': {
        target: 'http://127.0.0.1:5604',
        rewrite: (path) => path.replace(/^\/api/, ''),
      },
      '/collaboration': {
        target: 'ws://127.0.0.1:5604',
        ws: true,
      },
    },
  },
  preview: { host: '127.0.0.1', port: 5603, strictPort: true, headers },
});
