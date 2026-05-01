type Stat = {
  text: string;
  top: string;
  left?: string;
  right?: string;
  rotate: number;
  hideBelow?: "sm" | "md" | "lg";
};

const stats: Stat[] = [
  {
    text: "$500M+ extracted from Solana traders",
    top: "12%",
    right: "8%",
    rotate: 2,
    hideBelow: "lg",
  },
  {
    text: "50% of attacks from a single bot",
    top: "62%",
    right: "8%",
    rotate: 2,
    hideBelow: "md",
  },
  {
    text: "801,540 SOL profit per year — one operator",
    top: "78%",
    left: "8%",
    rotate: -2,
    hideBelow: "lg",
  },
];

const hideClass: Record<NonNullable<Stat["hideBelow"]>, string> = {
  sm: "hidden sm:block",
  md: "hidden md:block",
  lg: "hidden lg:block",
};

export function FloatingStats() {
  return (
    <>
      {stats.map((s, i) => (
        <aside
          key={i}
          className={`floating-stat absolute pointer-events-none select-none ${
            s.hideBelow ? hideClass[s.hideBelow] : ""
          }`}
          style={{
            top: s.top,
            left: s.left,
            right: s.right,
            transform: `rotate(${s.rotate}deg)`,
            background: "color-mix(in srgb, var(--bg-surface) 70%, transparent)",
            border: "1px solid var(--border-subtle)",
            padding: "10px 14px",
            borderRadius: 6,
            fontFamily: "var(--font-mono)",
            fontSize: 11,
            color: "var(--text-tertiary)",
            letterSpacing: "0.04em",
            maxWidth: 280,
          }}
        >
          {s.text}
        </aside>
      ))}
    </>
  );
}
