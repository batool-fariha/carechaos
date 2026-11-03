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
