import { expect, test } from "@playwright/test";

const cfg = (name: string) => ({
  name,
  scenarioId: "healthy-baseline",
  seed: 3,
  eventCount: 20,
  intervalSec: 1,
  durationSec: 40,
  mode: "resilient",
  faults: [],
  drainCapacityPerSec: 5,
  patientCount: 2,
  staleThresholdSec: 10,
  interventions: [],
});

test("guided steps advance with the run", async ({ page }) => {
  await page.goto("/lab");
  const steps = page.getByTestId("guide-steps");
  await expect(steps).toContainText("Failure starts");
  await expect(steps.locator('[data-state="done"]')).toHaveCount(0);
  await page.getByTestId("run-demo").click();
  await page.getByTestId("ctl-skip").click();
  await expect(steps.locator('[data-state="done"]')).toHaveCount(4);
});

test("share link: copy button copies a link that opens the same results for someone else", async ({ page, browser, context, baseURL }) => {
  await context.grantPermissions(["clipboard-read", "clipboard-write"]);
  await page.goto("/lab?scenario=duplicate-events");
  await page.getByTestId("run-demo").click();
  await page.getByTestId("ctl-skip").click();
  await page.getByTestId("view-results").click();
  await page.getByTestId("copy-link").click();
  await expect(page.getByTestId("copy-link")).toContainText("Link copied");
  const link = await page.evaluate(() => navigator.clipboard.readText());
  expect(link).toMatch(/\/experiments\/exp_/);

  // a different browser (no cookie) can open it
  const other = await browser.newContext({ baseURL });
  const p2 = await other.newPage();
  await p2.goto(link.replace(/^https?:\/\/[^/]+/, ""));
  await expect(p2.getByTestId("results")).toBeVisible();
  await expect(p2.getByTestId("verdict")).toContainText("passed");
  // but it is not in their history, and they cannot delete it
  await p2.goto("/history");
  await expect(p2.getByTestId("history-table")).toHaveCount(0);
  const id = link.split("/").pop()!;
  const del = await p2.request.delete(`/api/experiments/${id}`);
  expect(del.status()).toBe(404);
  const put = await p2.request.put(`/api/experiments/${id}`, { data: { config: cfg("hijack"), status: "completed" } });
  expect(put.status()).toBe(403);
  await other.close();
  // the owner still sees it
  await page.goto("/history");
  await expect(page.getByTestId("history-table")).toContainText("Duplicate events");
});

test("health, Open Graph image and metadata are served", async ({ request, page }) => {
  const h = await request.get("/api/health");
  expect(h.ok()).toBeTruthy();
  expect((await h.json()).ok).toBe(true);
  const og = await request.get("/opengraph-image");
  expect(og.status()).toBe(200);
  expect(og.headers()["content-type"]).toContain("image/png");
  await page.goto("/");
  await expect(page.locator('meta[property="og:title"]')).toHaveAttribute("content", /CareChaos/);
  await expect(page.locator('meta[property="og:image"]')).toHaveCount(1);
  await expect(page.locator('link[rel="icon"]').first()).toHaveAttribute("href", /icon/);
});

test("the footer credits the author and links to GitHub", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("link", { name: "Fariha Batool" })).toHaveAttribute("href", /linkedin\.com\/in\/fariha-batool/);
  await expect(page.getByRole("link", { name: /Source code/ })).toHaveAttribute("href", "https://github.com/batool-fariha/carechaos");
  await expect(page.getByRole("link", { name: /^GitHub/ }).first()).toHaveAttribute("href", "https://github.com/batool-fariha/carechaos");
});

test("rapid writes are rate limited with a clear message", async ({ request }) => {
  const headers = { "x-forwarded-for": "203.0.113.77" };
  let limited = null;
  for (let i = 0; i < 40 && !limited; i++) {
    const res = await request.post("/api/experiments", { headers, data: { config: cfg(`rl ${i}`), status: "created" } });
    if (res.status() === 429) limited = res;
  }
  expect(limited).not.toBeNull();
  expect((await limited!.json()).error).toMatch(/Too many requests/);
  expect(limited!.headers()["retry-after"]).toBeTruthy();
});
