/** Regenerates README screenshots. Usage: BASE_URL=http://localhost:3000 npm run screenshots */
import { chromium } from "@playwright/test";
import { mkdirSync } from "node:fs";

const base = process.env.BASE_URL ?? "http://localhost:3000";
mkdirSync("docs/img", { recursive: true });
async function main() {
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1360, height: 900 }, deviceScaleFactor: 2 });
await page.goto(base);
await page.getByLabel("Playback speed").selectOption({ label: "10×" });
await page.getByTestId("run-demo").click();
await page.getByTestId("node-delivery").and(page.locator('[data-health="unavailable"]')).waitFor();
await page.waitForTimeout(2500);
await page.screenshot({ path: "docs/img/dashboard.png" });
await page.getByTestId("ctl-skip").click();
await page.getByTestId("view-results").click();
await page.getByTestId("results").waitFor();
await page.waitForTimeout(800);
await page.screenshot({ path: "docs/img/results.png", fullPage: false });
await page.getByTestId("assertion-list").scrollIntoViewIfNeeded();
await page.screenshot({ path: "docs/img/assertions.png" });
await browser.close();
console.log("wrote docs/img/{dashboard,results,assertions}.png");
}
main().catch((e) => {
  console.error(e);
  process.exit(1);
});
