import { ImageResponse } from "next/og";

export const alt = "CareChaos: chaos engineering for patient-monitoring software";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

const STAGES = ["Device", "Ingestion", "Processor", "Alert rules", "Delivery", "Clinician"];

export default function OpengraphImage() {
  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex", flexDirection: "column", justifyContent: "space-between", background: "#f6f7f9", padding: 72, fontFamily: "sans-serif" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 20 }}>
          <svg width="64" height="64" viewBox="0 0 32 32">
            <rect width="32" height="32" rx="8" fill="#14181f" />
            <path d="M22.51 21.46A8.5 8.5 0 1 1 22.51 10.54" fill="none" stroke="#3ddbc8" strokeWidth="3.2" strokeLinecap="round" />
            <circle cx="26.6" cy="16" r="2" fill="#f5b13d" />
          </svg>
          <div style={{ fontSize: 40, fontWeight: 700, color: "#14181f", display: "flex" }}>
            Care<span style={{ color: "#0b6b63" }}>Chaos</span>
          </div>
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
          <div style={{ fontSize: 72, fontWeight: 700, color: "#14181f", lineHeight: 1.05, display: "flex" }}>See what breaks when your patient-monitoring pipeline fails.</div>
          <div style={{ fontSize: 30, color: "#5b6572", display: "flex" }}>Simulation only. All data is fictional.</div>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
          {STAGES.map((s, i) => (
            <div key={s} style={{ display: "flex", alignItems: "center", gap: 14 }}>
              <div style={{ display: "flex", padding: "12px 20px", borderRadius: 12, border: i === 4 ? "3px solid #b91c1c" : "2px solid #b7c0cc", background: i === 4 ? "#fdf0ef" : "#fff", fontSize: 24, color: i === 4 ? "#b91c1c" : "#14181f", fontWeight: 600 }}>{s}</div>
              {i < STAGES.length - 1 && <div style={{ display: "flex", fontSize: 28, color: "#8b95a3" }}>→</div>}
            </div>
          ))}
        </div>
      </div>
    ),
    size,
  );
}
