import { type ReactNode } from "react";
import { cn } from "./utils";

export function Panel({
  children,
  className,
  bleed = false,
}: {
  children: ReactNode;
  className?: string;
  bleed?: boolean;
}) {
  return (
    <section
      className={cn(className)}
      style={{
        background: "var(--bg-surface)",
        border: "1px solid var(--border-subtle)",
        borderRadius: "var(--radius-panel)",
        overflow: bleed ? "hidden" : undefined,
      }}
    >
      {children}
    </section>
  );
}

export function PanelHeader({
  label,
  title,
  meta,
}: {
  label?: string;
  title?: string;
  meta?: ReactNode;
}) {
  return (
    <header
      className="flex items-start justify-between gap-4"
      style={{
        padding: "14px 16px",
        borderBottom: "1px solid var(--border-subtle)",
      }}
    >
      <div>
        {label ? <p className="text-label">{label}</p> : null}
        {title ? <h2 className="text-h3 mt-1">{title}</h2> : null}
      </div>
      {meta ? <div>{meta}</div> : null}
    </header>
  );
}
