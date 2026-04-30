export default function Home() {
  return (
    <main className="min-h-screen flex items-center justify-center p-8">
      <div className="max-w-xl w-full">
        <p className="text-label">Foundation ready</p>
        <h1 className="text-display mt-4">
          Get<span style={{ color: "var(--threat-red)" }}>Toasted</span>
        </h1>
        <p className="text-body mt-4" style={{ color: "var(--text-secondary)" }}>
          Every sandwich attack on your wallet. Exposed.
        </p>
        <div
          className="text-mono mt-8"
          style={{ color: "var(--text-tertiary)" }}
        >
          gettoasted.fun
        </div>
      </div>
    </main>
  );
}
