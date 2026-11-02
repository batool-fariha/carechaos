import clsx from "clsx";
import type { ButtonHTMLAttributes, ReactNode } from "react";
import { STATUS_GLYPH, STATUS_TONE, humanize } from "@/lib/format";

type Tone = "teal" | "amber" | "red" | "gray";
const toneClass: Record<Tone, string> = {
  teal: "text-teal border-teal/40 bg-teal/10",
  amber: "text-amber border-amber/40 bg-amber/10",
  red: "text-red border-red/40 bg-red/10",
  gray: "text-mute border-line bg-panel2",
};

export function Button({ variant = "secondary", className, ...p }: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: "primary" | "secondary" | "danger" | "ghost" }) {
  return (
    <button
      {...p}
      className={clsx(
        "inline-flex items-center justify-center gap-2 rounded-md border px-3.5 py-2 text-sm font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-40",
        variant === "primary" && "border-teal bg-teal text-bg hover:bg-teal/90",
        variant === "secondary" && "border-line bg-panel2 text-ink hover:border-mute/50 hover:bg-line/40",
        variant === "danger" && "border-red/50 bg-red/10 text-red hover:bg-red/20",
        variant === "ghost" && "border-transparent text-mute hover:text-ink",
        className,
      )}
    />
  );
}

export const linkButtonClass = (variant: "primary" | "secondary" = "secondary") =>
  clsx(
    "inline-flex items-center justify-center gap-2 rounded-md border px-3.5 py-2 text-sm font-medium transition-colors",
    variant === "primary" ? "border-teal bg-teal text-bg hover:bg-teal/90" : "border-line bg-panel2 text-ink hover:border-mute/50 hover:bg-line/40",
  );

export function Card({ title, action, children, className, id }: { title?: ReactNode; action?: ReactNode; children: ReactNode; className?: string; id?: string }) {
  return (
    <section id={id} className={clsx("rounded-lg border border-line bg-panel", className)}>
      {(title || action) && (
        <header className="flex flex-wrap items-center justify-between gap-3 border-b border-line px-4 py-3">
          <h2 className="text-sm font-semibold tracking-wide text-ink">{title}</h2>
          {action}
        </header>
      )}
      <div className="p-4">{children}</div>
    </section>
  );
}

export function Pill({ tone = "gray", children, className }: { tone?: Tone; children: ReactNode; className?: string }) {
  return <span className={clsx("inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-medium", toneClass[tone], className)}>{children}</span>;
}

export function StatusBadge({ status }: { status: string }) {
  return (
    <Pill tone={STATUS_TONE[status] ?? "gray"} className="whitespace-nowrap">
      <span aria-hidden>{STATUS_GLYPH[status] ?? "·"}</span>
      {humanize(status)}
    </Pill>
  );
}

export function Stat({ label, value, caption, tone, testId }: { label: string; value: ReactNode; caption?: ReactNode; tone?: Tone; testId?: string }) {
  return (
    <div className="rounded-lg border border-line bg-panel p-3.5" data-testid={testId}>
      <div className="text-xs uppercase tracking-wider text-mute">{label}</div>
      <div className={clsx("tabnum mt-1 text-2xl font-semibold", tone ? toneClass[tone].split(" ")[0] : "text-ink")}>{value}</div>
      {caption && <div className="mt-0.5 text-xs text-mute">{caption}</div>}
    </div>
  );
}

export function Empty({ children }: { children: ReactNode }) {
  return <div className="flex min-h-24 items-center justify-center rounded-md border border-dashed border-line px-4 py-6 text-center text-sm text-mute">{children}</div>;
}

export function Field({ label, hint, error, children, htmlFor }: { label: string; hint?: ReactNode; error?: string; children: ReactNode; htmlFor: string }) {
  return (
    <div className="space-y-1.5">
      <label htmlFor={htmlFor} className="text-sm font-medium text-ink">
        {label}
      </label>
      {children}
      {hint && <p className="text-xs leading-relaxed text-mute">{hint}</p>}
      {error && (
        <p role="alert" className="text-xs text-red">
          {error}
        </p>
      )}
    </div>
  );
}

export const inputClass =
  "w-full rounded-md border border-line bg-bg px-3 py-2 text-sm text-ink placeholder:text-gray focus:border-teal focus:outline-none";
