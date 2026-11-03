import { APP_VERSION, ENGINE_VERSION, REPORT_LIMITATIONS, REPORT_SCHEMA_VERSION } from "@/engine";
import { ClearHistory } from "@/components/ClearHistory";
import { Card } from "@/components/ui";
import { storageInfo } from "@/lib/db";

export const dynamic = "force-dynamic";

export default async function Settings() {
  let storage: Awaited<ReturnType<typeof storageInfo>> | null = null;
  try {
    storage = await storageInfo();
  } catch {
    storage = null;
  }
  return (
    <div className="max-w-3xl space-y-5">
      <h1 className="text-3xl font-semibold tracking-tight">About &amp; settings</h1>
      <Card title="What CareChaos is">
        <div className="space-y-3 text-sm leading-relaxed text-mute">
          <p>CareChaos is an open-source chaos engineering simulator for remote patient-monitoring software. It injects failures into a <b className="text-ink">synthetic</b> pipeline — device → ingestion → processor → alert rules → delivery → clinician dashboard — and shows what happens to readings, alerts and recovery.</p>
          <p>It is a developer and educational tool. It is <b className="text-ink">not</b> a clinical decision-support system, never connects to real devices or EHRs, and never uses real patient data.</p>
        </div>
      </Card>
      <Card title="Scope and limitations">
        <ul className="list-disc space-y-1 pl-5 text-sm text-mute">
          {REPORT_LIMITATIONS.map((l) => <li key={l}>{l}</li>)}
          <li>The faulty reference mode is a teaching example of common weaknesses, not a model of any actual company's infrastructure.</li>
          <li>Privacy-related behavior in the simulation (for example, synthetic IDs) is not a claim of compliance with any healthcare regulation.</li>
        </ul>
      </Card>
      <Card title="Versions and storage">
        <dl className="grid grid-cols-[10rem_1fr] gap-y-1.5 text-sm">
          <dt className="text-mute">App version</dt><dd>{APP_VERSION}</dd>
          <dt className="text-mute">Engine version</dt><dd>{ENGINE_VERSION}</dd>
          <dt className="text-mute">Report schema</dt><dd>{REPORT_SCHEMA_VERSION}</dd>
          <dt className="text-mute">History storage</dt><dd className="break-all text-xs">{storage ? <><b>{storage.kind}</b> · <span className="font-mono">{storage.location}</span> · {storage.persistent ? "persistent" : "ephemeral (resets on restart)"}</> : "unavailable"}</dd>
        </dl>
        <div className="mt-4"><ClearHistory /></div>
      </Card>
    </div>
  );
}
