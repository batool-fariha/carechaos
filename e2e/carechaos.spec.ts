import { expect, test, type Page } from "@playwright/test";
import { readFileSync } from "node:fs";

async function setSpeed(page: Page, label: string) {
  await page.getByLabel("Playback speed").selectOption({ label });
}

test("landing page explains the product and the demo button opens the lab running", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { level: 1 })).toContainText("See what breaks");
  await expect(page.getByRole("img", { name: /A reading flows from a device/ })).toBeVisible();
  await page.getByTestId("landing-demo").click();
  await page.waitForURL(/\/lab\?autostart=1/);
  await expect(page.getByTestId("run-state")).toHaveAttribute("data-state", /running|completed/);
  await expect(page.getByTestId("story-headline")).not.toHaveText("Ready to run");
});

test("the narrator describes an outage in plain language", async ({ page }) => {
  await page.goto("/lab");
  await page.getByLabel("Playback speed").selectOption({ label: "10×" });
  await page.getByTestId("run-demo").click();
  await expect(page.getByTestId("story-headline")).toHaveText("Delivery Service is down");
  await expect(page.getByTestId("narrator")).toContainText("retried");
  await expect(page.getByTestId("story-headline")).toHaveText(/is back|healthy|finished/);
});

test("lab opens with a preconfigured demo and empty states", async ({ page }) => {
  await page.goto("/lab");
  await expect(page.getByRole("heading", { name: "Reliability Lab" })).toBeVisible();
  await expect(page.getByTestId("run-demo")).toBeEnabled();
  await expect(page.getByTestId("run-state")).toHaveAttribute("data-state", "idle");
  await expect(page.getByTestId("story-headline")).toHaveText("Ready to run");
  await expect(page.getByTestId("m-generated")).toContainText("—");
  for (const id of ["device", "ingestion", "processor", "rules", "delivery", "dashboard"]) {
    await expect(page.getByTestId(`node-${id}`)).toHaveAttribute("data-health", "healthy");
  }
});

test("run demo: service state changes, recovery is observed, results are saved and exportable", async ({ page }) => {
  await page.goto("/lab");
  await setSpeed(page, "10×");
  await page.getByTestId("run-demo").click();
  await expect(page.getByTestId("run-state")).toHaveAttribute("data-state", "running");
  // delivery outage happens at t=60..120 virtual s => 6..12 s real at 10×
  await expect(page.getByTestId("node-delivery")).toHaveAttribute("data-health", "unavailable");
  await expect(page.getByTestId("outage-banner")).toBeVisible();
  await expect(page.getByTestId("node-delivery")).toHaveAttribute("data-health", /recovering|healthy/);
  await expect(page.getByTestId("node-delivery")).toHaveAttribute("data-health", "healthy");
  await page.getByTestId("ctl-skip").click();
  await expect(page.getByTestId("run-state")).toHaveAttribute("data-state", "completed");
  await expect(page.getByTestId("m-generated")).toContainText("200");
  await expect(page.getByTestId("saved-banner")).toBeVisible();
  await page.getByTestId("view-results").click();

  await expect(page.getByTestId("results")).toBeVisible();
  await expect(page.getByTestId("verdict")).toContainText("passed");
  await expect(page.getByTestId("assertion-list").locator('[data-status="passed"]').first()).toBeVisible();
  await expect(page.getByTestId("comparison")).toContainText("Healthy baseline");
  await expect(page.getByTestId("recovery-table")).toContainText("Delivery Service");

  const [jsonDl] = await Promise.all([page.waitForEvent("download"), page.getByTestId("export-json").click()]);
  const report = JSON.parse(readFileSync((await jsonDl.path())!, "utf8"));
  expect(report.schemaVersion).toBe("1.0");
  expect(report.scenario.id).toBe("alert-service-outage");
  expect(report.metrics.readingsGenerated).toBe(200);
  expect(report.assertions.length).toBeGreaterThan(5);
  const shown = await page.getByTestId("m-delivered").innerText();
  expect(shown).toContain(String(report.metrics.alertsDelivered));
  const [mdDl] = await Promise.all([page.waitForEvent("download"), page.getByTestId("export-md").click()]);
  const md = readFileSync((await mdDl.path())!, "utf8");
  expect(md).toContain("# CareChaos report");
  expect(md).toContain(report.experimentId);
});

test("inject a failure live, recover it manually, then stop and reset", async ({ page }) => {
  await page.goto("/lab");
  await page.getByTestId("scenario-select").selectOption({ label: "Healthy baseline" });
  await setSpeed(page, "10×");
  await page.getByTestId("run-demo").click();
  await expect(page.getByTestId("run-state")).toHaveAttribute("data-state", "running");
  await page.getByText("Inject a failure into the running experiment").click();
  await page.locator("#fault-type").selectOption("outage");
  await page.locator("#fault-target").selectOption("processor");
  await page.locator("input[type=checkbox]").first().check();
  await page.getByTestId("inject-fault").click();
  await expect(page.getByTestId("node-processor")).toHaveAttribute("data-health", "unavailable");
  await expect(page.getByTestId("outage-banner")).toBeVisible();
  await page.getByTestId("node-processor").click();
  await expect(page.getByTestId("service-details")).toContainText("Active faults");
  await page.getByTestId("recover-now").click();
  await expect(page.getByTestId("node-processor")).toHaveAttribute("data-health", /recovering|healthy/);
  await expect(page.getByTestId("node-processor")).toHaveAttribute("data-health", "healthy");

  await page.getByTestId("ctl-pause").click();
  await expect(page.getByTestId("run-state")).toHaveAttribute("data-state", "paused");
  const clockPaused = await page.getByTestId("clock").innerText();
  await page.waitForTimeout(600);
  expect(await page.getByTestId("clock").innerText()).toBe(clockPaused);
  await page.getByTestId("ctl-resume").click();
  await page.getByTestId("ctl-stop").click();
  await expect(page.getByTestId("run-state")).toHaveAttribute("data-state", "stopped");
  const stoppedClock = await page.getByTestId("clock").innerText();
  await page.waitForTimeout(500);
  expect(await page.getByTestId("clock").innerText()).toBe(stoppedClock);

  await page.getByTestId("ctl-reset").click();
  await expect(page.getByTestId("run-state")).toHaveAttribute("data-state", "idle");
  await expect(page.getByTestId("clock")).toContainText("t = 0.0s");
  await expect(page.getByTestId("m-generated")).toContainText("—");
});

test("faulty reference mode fails assertions that resilient mode passes", async ({ page }) => {
  await page.goto("/lab?scenario=duplicate-events&mode=faulty");
  await page.getByTestId("run-demo").click();
  await page.getByTestId("ctl-skip").click();
  await expect(page.getByTestId("run-state")).toHaveAttribute("data-state", "completed");
  await expect(page.getByText("Assertions failed").first()).toBeVisible();
  await page.getByTestId("view-results").click();
  await expect(page.getByTestId("verdict")).toContainText("failed");
  await expect(page.getByTestId("assertion-list").locator('[data-status="failed"]').first()).toBeVisible();
  await expect(page.getByTestId("failure-modes")).toContainText("Duplicate");
  await expect(page.getByTestId("comparison")).toContainText("resilient mode");
});

test("new experiment form validates, creates, runs and appears in history", async ({ page }) => {
  await page.goto("/experiments/new");
  await page.locator("#eventCount").fill("500");
  await page.locator("#durationSec").fill("100");
  await expect(page.getByTestId("form-errors")).toContainText("Increase the duration");
  await expect(page.getByTestId("create-experiment")).toBeDisabled();
  await page.locator("#durationSec").fill("300");
  await page.locator("#eventCount").fill("120");
  await page.locator("#name").fill("E2E packet loss");
  await page.locator("#scenario").selectOption({ label: "Missing data / packet loss" });
  await page.locator("#name").fill("E2E packet loss");
  await page.getByTestId("create-experiment").click();
  await page.waitForURL(/\/experiments\/exp_/);
  await page.getByTestId("run-demo").click();
  await page.getByTestId("ctl-skip").click();
  await page.getByTestId("view-results").click();
  await expect(page.getByTestId("results")).toContainText("E2E packet loss");
  await page.goto("/history");
  await expect(page.getByTestId("history-table")).toContainText("E2E packet loss");
  expect(await page.getByTestId("history-row").count()).toBeGreaterThanOrEqual(1);
});

test("scenario library lists all scenarios and navigation works", async ({ page }) => {
  await page.goto("/scenarios");
  await expect(page.locator('[data-testid^="scenario-"]')).toHaveCount(7);
  await page.getByRole("link", { name: "Open in lab" }).first().click();
  await expect(page.getByTestId("run-demo")).toBeVisible();
  await page.getByRole("link", { name: "About" }).click();
  await expect(page.getByRole("heading", { name: /About/ })).toBeVisible();
});

test("combine multiple faults in one experiment", async ({ page }) => {
  await page.goto("/experiments/new?scenario=duplicate-events");
  await expect(page.getByTestId("fault-0")).toBeVisible();
  await page.getByTestId("add-fault").click();
  await expect(page.getByTestId("fault-1")).toBeVisible();
  await page.locator("#fault-1-type").selectOption("outage");
  await page.locator("#fault-1-target").selectOption("delivery");
  await page.locator("#fault-1-start").fill("50");
  await page.locator("#fault-1-duration").fill("30");
  await page.locator("#name").fill("E2E combined faults");
  await page.getByTestId("create-experiment").click();
  await page.waitForURL(/\/experiments\/exp_/);
  await page.getByTestId("run-demo").click();
  await page.getByTestId("ctl-skip").click();
  await page.getByTestId("view-results").click();
  const results = page.getByTestId("results");
  await expect(results).toContainText("Duplicate delivery fault");
  await expect(results).toContainText("Outage fault");
  await expect(page.getByTestId("assertion-list")).toContainText("All injected duplicates are rejected");
  await expect(page.getByTestId("assertion-list")).toContainText("The service does no work while unavailable");
});
