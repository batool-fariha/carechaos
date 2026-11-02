"use client";
import { useState } from "react";
import type { ExperimentConfig } from "@/engine";
import { ResultsView } from "./ResultsView";
import { Runner } from "./Runner";

export function ExperimentView({ id, config, status, createdAt }: { id: string; config: ExperimentConfig; status: "created" | "completed" | "stopped"; createdAt: string }) {
  const [live, setLive] = useState(false);
  const fresh = { ...config, interventions: [] };
  if (status === "created") return <Runner initialConfig={fresh} experimentId={id} startLabel="Start experiment" />;
  if (live) {
    return (
      <div className="space-y-4">
        <button onClick={() => setLive(false)} className="text-sm text-mute hover:text-ink">← Back to stored results</button>
        <Runner initialConfig={fresh} startLabel="Start replay" persist={false} />
      </div>
    );
  }
  return <ResultsView id={id} config={config} createdAt={createdAt} onRunLive={() => setLive(true)} />;
}
