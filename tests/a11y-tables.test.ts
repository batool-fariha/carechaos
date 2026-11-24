import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

/** Source-level guard so tables keep a name and column scope. The axe e2e run cannot flag a missing caption. */
function tsxFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((f) => {
    const p = path.join(dir, f);
    return statSync(p).isDirectory() ? tsxFiles(p) : p.endsWith(".tsx") ? [p] : [];
  });
}

describe("table accessibility", () => {
  const files = tsxFiles("src");
  for (const file of files) {
    const src = readFileSync(file, "utf8");
    if (!src.includes("<table")) continue;
    it(`${file}: every table has a caption and every header cell has a scope`, () => {
      expect((src.match(/<table\b/g) ?? []).length).toBe((src.match(/<caption\b/g) ?? []).length);
      expect(src.match(/<th(?![a-z])(?![^>]*\bscope=)[^>]*>/g) ?? []).toEqual([]);
    });
  }
  it("finds at least the known tables", () => {
    expect(files.filter((f) => readFileSync(f, "utf8").includes("<table")).length).toBeGreaterThanOrEqual(3);
  });
});
