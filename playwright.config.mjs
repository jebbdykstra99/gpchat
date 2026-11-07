import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './test',
  timeout: 60000,
  expect: { timeout: 15000 },
  fullyParallel: false,
  workers: 1,
  reporter: [['list']],
  use: {
    baseURL: 'http://127.0.0.1:8765',
    trace: 'off'
  },
  webServer: {
    command: 'python3 -m http.server 8765',
    url: 'http://127.0.0.1:8765/',
    reuseExistingServer: true,
    timeout: 20000,
    stdout: 'ignore',
    stderr: 'ignore'
  },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
    { name: 'firefox', use: { ...devices['Desktop Firefox'] } },
    { name: 'webkit-iphone', use: { ...devices['iPhone 13'] } }
  ]
});
