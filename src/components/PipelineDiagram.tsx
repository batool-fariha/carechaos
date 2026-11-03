/** Static explainer: what happens in a CareChaos experiment. Used on the landing page. */
const STAGES = [
  { t: "Device", s: "Sends a reading" },
  { t: "Ingestion", s: "Receives it" },
  { t: "Processor", s: "Stores it, once" },
  { t: "Alert rules", s: "Is it concerning?" },
  { t: "Delivery", s: "Sends the alert" },
  { t: "Clinician screen", s: "Alert appears" },
];

export function PipelineDiagram() {
  const W = 148;
  const G = 28;
  const total = STAGES.length * W + (STAGES.length - 1) * G + 16;
  return (
    <div className="overflow-x-auto">
      <svg viewBox={`0 0 ${total} 170`} role="img" aria-label="A reading flows from a device through ingestion, processor, alert rules and delivery to the clinician screen. Failures can be injected at any stage." className="min-w-[960px] w-full">
        <defs>
          <marker id="pd-arrow" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
            <path d="M2 1L8 5L2 9" fill="none" stroke="#8b95a3" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
          </marker>
        </defs>
        <rect x="1" y="1" width={total - 2} height="168" rx="12" fill="none" stroke="#b91c1c" strokeOpacity="0.5" strokeDasharray="5 4" />
        <text x="16" y="22" fontSize="12" fill="#b91c1c" fontWeight="600">
          ⚡ A failure can be injected at any stage
        </text>
        {STAGES.map((st, i) => {
          const x = 8 + i * (W + G);
          const last = i === STAGES.length - 1;
          return (
            <g key={st.t}>
              <rect x={x} y={44} width={W} height={84} rx={10} fill={last ? "#e6f4f1" : "#ffffff"} stroke={last ? "#0b6b63" : "#b7c0cc"} strokeWidth="1.5" />
              <text x={x + 14} y={78} fontSize="14" fontWeight="600" fill="#14181f">
                {st.t}
              </text>
              <text x={x + 14} y={102} fontSize="12.5" fill="#5b6572">
                {st.s}
              </text>
              {!last && <line x1={x + W + 3} y1={86} x2={x + W + G - 4} y2={86} stroke="#8b95a3" strokeWidth="1.6" markerEnd="url(#pd-arrow)" />}
            </g>
          );
        })}
        <text x={16} y={152} fontSize="12" fill="#5b6572">
          All patients and readings are fictional.
        </text>
      </svg>
    </div>
  );
}
