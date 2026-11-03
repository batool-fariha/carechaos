import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { scenarioConfig } from "@/engine";

// Runs against SQLite by default; set TEST_DATABASE_URL to also exercise the Postgres adapter.
const pg = process.env.TEST_DATABASE_URL;
if (pg) process.env.DATABASE_URL = pg;
else process.env.CARECHAOS_DB_PATH = path.join(mkdtempSync(path.join(tmpdir(), "cc-")), "t.db");

describe(`experiment storage (${pg ? "postgres" : "sqlite"})`, () => {
  it("creates, updates, lists, deletes and clears; summaries are recomputed server-side", async () => {
    const db = await import("@/lib/db");
    const info = await db.storageInfo();
    expect(info.kind).toBe(pg ? "postgres" : "sqlite");
    await db.clearExperiments();

    const config = scenarioConfig("alert-service-outage", { name: "storage test" });
    const created = await db.saveExperiment(config, "created");
    expect(created.status).toBe("created");
    expect(created.summary).toBeNull();

    const done = await db.saveExperiment(config, "completed", created.id);
    expect(done.id).toBe(created.id);
    expect(done.createdAt).toBe(created.createdAt);
    expect(done.verdict).toBe("passed");
    expect(done.summary?.alertsDelivered).toBe(done.summary?.alertsExpected);
    expect(done.config.seed).toBe(42);

    const faulty = await db.saveExperiment({ ...config, mode: "faulty", name: "faulty one" }, "completed");
    expect(faulty.verdict).toBe("failed");
    expect((await db.listExperiments()).map((r) => r.name).sort()).toEqual(["faulty one", "storage test"]);

    await db.deleteExperiment(created.id);
    expect(await db.getExperiment(created.id)).toBeNull();
    expect(await db.clearExperiments()).toBe(1);
    expect(await db.listExperiments()).toEqual([]);
  });
});
