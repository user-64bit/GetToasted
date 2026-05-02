"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { useWallet } from "@solana/wallet-adapter-react";
import { getApiUrl } from "../../lib/api-url";

export function DisconnectButton() {
  const router = useRouter();
  const { disconnect } = useWallet();
  const [pending, setPending] = useState(false);

  async function handleClick() {
    if (pending) return;
    setPending(true);
    try {
      await fetch(getApiUrl("/api/auth/logout"), {
        method: "POST",
        credentials: "include",
      });
    } catch {
      // best-effort; cookie clear is server-side, navigate anyway
    }
    try {
      await disconnect();
    } catch {
      // ignore — wallet may already be disconnected
    }
    router.push("/");
    router.refresh();
  }

  return (
    <button
      type="button"
      onClick={handleClick}
      disabled={pending}
      className="inline-block mt-3 transition-colors"
      style={{
        fontFamily: "var(--font-mono)",
        fontSize: 12,
        color: "var(--text-secondary)",
        background: "none",
        border: "none",
        padding: 0,
        cursor: pending ? "wait" : "pointer",
        opacity: pending ? 0.6 : 1,
      }}
    >
      {pending ? "Disconnecting…" : "Disconnect"} <span aria-hidden>↗</span>
    </button>
  );
}
