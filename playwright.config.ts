import { defineConfig, devices } from '@playwright/test'

const port = Number(process.env.TAF_E2E_PORT ?? 4173)
const localUrl = `http://127.0.0.1:${port}`
const deployedUrl = process.env.TAF_E2E_BASE_URL

export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  reporter: 'list',
  timeout: 45_000,
  use: { baseURL: deployedUrl ? new URL(deployedUrl).origin : localUrl, trace: 'retain-on-failure' },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: deployedUrl ? undefined : {
    command: `npm run preview -- --host 127.0.0.1 --port ${port} --strictPort`,
    url: localUrl,
    reuseExistingServer: !process.env.CI,
  },
})
