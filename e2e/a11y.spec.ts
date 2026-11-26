import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

const pages = ["/", "/lab", "/scenarios", "/history", "/settings", "/experiments/new"];

for (const url of pages) {
  test(`no serious or critical accessibility violations on ${url}`, async ({ page }) => {
    await page.goto(url);
    await page.waitForLoadState("networkidle");
    const res = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa"]).analyze();
    const bad = res.violations.filter((v) => v.impact === "serious" || v.impact === "critical");
    expect(bad.map((v) => `${v.id}: ${v.nodes.slice(0, 3).map((n) => n.target.join(" ")).join(" | ")}`)).toEqual([]);
  });
}

test("no serious accessibility violations on a finished run and results page", async ({ page }) => {
  await page.goto("/lab");
  await page.getByTestId("run-demo").click();
  await page.getByTestId("ctl-skip").click();
  await page.getByTestId("view-results").waitFor();
  let res = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa"]).analyze();
  expect(res.violations.filter((v) => ["serious", "critical"].includes(v.impact ?? "")).map((v) => `${v.id}: ${v.nodes[0].target.join(" ")}`)).toEqual([]);
  await page.getByTestId("view-results").click();
  await page.getByTestId("results").waitFor();
  res = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa"]).analyze();
  expect(res.violations.filter((v) => ["serious", "critical"].includes(v.impact ?? "")).map((v) => `${v.id}: ${v.nodes[0].target.join(" ")}`)).toEqual([]);
});

test("screen-reader text: no ticking clock in the live region, stable node names, charts described", async ({ page }) => {
  await page.goto("/lab");
  await page.getByTestId("run-demo").click();
  await expect(page.getByTestId("run-state")).toHaveAttribute("data-state", "running");
  // the clock updates many times a second; inside a live region every tick would be announced
  expect(await page.locator("[aria-live] [data-testid=clock]").count()).toBe(0);
  // a focused pipeline node keeps its name while its queue depth changes
  const node = page.getByTestId("node-ingestion");
  const name1 = await node.getAttribute("aria-label");
  await page.waitForTimeout(1500);
  expect(await node.getAttribute("aria-label")).toBe(name1);
  expect(name1).not.toMatch(/\d/);
  await page.getByTestId("ctl-skip").click();
  await page.getByTestId("view-results").click();
  await page.getByTestId("results").waitFor();
  await expect(page.getByText(/Queue depth (peaked at|No events were queued)/).first()).toBeAttached();
  await expect(page.getByText(/^Ingestion API: (healthy throughout|.*for \d+s)/).first()).toBeAttached();
});
