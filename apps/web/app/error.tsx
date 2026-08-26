"use client";

import Link from "next/link";
import { useEffect } from "react";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // Surface unexpected client errors for debugging without a toast library.
    console.error(error);
  }, [error]);

  return (
    <main
      className="wrap"
      style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center" }}
    >
      <section className="panel" style={{ maxWidth: 520, overflow: "hidden" }}>
        <div
          className="flex items-center gap-2.5"
          style={{
            padding: "13px 18px",
            borderBottom: "1px solid var(--threat-red-border)",
            background: "var(--threat-red-dim)",
          }}
        >
          <span className="dot" style={{ background: "var(--threat-red)" }} />
          <span
            style={{
              fontFamily: "var(--font-mono)",
              fontSize: 11,
              color: "var(--threat-red)",
              textTransform: "uppercase",
              letterSpacing: "0.08em",
            }}
          >
            Instrument fault
          </span>
        </div>
        <div className="panel-bd">
          <h1 className="text-h2" style={{ color: "var(--text-primary)" }}>
            Something broke on this screen.
          </h1>
          <p className="text-body-sm" style={{ marginTop: 12 }}>
            The interface hit an unexpected error. Your wallet was never touched.
            Try again, or head back and re-run the scan.
          </p>
          {error.digest ? (
            <p style={{ fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--text-muted)", marginTop: 14 }}>
              ref {error.digest}
            </p>
          ) : null}
          <div className="mt-6 flex items-center gap-2">
            <button type="button" onClick={reset} className="btn btn-accent">
              Try again
            </button>
            <Link href="/" className="btn btn-outline">
              Back to home
            </Link>
          </div>
        </div>
      </section>
    </main>
  );
}
