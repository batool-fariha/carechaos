import "server-only";
import { mkdirSync } from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import { runExperiment, type Evaluation, type ExperimentConfig } from "@/engine";

/** Optional local persistence using Node's built-in SQLite (no native dependency). */
let db: DatabaseSync | null = null;

export function dbPath(): string {
  if (process.env.CARECHAOS_DB_PATH) return process.env.CARECHAOS_DB_PATH;
  // Serverless platforms (Vercel) have a read-only project directory; /tmp is writable but ephemeral.
  if (process.env.VERCEL) return "/tmp/carechaos.db";
  return path.join(process.cwd(), "data", "carechaos.db");
}

function getDb(): DatabaseSync {
  if (db) return db;
  const file = dbPath();
  mkdirSync(path.dirname(file), { recursive: true });
  db = new DatabaseSync(file);
  db.exec(`CREATE TABLE IF NOT EXISTS experiments (
    id TEXT PRIMARY KEY,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    name TEXT NOT NULL,
    scenario_id TEXT NOT NULL,
    mode TEXT NOT NULL,
    seed INTEGER NOT NULL,
    status TEXT NOT NULL,
    verdict TEXT,
    summary_json TEXT,
    config_json TEXT NOT NULL
  )`);
  return db;
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

interface Raw {
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
});

export function listExperiments(): ExperimentRow[] {
  return (getDb().prepare("SELECT * FROM experiments ORDER BY created_at DESC, rowid DESC LIMIT 500").all() as unknown as Raw[]).map(toRow);
}

export function getExperiment(id: string): ExperimentRow | null {
  const r = getDb().prepare("SELECT * FROM experiments WHERE id = ?").get(id) as unknown as Raw | undefined;
  return r ? toRow(r) : null;
}

/** Summary and verdict are always recomputed server-side by replaying the engine; clients are not trusted. */
export function saveExperiment(config: ExperimentConfig, status: StoredStatus, id?: string): ExperimentRow {
  const now = new Date().toISOString();
  let verdict: string | null = null;
  let summary: string | null = null;
  if (status !== "created") {
    const ev = runExperiment(config);
    verdict = ev.verdict;
    summary = JSON.stringify(summarize(ev));
  }
  const database = getDb();
  if (id && getExperiment(id)) {
    database
      .prepare("UPDATE experiments SET updated_at=?, name=?, scenario_id=?, mode=?, seed=?, status=?, verdict=?, summary_json=?, config_json=? WHERE id=?")
      .run(now, config.name, config.scenarioId, config.mode, config.seed, status, verdict, summary, JSON.stringify(config), id);
    return getExperiment(id)!;
  }
  const newId = id ?? `exp_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
  database
    .prepare("INSERT INTO experiments (id, created_at, updated_at, name, scenario_id, mode, seed, status, verdict, summary_json, config_json) VALUES (?,?,?,?,?,?,?,?,?,?,?)")
    .run(newId, now, now, config.name, config.scenarioId, config.mode, config.seed, status, verdict, summary, JSON.stringify(config));
  return getExperiment(newId)!;
}

export function deleteExperiment(id: string): void {
  getDb().prepare("DELETE FROM experiments WHERE id = ?").run(id);
}

export function clearExperiments(): number {
  return Number(getDb().prepare("DELETE FROM experiments").run().changes);
}
