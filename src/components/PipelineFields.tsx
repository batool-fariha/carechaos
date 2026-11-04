"use client";
import { DEFAULT_PIPELINE, SERVICE_IDS, SERVICE_LABELS, type Measurement, type PipelineConfig, type ServiceId } from "@/engine";
import { BASE_CAPACITY_PER_SEC } from "@/engine/pipeline";
import { Field, inputClass } from "./ui";

const MEASURES: { key: Measurement; label: string; unit: string; defOp: ">" | "<"; defT: number }[] = [
  { key: "heart_rate", label: "Heart rate", unit: "bpm", defOp: ">", defT: 120 },
  { key: "oxygen_saturation", label: "Oxygen saturation", unit: "%", defOp: "<", defT: 90 },
  { key: "systolic_bp", label: "Systolic blood pressure", unit: "mmHg", defOp: ">", defT: 160 },
];

const num = (v: string) => (v.trim() === "" ? undefined : Number(v));

/** Strips empty values so an unchanged form produces no `pipeline` at all (defaults apply). */
export function prunePipeline(p: PipelineConfig): PipelineConfig | undefined {
  const out: PipelineConfig = {};
  const caps = Object.fromEntries(Object.entries(p.capacities ?? {}).filter(([, v]) => v !== undefined && !Number.isNaN(v)));
  if (Object.keys(caps).length) out.capacities = caps as PipelineConfig["capacities"];
  if (p.queueCapacity !== undefined && !Number.isNaN(p.queueCapacity)) out.queueCapacity = p.queueCapacity;
  if (p.retry) out.retry = p.retry;
  if (p.deadLetterRedrive === false) out.deadLetterRedrive = false;
  if (p.recoveryWarmupSec !== undefined && !Number.isNaN(p.recoveryWarmupSec)) out.recoveryWarmupSec = p.recoveryWarmupSec;
  if (p.degradedQueueDepth !== undefined && !Number.isNaN(p.degradedQueueDepth)) out.degradedQueueDepth = p.degradedQueueDepth;
  if (p.alertRules && Object.keys(p.alertRules).length) out.alertRules = p.alertRules;
  return Object.keys(out).length ? out : undefined;
}

export function PipelineFields({ value, onChange }: { value: PipelineConfig | undefined; onChange: (p: PipelineConfig | undefined) => void }) {
  const p = value ?? {};
  const set = (patch: Partial<PipelineConfig>) => onChange(prunePipeline({ ...p, ...patch }));
  const retry = p.retry ?? { ...DEFAULT_PIPELINE.retry };
  return (
    <div className="space-y-6" data-testid="pipeline-fields">
      <p className="text-sm text-mute">Describe your own pipeline. Anything you leave blank uses the default shown as a placeholder.</p>
      <div>
        <h3 className="mb-2 text-sm font-semibold">Stage capacity (events per second)</h3>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {SERVICE_IDS.map((id: ServiceId) => (
            <Field key={id} label={SERVICE_LABELS[id]} htmlFor={`cap-${id}`}>
              <input id={`cap-${id}`} type="number" min={0.1} step={0.5} className={inputClass} placeholder={BASE_CAPACITY_PER_SEC[id] === Infinity ? "instant" : String(BASE_CAPACITY_PER_SEC[id])} value={p.capacities?.[id] ?? ""} onChange={(e) => set({ capacities: { ...p.capacities, [id]: num(e.target.value) } })} />
            </Field>
          ))}
        </div>
      </div>
      <div>
        <h3 className="mb-2 text-sm font-semibold">Queues, retries and recovery</h3>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <Field label="Queue limit per stage" htmlFor="queue-cap" hint="Overflow is dropped with a recorded reason.">
            <input id="queue-cap" type="number" min={1} className={inputClass} placeholder={String(DEFAULT_PIPELINE.queueCapacity)} value={p.queueCapacity ?? ""} onChange={(e) => set({ queueCapacity: num(e.target.value) })} />
          </Field>
          <Field label="Max retries (resilient mode)" htmlFor="retry-max" hint="Then events go to the dead-letter queue.">
            <input id="retry-max" type="number" min={0} className={inputClass} placeholder={String(DEFAULT_PIPELINE.retry.maxRetries)} value={p.retry?.maxRetries ?? ""} onChange={(e) => set({ retry: e.target.value === "" ? undefined : { ...retry, maxRetries: Number(e.target.value) } })} />
          </Field>
          <Field label="Retry backoff start / cap (s)" htmlFor="retry-base">
            <div className="flex gap-2">
              <input id="retry-base" aria-label="Backoff start seconds" type="number" min={0.1} step={0.5} className={inputClass} placeholder={String(DEFAULT_PIPELINE.retry.baseSec)} value={p.retry?.baseSec ?? ""} onChange={(e) => set({ retry: { ...retry, baseSec: Number(e.target.value) || DEFAULT_PIPELINE.retry.baseSec } })} />
              <input aria-label="Backoff cap seconds" type="number" min={0.1} step={0.5} className={inputClass} placeholder={String(DEFAULT_PIPELINE.retry.capSec)} value={p.retry?.capSec ?? ""} onChange={(e) => set({ retry: { ...retry, capSec: Number(e.target.value) || DEFAULT_PIPELINE.retry.capSec } })} />
            </div>
          </Field>
          <Field label="Dead-letter redrive" htmlFor="redrive" hint="Resilient mode parks exhausted events and redrives them on recovery. Untick to model discarding them.">
            <label className="flex items-center gap-2 text-sm">
              <input id="redrive" type="checkbox" checked={p.deadLetterRedrive ?? true} onChange={(e) => set({ deadLetterRedrive: e.target.checked ? undefined : false })} />
              Redrive after recovery
            </label>
          </Field>
          <Field label="Recovery warm-up (s)" htmlFor="warmup" hint="Minimum time in the recovering state.">
            <input id="warmup" type="number" min={0} step={0.5} className={inputClass} placeholder={String(DEFAULT_PIPELINE.recoveryWarmupSec)} value={p.recoveryWarmupSec ?? ""} onChange={(e) => set({ recoveryWarmupSec: num(e.target.value) })} />
          </Field>
          <Field label="Degraded at queue depth" htmlFor="degraded" hint="A stage shows as degraded at this depth.">
            <input id="degraded" type="number" min={1} className={inputClass} placeholder={String(DEFAULT_PIPELINE.degradedQueueDepth)} value={p.degradedQueueDepth ?? ""} onChange={(e) => set({ degradedQueueDepth: num(e.target.value) })} />
          </Field>
        </div>
      </div>
      <div>
        <h3 className="mb-2 text-sm font-semibold">Alert rules</h3>
        <p className="mb-2 text-xs text-mute">Illustrative thresholds for fictional data. Not clinical guidance.</p>
        <div className="grid gap-4 sm:grid-cols-3">
          {MEASURES.map((m) => {
            const rule = p.alertRules?.[m.key];
            const setRule = (r: { op: ">" | "<"; threshold: number } | undefined) => {
              const rules = { ...p.alertRules };
              if (r) rules[m.key] = r;
              else delete rules[m.key];
              set({ alertRules: rules });
            };
            return (
              <Field key={m.key} label={`${m.label} (${m.unit})`} htmlFor={`rule-${m.key}`}>
                <div className="flex gap-2">
                  <select aria-label={`${m.label} comparison`} className={`${inputClass} !w-16`} value={rule?.op ?? m.defOp} onChange={(e) => setRule({ op: e.target.value as ">" | "<", threshold: rule?.threshold ?? m.defT })}>
                    <option value=">">{">"}</option>
                    <option value="<">{"<"}</option>
                  </select>
                  <input id={`rule-${m.key}`} type="number" className={inputClass} placeholder={String(m.defT)} value={rule?.threshold ?? ""} onChange={(e) => (e.target.value === "" ? setRule(undefined) : setRule({ op: rule?.op ?? m.defOp, threshold: Number(e.target.value) }))} />
                </div>
              </Field>
            );
          })}
        </div>
      </div>
    </div>
  );
}
