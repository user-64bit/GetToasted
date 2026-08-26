import Link from "next/link";
import { CommandBar } from "./_components/command-bar";

export default function NotFound() {
  return (
    <>
      <CommandBar />
      <main className="wrap" style={{ padding: "96px 0 120px", maxWidth: 720 }}>
        <p className="text-kicker" style={{ marginBottom: 14 }}>
          404 · off the ledger
        </p>
        <h1 className="text-section" style={{ color: "var(--text-primary)", marginBottom: 16 }}>
          Nothing to reconstruct here.
        </h1>
        <p className="text-body" style={{ marginBottom: 28, maxWidth: 560 }}>
          This page does not exist. If you were looking for a wallet, start a
          scan from the home page.
        </p>
        <Link href="/" className="btn btn-accent">
          Back to home →
        </Link>
      </main>
    </>
  );
}
