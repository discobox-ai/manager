import { defineConfig } from 'playwright/test'

// Browsers: npx playwright install chromium-headless-shell
export default defineConfig({
  projects: [{ name: 'chromium', use: { browserName: 'chromium' } }],
  use: {
    navigationTimeout: 5_000,
    actionTimeout: 5_000,
  },
})
