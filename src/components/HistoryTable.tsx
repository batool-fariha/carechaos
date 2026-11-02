"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import type { ExperimentRow } from "@/lib/db";
import { fmtPct } from "@/lib/format";
import { Button, Pill } from "./ui";

export function HistoryTable({ rows }: { rows: ExperimentRow[] }) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  async function remove(id: string) {
    setBusy(id);
    await fetch(`/api/experiments/${id}`, { method: "DELETE" });
    setBusy(null);
    router.refresh();
  }
  return (
    <div className="overflow-x-auto rounded-lg border border-line">
      <table className="w-full text-sm" data-testid="history-table">
        <thead className="bg-panel text-left text-xs text-mute">
          <tr>
            {["Experiment", "Scenario", "Mode", "Seed", "Status", "Assertions", "Delivery", "Created (UTC)", ""].map((h) => (
              <th key={h} className="px-3 py-2.5 font-medium">{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.id} className="border-t border-line" data-testid="history-row">
              <td className="px-3 py-2.5">
                <Link href={`/experiments/${r.id}`} className="font-medium text-teal hover:underline">{r.name}</Link>
                <div className="font-mono text-xs text-mute">{r.id}</div>
              </td>
              <td className="px-3">{r.scenarioId}</td>
              <td className="px-3 capitalize">{r.mode}</td>
              <td className="tabnum px-3">{r.seed}</td>
              <td className="px-3">
                {r.status === "created" ? <Pill>○ Not run</Pill> : r.verdict === "passed" ? <Pill tone="teal">✓ Passed</Pill> : r.verdict === "failed" ? <Pill tone="red">✕ Failed</Pill> : <Pill tone="amber">■ Stopped</Pill>}
              </td>
              <td className="tabnum px-3">{r.summary && r.summary.assertionsApplicable ? `${r.summary.assertionsPassed}/${r.summary.assertionsApplicable}` : "—"}</td>
              <td className="tabnum px-3">{r.summary ? fmtPct(r.summary.deliveryRate) : "—"}</td>
              <td className="tabnum px-3 text-mute">{r.createdAt.slice(0, 16).replace("T", " ")}</td>
              <td className="whitespace-nowrap px-3 text-right">
                {r.status !== "created" && (
                  <>
                    <a className="mr-3 text-xs text-mute hover:text-ink" href={`/api/experiments/${r.id}/report?format=json`}>JSON</a>
                    <a className="mr-3 text-xs text-mute hover:text-ink" href={`/api/experiments/${r.id}/report?format=md`}>Markdown</a>
                  </>
                )}
                <Button variant="ghost" disabled={busy === r.id} onClick={() => remove(r.id)} aria-label={`Delete ${r.name}`}>Delete</Button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
