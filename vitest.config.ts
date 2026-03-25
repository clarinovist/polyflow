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
    }
  },
});
