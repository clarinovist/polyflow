import { defineConfig } from 'vitest/config';
import tsconfigPaths from 'vite-tsconfig-paths';
import path from 'path';

export default defineConfig({
  plugins: [tsconfigPaths()],
  resolve: {
    alias: {
      'next/server': path.resolve(__dirname, './__mocks__/next-server.ts'),
    }
  },
  test: {
    environment: 'node',
    globals: true,
    setupFiles: ['./vitest.setup.ts'],
    include: ['src/**/*.test.ts', 'src/**/*.spec.ts'],
    server: {
      deps: {
        inline: ['next', 'next-auth', '@auth/core']
      }
    },
    coverage: {
      provider: 'v8',
      // Coverage is measured over the files the test suite actually exercises
      // (the v8 default). We intentionally do NOT set a broad `include` glob:
      // pulling every untested UI/action file into the denominator collapses the
      // ratio to ~17% and turns the threshold into noise instead of a guard.
      // Scope grows organically as new units get their own tests.
      exclude: [
        'src/**/*.test.ts',
        'src/**/*.spec.ts',
        'src/**/__tests__/**',
        'src/**/*.d.ts',
        'src/lib/schemas/**',
        'src/generated/**',
      ],
      // Ratchet guard: current baseline (2026-07-18) over the tested surface is
      // Stmts 72% / Branch 64% / Funcs 77% / Lines 73%. Thresholds sit just
      // below baseline so CI fails on regression while we ratchet up toward the
      // 80% policy target. When coverage climbs, raise these — never lower them.
      // Policy target: 80% across all metrics.
      thresholds: {
        statements: 70,
        branches: 62,
        functions: 74,
        lines: 71,
      },
    },
  },
});
