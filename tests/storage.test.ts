import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { scenarioConfig } from "@/engine";
import { rateLimit } from "@/lib/rateLimit";

// Runs against SQLite by default; set TEST_DATABASE_URL to also exercise the Postgres adapter.
const pg = process.env.TEST_DATABASE_URL;
if (pg) process.env.DATABASE_URL = pg;
else process.env.CARECHAOS_DB_PATH = path.join(mkdtempSync(path.join(tmpdir(), "cc-")), "t.db");

const A = "a".repeat(32);
const B = "b".repeat(32);

describe(`experiment storage (${pg ? "postgres" : "sqlite"})`, () => {
  it("creates, updates, lists, deletes and clears; summaries are recomputed server-side", async () => {
    const db = await import("@/lib/db");
    const info = await db.storageInfo();
    expect(info.kind).toBe(pg ? "postgres" : "sqlite");
    await db.clearExperiments(A);
    await db.clearExperiments(B);

    const config = scenarioConfig("alert-service-outage", { name: "storage test" });
    const created = await db.saveExperiment(config, "created", A);
    expect(created.status).toBe("created");
    expect(created.summary).toBeNull();

    const done = await db.saveExperiment(config, "completed", A, created.id);
    expect(done.id).toBe(created.id);
    expect(done.createdAt).toBe(created.createdAt);
    expect(done.verdict).toBe("passed");
    expect(done.summary?.alertsDelivered).toBe(done.summary?.alertsExpected);
    expect(done.config.seed).toBe(42);

    const faulty = await db.saveExperiment({ ...config, mode: "faulty", name: "faulty one" }, "completed", A);
    expect(faulty.verdict).toBe("failed");
    expect((await db.listExperiments(A)).map((r) => r.name).sort()).toEqual(["faulty one", "storage test"]);

    expect(await db.deleteExperiment(created.id, A)).toBe(true);
    expect(await db.getExperiment(created.id)).toBeNull();
    expect(await db.clearExperiments(A)).toBe(1);
    expect(await db.listExperiments(A)).toEqual([]);
  });

  it("scopes history and deletion to the owner; anyone with the id can still read", async () => {
    const db = await import("@/lib/db");
    const config = scenarioConfig("healthy-baseline", { name: "mine" });
    const mine = await db.saveExperiment(config, "completed", A);
    expect(await db.listExperiments(B)).toEqual([]);
    expect((await db.getExperiment(mine.id))?.name).toBe("mine");
    expect(await db.deleteExperiment(mine.id, B)).toBe(false);
    expect(await db.clearExperiments(B)).toBe(0);
    // an update by id keeps the original owner
    const updated = await db.saveExperiment(config, "completed", B, mine.id);
    expect(updated.owner).toBe(A);
    expect(db.publicRow(updated)).not.toHaveProperty("owner");
    expect(await db.deleteExperiment(mine.id, A)).toBe(true);
  });
});

describe("rate limiter", () => {
  it("allows up to the limit within the window, then blocks, then recovers", () => {
    const t0 = 1_000_000;
    for (let i = 0; i < 5; i++) expect(rateLimit("k1", 5, 60_000, t0 + i).ok).toBe(true);
    const blocked = rateLimit("k1", 5, 60_000, t0 + 10);
    expect(blocked.ok).toBe(false);
    expect(blocked.retryAfterSec).toBeGreaterThan(0);
    expect(rateLimit("other", 5, 60_000, t0 + 10).ok).toBe(true);
    expect(rateLimit("k1", 5, 60_000, t0 + 61_000).ok).toBe(true);
  });
});

import { signSession, verifySession } from "@/lib/session";

describe("signed sessions", () => {
  const secret = "s".repeat(40);
  const base = { uid: "gh:42", login: "octo", exp: Date.now() + 60_000 };
  it("round-trips a valid session", () => {
    expect(verifySession(signSession(base, secret), secret)).toEqual(base);
  });
  it("rejects tampering, wrong secrets, expiry, malformed tokens and non-GitHub IDs", () => {
    const tok = signSession(base, secret);
    const [body, sig] = tok.split(".");
    const forged = Buffer.from(JSON.stringify({ ...base, uid: "gh:1" })).toString("base64url");
    expect(verifySession(`${forged}.${sig}`, secret)).toBeNull();
    expect(verifySession(tok, "t".repeat(40))).toBeNull();
    expect(verifySession(signSession({ ...base, exp: 1 }, secret), secret)).toBeNull();
    expect(verifySession(undefined, secret)).toBeNull();
    expect(verifySession("garbage", secret)).toBeNull();
    expect(verifySession(`${body}.`, secret)).toBeNull();
    expect(verifySession(signSession({ ...base, uid: "anon:1" }, secret), secret)).toBeNull();
  });
  it("claims anonymous experiments for an account", async () => {
    const db = await import("@/lib/db");
    const { scenarioConfig } = await import("@/engine");
    const row = await db.saveExperiment(scenarioConfig("healthy-baseline", { name: "claim me" }), "completed", A);
    expect(await db.claimExperiments(A, "gh:99")).toBeGreaterThanOrEqual(1);
    expect((await db.getExperiment(row.id))?.owner).toBe("gh:99");
    expect(await db.deleteExperiment(row.id, A)).toBe(false);
    expect(await db.deleteExperiment(row.id, "gh:99")).toBe(true);
  });
});
