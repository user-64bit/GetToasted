import Link from "next/link";
import { DashboardClient } from "./_components/dashboard-client";

interface DashboardPageProps {
  searchParams: Promise<{
    wallet?: string | string[];
  }>;
}

function firstParam(v: string | string[] | undefined): string | undefined {
  return Array.isArray(v) ? v[0] : v;
}

export default async function DashboardPage({ searchParams }: DashboardPageProps) {
  const params = await searchParams;
  const wallet = firstParam(params.wallet)?.trim();

  if (!wallet) {
    return <NoWallet />;
  }

  return (
    <main style={{ minHeight: "100vh" }}>
      <DashboardClient wallet={wallet} />
    </main>
  );
}

function NoWallet() {
  return (
    <main className="min-h-screen flex items-center justify-center px-6">
      <div className="max-w-md w-full text-center">
        <p className="text-label">Dashboard</p>
        <h1 className="text-h1 mt-3">No wallet selected.</h1>
        <p
          className="mt-3"
          style={{
            fontFamily: "var(--font-sans)",
            fontSize: 15,
            lineHeight: 1.6,
            color: "var(--text-secondary)",
          }}
        >
          Paste an address on the home page to begin a scan.
        </p>
        <Link
          href="/"
          className="inline-flex items-center mt-8 gt-btn"
          style={{
            background: "var(--accent)",
            color: "var(--text-inverse)",
            padding: "12px 20px",
            borderRadius: 6,
            fontFamily: "var(--font-mono)",
            fontSize: 13,
            fontWeight: 500,
            letterSpacing: 0,
            gap: 8,
          }}
        >
          <span aria-hidden>←</span> Back to home
        </Link>
      </div>
    </main>
  );
}
