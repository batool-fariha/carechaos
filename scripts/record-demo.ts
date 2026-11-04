/**
 * Records the demo as docs/media/demo.webm (video) and docs/media/demo.gif (README-friendly).
 * Usage: BASE_URL=http://localhost:3000 npm run record-demo   (an app must be running)
 */
import { chromium, type Page } from "@playwright/test";
import { GIFEncoder, applyPalette, quantize } from "gifenc";
import { copyFileSync, mkdirSync, writeFileSync } from "node:fs";
import { PNG } from "pngjs";

const base = process.env.BASE_URL ?? "http://localhost:3000";
const W = 1280;
const H = 720;
const OUT_W = 800;
const OUT_H = 450;
const frames: Buffer[] = [];

async function snap(page: Page) {
  frames.push(await page.screenshot({ type: "png" }));
}

async function until(page: Page, done: () => Promise<boolean>, every = 350, max = 120_000) {
  const t0 = Date.now();
  while (Date.now() - t0 < max) {
    await snap(page);
    if (await done()) return;
    await page.waitForTimeout(every);
  }
}

function downscale(png: PNG): Uint8Array {
  const out = new Uint8Array(OUT_W * OUT_H * 4);
  const sx = png.width / OUT_W;
  const sy = png.height / OUT_H;
  for (let y = 0; y < OUT_H; y++) {
    for (let x = 0; x < OUT_W; x++) {
      let r = 0, g = 0, b = 0, n = 0;
      for (let yy = Math.floor(y * sy); yy < Math.min(png.height, Math.ceil((y + 1) * sy)); yy++) {
        for (let xx = Math.floor(x * sx); xx < Math.min(png.width, Math.ceil((x + 1) * sx)); xx++) {
          const i = (yy * png.width + xx) * 4;
          r += png.data[i]; g += png.data[i + 1]; b += png.data[i + 2]; n++;
        }
      }
      const o = (y * OUT_W + x) * 4;
      out[o] = r / n; out[o + 1] = g / n; out[o + 2] = b / n; out[o + 3] = 255;
    }
  }
  return out;
}

async function main() {
  mkdirSync("docs/media", { recursive: true });
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: W, height: H }, recordVideo: { dir: "docs/media/tmp", size: { width: W, height: H } } });
  const page = await ctx.newPage();
  const finished = async () => (await page.getByTestId("run-state").getAttribute("data-state")) === "completed";

  await page.goto(base);
  for (let i = 0; i < 5; i++) { await snap(page); await page.waitForTimeout(300); }

  await page.goto(`${base}/lab`);
  await page.getByLabel("Playback speed").selectOption({ label: "10×" });
  await page.getByTestId("run-demo").click();
  await until(page, finished, 300);
  for (let i = 0; i < 4; i++) { await snap(page); await page.waitForTimeout(250); }

  await page.getByTestId("mode-faulty").click();
  await page.getByLabel("Playback speed").selectOption({ label: "10×" });
  await page.getByTestId("run-demo").click();
  await until(page, finished, 300);
  for (let i = 0; i < 4; i++) { await snap(page); await page.waitForTimeout(250); }

  await page.getByTestId("view-results").click();
  await page.getByTestId("results").waitFor();
  for (let i = 0; i < 6; i++) { await snap(page); await page.waitForTimeout(300); }

  const video = page.video();
  await ctx.close();
  await browser.close();
  if (video) copyFileSync(await video.path(), "docs/media/demo.webm");

  // Keep every other frame to bound the GIF size.
  const picked = frames.filter((_, i) => i % 2 === 0);
  const gif = GIFEncoder();
  for (const f of picked) {
    const rgba = downscale(PNG.sync.read(f));
    const palette = quantize(rgba, 128, { format: "rgb565" });
    gif.writeFrame(applyPalette(rgba, palette, "rgb565"), OUT_W, OUT_H, { palette, delay: 180 });
  }
  gif.finish();
  writeFileSync("docs/media/demo.gif", gif.bytes());
  console.log(`wrote docs/media/demo.webm and docs/media/demo.gif (${picked.length} frames)`);
}
main().catch((e) => { console.error(e); process.exit(1); });
