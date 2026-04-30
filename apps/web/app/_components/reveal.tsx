"use client";

import { useEffect, useRef, type ReactNode } from "react";

export interface RevealProps {
  children: ReactNode;
  threshold?: number;
  className?: string;
}

/**
 * Wraps children in a `.reveal-on-view` container that toggles
 * `data-in-view="true"` once the element enters the viewport, triggering
 * the staggered blur-up reveal defined in globals.css.
 */
export function Reveal({ children, threshold = 0.2, className }: RevealProps) {
  const ref = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (typeof IntersectionObserver === "undefined") {
      el.dataset.inView = "true";
      return;
    }
    const obs = new IntersectionObserver(
      (entries) => {
        const entry = entries[0];
        if (entry?.isIntersecting) {
          el.dataset.inView = "true";
          obs.disconnect();
        }
      },
      { threshold },
    );
    obs.observe(el);
    return () => obs.disconnect();
  }, [threshold]);

  return (
    <div ref={ref} className={`reveal-on-view ${className ?? ""}`}>
      {children}
    </div>
  );
}
