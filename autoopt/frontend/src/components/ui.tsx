import { ReactNode } from "react";
import { HelpCircle } from "lucide-react";
import type { ParamSpec } from "../api";

export function Card({ title, icon, right, children, className = "" }: {
  title?: ReactNode;
  icon?: ReactNode;
  right?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={`card ${className}`}>
      {title && (
        <header className="flex items-center gap-2 px-4 pt-3.5 pb-2">
          {icon && <span className="text-mute">{icon}</span>}
          <h2 className="text-sm font-semibold text-ink">{title}</h2>
          <div className="ml-auto flex items-center gap-2">{right}</div>
        </header>
      )}
      <div className={title ? "px-4 pb-4" : "p-4"}>{children}</div>
    </section>
  );
}

export function Button({ children, onClick, variant = "default", disabled, title, type = "button", className = "" }: {
  children: ReactNode;
  onClick?: () => void;
  variant?: "default" | "primary" | "danger" | "ghost";
  disabled?: boolean;
  title?: string;
  type?: "button" | "submit";
  className?: string;
}) {
  const styles = {
    default: "bg-raised border-line text-ink hover:border-mute",
    primary: "bg-accent border-accent text-white hover:brightness-110",
    danger: "bg-bad/10 border-bad/40 text-bad hover:bg-bad/20",
    ghost: "bg-transparent border-transparent text-sub hover:text-ink hover:bg-raised",
  }[variant];
  return (
    <button
      type={type}
      title={title}
      disabled={disabled}
      onClick={onClick}
      className={`inline-flex items-center justify-center gap-1.5 rounded-lg border px-3 py-1.5 text-sm font-medium transition disabled:opacity-40 disabled:cursor-not-allowed ${styles} ${className}`}
    >
      {children}
    </button>
  );
}

export function Toggle({ checked, onChange, label }: { checked: boolean; onChange: (v: boolean) => void; label?: string }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      onClick={() => onChange(!checked)}
      className={`relative h-5 w-9 shrink-0 rounded-full transition ${checked ? "bg-accent" : "bg-line"}`}
    >
      <span
        className={`absolute top-0.5 h-4 w-4 rounded-full bg-white shadow transition-all ${checked ? "left-[18px]" : "left-0.5"}`}
      />
    </button>
  );
}

export function Field({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return (
    <label className="block">
      <span className="flex items-center gap-1 text-xs text-sub mb-1">
        {label}
        {hint && (
          <span title={hint} className="text-mute">
            <HelpCircle size={12} />
          </span>
        )}
      </span>
      {children}
    </label>
  );
}

export const inputCls =
  "w-full rounded-lg border border-line bg-bg px-2.5 py-1.5 text-sm text-ink num outline-none focus:border-accent";

export function ParamInput({ spec, value, onChange }: {
  spec: ParamSpec;
  value: unknown;
  onChange: (v: unknown) => void;
}) {
  if (spec.type === "bool") {
    return (
      <div className="flex items-center justify-between gap-3 py-1">
        <span className="text-xs text-sub">{spec.label}</span>
        <Toggle checked={Boolean(value)} onChange={onChange} label={spec.label} />
      </div>
    );
  }
  if (spec.options) {
    return (
      <Field label={spec.label}>
        <select className={inputCls} value={String(value)} onChange={(e) => onChange(e.target.value)}>
          {spec.options.map((o) => (
            <option key={o}>{o}</option>
          ))}
        </select>
      </Field>
    );
  }
  return (
    <Field label={spec.label}>
      <input
        type="number"
        className={inputCls}
        value={value === null || value === undefined ? "" : String(value)}
        min={spec.min}
        max={spec.max}
        step={spec.step ?? (Number.isInteger(spec.default) ? 1 : 0.01)}
        onChange={(e) => onChange(e.target.value === "" ? spec.default : Number(e.target.value))}
      />
    </Field>
  );
}

export function Badge({ children, tone = "neutral" }: { children: ReactNode; tone?: "neutral" | "good" | "warn" | "bad" | "accent" }) {
  const t = {
    neutral: "bg-raised text-sub border-line",
    good: "bg-good/10 text-good border-good/30",
    warn: "bg-warn/10 text-warn border-warn/30",
    bad: "bg-bad/10 text-bad border-bad/30",
    accent: "bg-accent/10 text-accent border-accent/30",
  }[tone];
  return <span className={`inline-flex items-center gap-1 rounded-md border px-1.5 py-0.5 text-[11px] font-medium ${t}`}>{children}</span>;
}

export function Stat({ label, value, sub, icon }: { label: string; value: ReactNode; sub?: ReactNode; icon?: ReactNode }) {
  return (
    <div className="card px-4 py-3 min-w-0">
      <div className="label flex items-center gap-1.5">
        {icon}
        {label}
      </div>
      <div className="mt-1 text-2xl font-semibold num truncate">{value}</div>
      {sub && <div className="mt-0.5 text-xs text-sub truncate">{sub}</div>}
    </div>
  );
}

export function AgentDot({ agent, size = 10 }: { agent: string; size?: number }) {
  return (
    <span
      className="inline-block shrink-0 rounded-full"
      style={{ width: size, height: size, background: `var(--agent-${agent})` }}
    />
  );
}
