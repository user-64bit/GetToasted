"use client";

import { useCallback, useState, type CSSProperties } from "react";
import { useRouter } from "next/navigation";
import { useWallet } from "@solana/wallet-adapter-react";
import { useWalletModal } from "@solana/wallet-adapter-react-ui";
import bs58 from "bs58";
import { getApiUrl } from "../lib/api-url";

type Props = {
  label?: string;
  className?: string;
  style?: CSSProperties;
};

const APP_URL =
  process.env.NEXT_PUBLIC_APP_URL ??
  (typeof window !== "undefined" ? window.location.origin : "https://gettoasted.fun");

function buildSiwsMessage(address: string, nonce: string, issuedAt: string): string {
  return [
    `gettoasted.fun wants you to sign in with your Solana account:`,
    address,
    ``,
    `Sign in to GetToasted to scan your wallet for sandwich attacks.`,
    ``,
    `URI: ${APP_URL}`,
    `Version: 1`,
    `Nonce: ${nonce}`,
    `Issued At: ${issuedAt}`,
  ].join("\n");
}

export function ConnectWalletButton({ label = "Connect Wallet", className, style }: Props) {
  const router = useRouter();
  const { publicKey, connected, signMessage, disconnect } = useWallet();
  const { setVisible } = useWalletModal();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleClick = useCallback(async () => {
    setError(null);

    if (!connected || !publicKey) {
      setVisible(true);
      return;
    }

    if (!signMessage) {
      setError("This wallet does not support message signing.");
      return;
    }

    setBusy(true);
    try {
      const address = publicKey.toBase58();

      const nonceRes = await fetch(getApiUrl("/api/auth/nonce"), {
        credentials: "include",
      });
      if (!nonceRes.ok) throw new Error("Failed to request nonce");
      const { nonce } = (await nonceRes.json()) as { nonce: string };

      const issuedAt = new Date().toISOString();
      const message = buildSiwsMessage(address, nonce, issuedAt);
      const signatureBytes = await signMessage(new TextEncoder().encode(message));
      const signature = bs58.encode(signatureBytes);

      const verifyRes = await fetch(getApiUrl("/api/auth/verify"), {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ address, signature, signedMessage: message, nonce }),
      });
      if (!verifyRes.ok) {
        const body = (await verifyRes.json().catch(() => ({}))) as { error?: string };
        throw new Error(body.error ?? "Verification failed");
      }

      router.push(`/dashboard?wallet=${encodeURIComponent(address)}`);
      router.refresh();
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "Sign-in failed";
      setError(msg);
      try {
        await disconnect();
      } catch {
        // ignore
      }
    } finally {
      setBusy(false);
    }
  }, [connected, publicKey, signMessage, setVisible, router, disconnect]);

  const buttonLabel = busy
    ? connected
      ? "Signing…"
      : "Connecting…"
    : connected && publicKey
      ? `Sign in (${publicKey.toBase58().slice(0, 4)}…${publicKey.toBase58().slice(-4)})`
      : label;

  return (
    <>
      <button
        type="button"
        onClick={handleClick}
        disabled={busy}
        className={className}
        style={style}
      >
        {buttonLabel} <span aria-hidden>→</span>
      </button>
      {error && (
        <span
          role="alert"
          style={{
            display: "block",
            marginTop: 8,
            fontFamily: "var(--font-mono)",
            fontSize: 12,
            color: "var(--threat-red)",
          }}
        >
          {error}
        </span>
      )}
    </>
  );
}
