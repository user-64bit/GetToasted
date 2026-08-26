import type { ReactNode } from "react";

interface SectionMarkerProps {
  num: string;
  label: string;
  children: ReactNode;
}

export function SectionMarker({ num, label, children }: SectionMarkerProps) {
  return (
    <div className="section-marker">
      <div className="section-num">
        {num} <span style={{ color: "var(--text-muted)" }}>/</span> {label}
      </div>
      <h2 className="section-head text-section">{children}</h2>
    </div>
  );
}
