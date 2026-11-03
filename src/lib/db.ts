import "server-only";
import { mkdirSync } from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import { runExperiment, type Evaluation, type ExperimentConfig } from "@/engine";

/**
 * Experiment storage. Uses Postgres when DATABASE_URL (or POSTGRES_URL) is set, otherwise local SQLite
 * (Node's built-in node:sqlite). On Vercel without a database it falls back to ephemeral /tmp SQLite.
 */
export interface Raw {
  id: string;
  created_at: string;
  updated_at: string;
  name: string;
  scenario_id: string;
  mode: string;
  seed: number;
  status: StoredStatus;
  verdict: string | null;
  summary_json: string | null;
  config_json: string;
  owner: string | null;
}

interface Store {
  kind: "postgres" | "sqlite";
  location: string;
  persistent: boolean;
  list(owner: string): Promise<Raw[]>;
  get(id: string): Promise<Raw | undefined>;
  put(r: Raw): Promise<void>;
  remove(id: string): Promise<void>;
  clear(owner: string): Promise<number>;
}

const COLUMNS = ["id", "created_at", "updated_at", "name", "scenario_id", "mode", "seed", "status", "verdict", "summary_json", "config_json", "owner"] as const;
const TABLE_SQL = `CREATE TABLE IF NOT EXISTS experiments (
  id TEXT PRIMARY KEY, created_at TEXT NOT NULL, updated_at TEXT NOT NULL, name TEXT NOT NULL,
  scenario_id TEXT NOT NULL, mode TEXT NOT NULL, seed BIGINT NOT NULL, status TEXT NOT NULL,
  verdict TEXT, summary_json TEXT, config_json TEXT NOT NULL, owner TEXT)`;
const UPSERT_SQL = (ph: (i: number) => string) =>
  `INSERT INTO experiments (${COLUMNS.join(",")}) VALUES (${COLUMNS.map((_, i) => ph(i + 1)).join(",")})
   ON CONFLICT (id) DO UPDATE SET ${COLUMNS.filter((c) => c !== "id" && c !== "created_at").map((c) => `${c}=excluded.${c}`).join(",")}`;

export function dbPath(): string {
  if (process.env.CARECHAOS_DB_PATH) return process.env.CARECHAOS_DB_PATH;
  // Serverless platforms (Vercel) have a read-only project directory; /tmp is writable but ephemeral.
  if (process.env.VERCEL) return "/tmp/carechaos.db";
  return path.join(process.cwd(), "data", "carechaos.db");
}

let store: Promise<Store> | null = null;
const getStore = () => (store ??= createStore());

async function createStore(): Promise<Store> {
  const url = process.env.DATABASE_URL ?? process.env.POSTGRES_URL;
  if (url) {
    const { default: postgres } = await import("postgres");
    const sql = postgres(url, { ssl: url.includes("localhost") ? false : "require", max: 1, idle_timeout: 20, onnotice: () => {} });
    await sql.unsafe(TABLE_SQL);
    await sql.unsafe("ALTER TABLE experiments ADD COLUMN IF NOT EXISTS owner TEXT");
    const host = (() => {
      try {
        return new URL(url).host;
      } catch {
        return "configured database";
      }
    })();
    return {
      kind: "postgres",
      location: host,
      persistent: true,
      list: async (owner) => (await sql.unsafe("SELECT * FROM experiments WHERE owner = $1 ORDER BY created_at DESC LIMIT 500", [owner])) as unknown as Raw[],
      get: async (id) => ((await sql.unsafe("SELECT * FROM experiments WHERE id = $1", [id])) as unknown as Raw[])[0],
      put: async (r) => void (await sql.unsafe(UPSERT_SQL((i) => `$${i}`), COLUMNS.map((c) => r[c]) as never[])),
      remove: async (id) => void (await sql.unsafe("DELETE FROM experiments WHERE id = $1", [id])),
      clear: async (owner) => (await sql.unsafe("DELETE FROM experiments WHERE owner = $1", [owner])).count,
    };
  }
  const file = dbPath();
  mkdirSync(path.dirname(file), { recursive: true });
  const db = new DatabaseSync(file);
  db.exec(TABLE_SQL.replace("BIGINT", "INTEGER"));
  const cols = db.prepare("PRAGMA table_info(experiments)").all() as unknown as { name: string }[];
  if (!cols.some((c) => c.name === "owner")) db.exec("ALTER TABLE experiments ADD COLUMN owner TEXT");
  return {
    kind: "sqlite",
    location: file,
    persistent: !process.env.VERCEL || !!process.env.CARECHAOS_DB_PATH,
    list: async (owner) => db.prepare("SELECT * FROM experiments WHERE owner = ? ORDER BY created_at DESC, rowid DESC LIMIT 500").all(owner) as unknown as Raw[],
    get: async (id) => db.prepare("SELECT * FROM experiments WHERE id = ?").get(id) as unknown as Raw | undefined,
    put: async (r) => void db.prepare(UPSERT_SQL(() => "?")).run(...COLUMNS.map((c) => r[c] as string | number | null)),
    remove: async (id) => void db.prepare("DELETE FROM experiments WHERE id = ?").run(id),
    clear: async (owner) => Number(db.prepare("DELETE FROM experiments WHERE owner = ?").run(owner).changes),
  };
}

export async function storageInfo(): Promise<{ kind: string; location: string; persistent: boolean }> {
  const s = await getStore();
  return { kind: s.kind, location: s.location, persistent: s.persistent };
}

export type StoredStatus = "created" | "completed" | "stopped";

export interface Summary {
  generated: number;
  processed: number;
  alertsExpected: number;
  alertsDelivered: number;
  deliveryRate: number | null;
  processingRate: number | null;
  assertionsPassed: number;
  assertionsApplicable: number;
  recoveryTimeSec: number | null;
  peakQueueDepth: number;
  stoppedAtSec: number | null;
}

export interface ExperimentRow {
  id: string;
  createdAt: string;
  updatedAt: string;
  name: string;
  scenarioId: string;
  mode: string;
  seed: number;
  status: StoredStatus;
  verdict: string | null;
  summary: Summary | null;
  config: ExperimentConfig;
  /** Opaque per-browser owner ID. Never sent to clients; see publicRow(). */
  owner: string | null;
}

/** Row as exposed over the API: everything except the owner ID. */
export function publicRow(r: ExperimentRow): Omit<ExperimentRow, "owner"> {
  const { owner: _owner, ...rest } = r;
  return rest;
}

function summarize(ev: Evaluation): Summary {
  const m = ev.metrics;
  return {
    generated: m.readingsGenerated,
    processed: m.readingsProcessed,
    alertsExpected: m.alertsExpected,
    alertsDelivered: m.alertsDelivered,
    deliveryRate: m.deliveryRate.value,
    processingRate: m.processingSuccessRate.value,
    assertionsPassed: m.assertionPassRate?.numerator ?? 0,
    assertionsApplicable: m.assertionPassRate?.denominator ?? 0,
    recoveryTimeSec: m.recoveryTimeSec,
    peakQueueDepth: m.peakQueueDepth,
    stoppedAtSec: ev.result.status === "stopped" ? ev.result.nowSec : null,
  };
}

const toRow = (r: Raw): ExperimentRow => ({
  id: r.id,
  createdAt: r.created_at,
  updatedAt: r.updated_at,
  name: r.name,
  scenarioId: r.scenario_id,
  mode: r.mode,
  seed: r.seed,
  status: r.status,
  verdict: r.verdict,
  summary: r.summary_json ? (JSON.parse(r.summary_json) as Summary) : null,
  config: JSON.parse(r.config_json) as ExperimentConfig,
  owner: r.owner ?? null,
});

export async function listExperiments(owner: string): Promise<ExperimentRow[]> {
  return (await (await getStore()).list(owner)).map(toRow);
}

export async function getExperiment(id: string): Promise<ExperimentRow | null> {
  const r = await (await getStore()).get(id);
  return r ? toRow(r) : null;
}

/** Summary and verdict are always recomputed server-side by replaying the engine; clients are not trusted. */
export async function saveExperiment(config: ExperimentConfig, status: StoredStatus, owner: string, id?: string): Promise<ExperimentRow> {
  const now = new Date().toISOString();
  let verdict: string | null = null;
  let summary: string | null = null;
  if (status !== "created") {
    const ev = runExperiment(config);
    verdict = ev.verdict;
    summary = JSON.stringify(summarize(ev));
  }
  const existing = id ? await getExperiment(id) : null;
  const newId = id ?? `exp_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
  await (await getStore()).put({
    id: newId,
    created_at: existing?.createdAt ?? now,
    updated_at: now,
    name: config.name,
    scenario_id: config.scenarioId,
    mode: config.mode,
    seed: config.seed,
    status,
    verdict,
    summary_json: summary,
    config_json: JSON.stringify(config),
    owner: existing?.owner ?? owner,
  });
  return (await getExperiment(newId))!;
}

/** Deletes only if `owner` owns the experiment. Returns whether anything was deleted. */
export async function deleteExperiment(id: string, owner: string): Promise<boolean> {
  const row = await getExperiment(id);
  if (!row || row.owner !== owner) return false;
  await (await getStore()).remove(id);
  return true;
}

export async function clearExperiments(owner: string): Promise<number> {
  return (await getStore()).clear(owner);
}
