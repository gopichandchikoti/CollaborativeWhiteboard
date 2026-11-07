import { defineConfig } from 'vitest/config';
export default defineConfig({
  test: {
    include: ['tests/**/*.test.ts'],
    environment: 'node',
    testTimeout: 15000,
    hookTimeout: 30000,
    coverage: {
      provider: 'v8',
      include: ['src/**/*.ts'],
      reporter: ['text', 'json-summary', 'html'],
      thresholds: {
        lines: 90,
        branches: 90,
        functions: 90,
        statements: 90,
        'src/auth.ts': { lines: 95, branches: 95, functions: 95, statements: 95 },
        'src/passwords.ts': { lines: 95, branches: 95, functions: 95, statements: 95 },
        'src/request-policy.ts': { lines: 95, branches: 95, functions: 95, statements: 95 },
        'src/boards.ts': { lines: 95, branches: 95, functions: 95, statements: 95 },
        'src/sharing.service.ts': { lines: 95, branches: 95, functions: 95, statements: 95 },
        'src/collaboration/documents.ts': { lines: 95, branches: 95, functions: 95, statements: 95 },
      },
    },
  },
});
