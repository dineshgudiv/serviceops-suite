import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './tests/smoke',
  timeout: 30_000,
  fullyParallel: false,
  retries: 0,
  reporter: [['list'], ['html', { outputFolder: 'playwright-report-smoke', open: 'never' }]],
  use: {
    baseURL: process.env.SMOKE_BASE_URL ?? 'http://127.0.0.1:8080',
    trace: 'retain-on-failure',
  },
});
