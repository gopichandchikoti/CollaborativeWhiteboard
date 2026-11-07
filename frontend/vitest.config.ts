import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'jsdom',
    include: ['tests/**/*.test.{ts,tsx}'],
    exclude: ['tests/performance.test.ts'],
    environmentOptions: { jsdom: { url: 'http://localhost:5603' } },
    restoreMocks: true,
    maxWorkers: 4,
    coverage: {
      provider: 'v8',
      include: ['src/**/*.{ts,tsx}'],
      reporter: ['text', 'html', 'json-summary'],
      thresholds: {
        lines: 90,
        branches: 90,
        functions: 90,
        statements: 90,
        'src/lib/collaboration.ts': { lines: 95, branches: 95, functions: 95, statements: 95 },
      },
    },
  },
});
