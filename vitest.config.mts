import { defineConfig } from 'vitest/config';
import path from 'path';

export default defineConfig({
  test: {
    environment: 'jsdom',
    root: '.',
    include: [
      'src/**/__tests__/**/*.test.ts',
      'src/**/__tests__/**/*.spec.ts',
      'src/**/*.test.ts',
      'src/**/*.spec.ts',
    ],
    exclude: [
      'node_modules',
      'src/__tests__/setup.ts',
    ],
    alias: {
      '@': path.resolve(__dirname, 'src'),
      'obsidian': path.resolve(__dirname, 'src/__mocks__/obsidian.ts'),
    },
    setupFiles: ['src/__tests__/setup.ts'],
    coverage: {
      provider: 'v8',
      include: [
        'src/**/*.ts',
      ],
      exclude: [
        'src/**/*.test.ts',
        'src/**/*.spec.ts',
        'src/__mocks__/**',
        'src/main.ts',
        'src/**/index.ts',
        'src/ui/**',
        'src/settings/SettingsTab.ts',
      ],
      thresholds: {
        branches: 80,
        functions: 80,
        lines: 80,
        statements: 80,
      },
    },
  },
});
