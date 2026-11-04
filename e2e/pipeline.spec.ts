import { expect, test } from "@playwright/test";
import { readFileSync } from "node:fs";

test("describe your own pipeline, schedule several faults, and see them on a timeline", async ({ page }) => {
  await page.goto("/experiments/new?scenario=game-day");
  await expect(page.getByTestId("fault-timeline").first()).toBeVisible();
  await expect(page.getByTestId("fault-4")).toBeVisible();
  await page.getByTestId("pipeline-disclosure").locator("summary").click();
  await page.locator("#cap-processor").fill("12");
  await page.locator("#cap-delivery").fill("5");
  await page.locator("#queue-cap").fill("300");
  await page.locator("#name").fill("E2E my pipeline game day");
  await page.getByTestId("create-experiment").click();
  await page.waitForURL(/\/experiments\/exp_/);
  await page.getByTestId("run-demo").click();
  await page.getByTestId("ctl-skip").click();
  await page.getByTestId("view-results").click();
  await expect(page.getByTestId("results")).toContainText("Custom pipeline profile applied");
  await expect(page.getByTestId("fault-timeline")).toBeVisible();
  await expect(page.getByTestId("verdict")).toBeVisible();
});

test("import an experiment file, then export it back out", async ({ page }) => {
  await page.goto("/experiments/new");
  await page.getByTestId("import-file").setInputFiles("examples/carechaos.json");
  await expect(page.getByTestId("import-msg")).toContainText("Loaded");
  await expect(page.locator("#name")).toHaveValue("Alerts survive a delivery outage on my pipeline");
  await expect(page.locator("#cap-processor")).toHaveValue("15");
  const [dl] = await Promise.all([page.waitForEvent("download"), page.getByTestId("export-config").click()]);
  const out = JSON.parse(readFileSync((await dl.path())!, "utf8"));
  expect(out.pipeline.capacities.processor).toBe(15);
  expect(out.faults[0].type).toBe("outage");
  expect(out).not.toHaveProperty("interventions");
});

test("a bad import file explains what is wrong", async ({ page }) => {
  await page.goto("/experiments/new");
  await page.getByTestId("import-file").setInputFiles({ name: "bad.json", mimeType: "application/json", buffer: Buffer.from(JSON.stringify({ scenario: "nope" })) });
  await expect(page.getByTestId("import-msg")).toContainText('unknown scenario "nope"');
  await page.getByTestId("import-file").setInputFiles({ name: "bad2.json", mimeType: "application/json", buffer: Buffer.from("{oops") });
  await expect(page.getByTestId("import-msg")).toContainText("not valid JSON");
});

test("game day runs in the lab and passes in resilient mode", async ({ page }) => {
  await page.goto("/lab?scenario=game-day");
  await page.getByTestId("run-demo").click();
  await page.getByTestId("ctl-skip").click();
  await expect(page.getByTestId("run-state")).toHaveAttribute("data-state", "completed");
  await expect(page.getByTestId("saved-banner")).toBeVisible();
  await page.getByTestId("view-results").click();
  await expect(page.getByTestId("verdict")).toContainText("passed");
});
