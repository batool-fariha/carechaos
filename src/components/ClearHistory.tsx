"use client";
import { useState } from "react";
import { Button } from "./ui";

export function ClearHistory() {
  const [msg, setMsg] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);
  async function go() {
    const res = await fetch("/api/experiments", { method: "DELETE" });
    const data = await res.json();
    setMsg(res.ok ? `Deleted ${data.deleted} stored experiment(s).` : data.error);
    setConfirming(false);
  }
  return (
    <div className="space-y-2">
      {!confirming ? (
        <Button variant="danger" onClick={() => setConfirming(true)} data-testid="clear-history">Delete all experiment history</Button>
      ) : (
        <div className="flex items-center gap-2">
          <span className="text-sm">This permanently deletes all stored experiments.</span>
          <Button variant="danger" onClick={go} data-testid="confirm-clear">Yes, delete</Button>
          <Button onClick={() => setConfirming(false)}>Cancel</Button>
        </div>
      )}
      {msg && <p role="status" className="text-sm text-mute">{msg}</p>}
    </div>
  );
}
