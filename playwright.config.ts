import { defineConfig, devices } from "@playwright/test";

const PORT = 3100;

export default defineConfig({
  testDir: "./e2e",
  timeout: 60_000,
  expect: { timeout: 15_000 },
  fullyParallel: false,
  workers: 1,
  reporter: [["list"]],
  use: { baseURL: `http://localhost:${PORT}`, trace: "retain-on-failure" },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: {
    command: `sh -c "rm -f data/e2e.db* && npm run build && npm run start -- -p ${PORT}"`,
    url: `http://localhost:${PORT}`,
    timeout: 240_000,
    reuseExistingServer: !process.env.CI,
    env: {
      CARECHAOS_DB_PATH: "./data/e2e.db",
      // A fake GitHub (started by e2e/auth.spec.ts on :3199) so the real OAuth code path is exercised without real credentials.
      GITHUB_CLIENT_ID: "test-id",
      GITHUB_CLIENT_SECRET: "test-secret",
      SESSION_SECRET: "e2e-session-secret-e2e-session-secret-0123456789",
      GITHUB_OAUTH_BASE: "http://127.0.0.1:3199",
      GITHUB_API_BASE: "http://127.0.0.1:3199",
    },
  },
});
