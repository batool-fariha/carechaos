import Link from "next/link";
import { HistoryTable } from "@/components/HistoryTable";
import { Empty, linkButtonClass } from "@/components/ui";
import { listExperiments, publicRow, type ExperimentRow } from "@/lib/db";
import { getOwner, getSession } from "@/lib/owner";
import { githubConfig } from "@/lib/session";

export const dynamic = "force-dynamic";

export default async function History({ searchParams }: { searchParams: Promise<{ auth_error?: string }> }) {
  const { auth_error } = await searchParams;
  const authOn = githubConfig().enabled;
  const session = await getSession();
  let rows: Omit<ExperimentRow, "owner">[] = [];
  let error: string | null = null;
  try {
    const owner = await getOwner();
    rows = owner ? (await listExperiments(owner)).map(publicRow) : [];
  } catch (e) {
    console.error(JSON.stringify({ level: "error", msg: "history load failed", error: String(e) }));
    error = "Experiment storage is unavailable, so history can't be shown. The simulator itself still works.";
  }
  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight">Experiment history</h1>
          <p className="mt-1 text-sm text-mute">Stored locally in SQLite. Each entry keeps only its configuration and seed; results are reproduced exactly by replaying the engine.</p>
        </div>
        <Link href="/experiments/new" className={linkButtonClass("primary")}>New experiment</Link>
      </div>
      {auth_error && <div role="alert" className="rounded-lg border border-amber/40 bg-amber/5 p-4 text-sm text-amber">GitHub sign-in did not complete ({auth_error}). Please try again.</div>}
      {authOn && !session && (
        <p className="rounded-lg border border-line bg-panel px-4 py-3 text-sm text-mute" data-testid="signin-hint">
          This history is tied to this browser. <a href="/api/auth/github" className="font-medium text-teal underline">Sign in with GitHub</a> to keep it across devices; your current runs move to your account.
        </p>
      )}
      {error && <div role="alert" className="rounded-lg border border-amber/40 bg-amber/10 p-4 text-sm text-amber">{error}</div>}
      {!error && rows.length === 0 && (
        <Empty>
          <div>
            No experiments yet.{" "}
            <Link href="/lab?autostart=1" className="text-teal underline">Run the demo</Link> or <Link href="/experiments/new" className="text-teal underline">create an experiment</Link>.
          </div>
        </Empty>
      )}
      {rows.length > 0 && <HistoryTable rows={rows} />}
    </div>
  );
}
