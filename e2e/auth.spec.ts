import { createServer, type Server } from "node:http";
import { expect, test } from "@playwright/test";

let fake: Server;
test.beforeAll(async () => {
  fake = createServer((req, res) => {
    const url = new URL(req.url ?? "/", "http://127.0.0.1:3199");
    if (url.pathname === "/login/oauth/authorize") {
      const back = new URL(url.searchParams.get("redirect_uri")!);
      back.searchParams.set("code", "fake-code");
      back.searchParams.set("state", url.searchParams.get("state")!);
      res.writeHead(302, { Location: back.toString() }).end();
    } else if (url.pathname === "/login/oauth/access_token" && req.method === "POST") {
      let body = "";
      req.on("data", (c) => (body += c));
      req.on("end", () => {
        const b = JSON.parse(body);
        const ok = b.client_id === "test-id" && b.client_secret === "test-secret" && b.code === "fake-code";
        res.writeHead(200, { "Content-Type": "application/json" }).end(JSON.stringify(ok ? { access_token: "fake-token" } : { error: "bad_verification_code" }));
      });
    } else if (url.pathname === "/user") {
      const ok = req.headers.authorization === "Bearer fake-token";
      res.writeHead(ok ? 200 : 401, { "Content-Type": "application/json" }).end(JSON.stringify(ok ? { id: 4242, login: "octo-tester" } : { message: "Bad credentials" }));
    } else res.writeHead(404).end();
  });
  await new Promise<void>((r) => fake.listen(3199, "127.0.0.1", r));
});
test.afterAll(async () => {
  await new Promise<void>((r) => fake.close(() => r()));
});

const cfg = (name: string) => ({ name, scenarioId: "healthy-baseline", seed: 5, eventCount: 10, intervalSec: 1, durationSec: 30, mode: "resilient", faults: [], drainCapacityPerSec: 5, patientCount: 2, staleThresholdSec: 10, interventions: [] });

test("signing in with GitHub claims this browser's history and follows you to another device", async ({ page, browser, baseURL }) => {
  // run something anonymously
  const created = await page.request.post("/api/experiments", { data: { config: cfg("E2E before sign-in"), status: "completed" } });
  expect(created.status()).toBe(201);

  await page.goto("/history");
  await expect(page.getByTestId("signin-hint")).toBeVisible();
  await page.getByTestId("sign-in").click();
  await page.waitForURL(/\/history/);
  await expect(page.getByTestId("auth-user")).toContainText("@octo-tester");
  await expect(page.getByTestId("history-table")).toContainText("E2E before sign-in");
  await expect(page.getByTestId("signin-hint")).toHaveCount(0);

  // a second device (fresh browser) signs in as the same account and sees the same history
  const other = await browser.newContext({ baseURL });
  const p2 = await other.newPage();
  await p2.goto("/history");
  await expect(p2.getByTestId("history-table")).toHaveCount(0);
  await p2.getByTestId("sign-in").click();
  await p2.waitForURL(/\/history/);
  await expect(p2.getByTestId("history-table")).toContainText("E2E before sign-in");
  await other.close();

  // signing out returns to an anonymous identity with no history
  await page.getByTestId("sign-out").click();
  await expect(page.getByTestId("sign-in")).toBeVisible();
  await page.goto("/history");
  await expect(page.getByTestId("history-table")).toHaveCount(0);
});

test("forged or tampered sessions and bad OAuth state are rejected", async ({ page, context, baseURL }) => {
  await context.addCookies([{ name: "cc_session", value: "eyJ1aWQiOiJnaDoxIiwibG9naW4iOiJldmlsIiwiZXhwIjo5OTk5OTk5OTk5OTk5fQ.invalidsignature", url: baseURL! }]);
  const me = await (await page.request.get("/api/auth/me")).json();
  expect(me.enabled).toBe(true);
  expect(me.user).toBeNull();

  const res = await page.request.get("/api/auth/github/callback?code=x&state=nope", { maxRedirects: 0 });
  expect(res.status()).toBe(307);
  expect(res.headers()["location"]).toContain("auth_error=state");
  await page.goto("/history?auth_error=state");
  await expect(page.getByRole("alert").first()).toContainText("did not complete");
});
