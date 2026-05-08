import type { JitoBundleInfo } from "@get-toasted/core";
import type { JitoBundle } from "./types.ts";

const JITO_BUNDLE_API = "https://bundles.jito.wtf/api/v1/bundles";

/**
 * Harness-side adapter that returns the production `JitoBundleInfo`
 * shape (used by `JitoBundleResolver` in @get-toasted/core). Wraps the
 * existing two-step lookup. Returns null when the signature isn't in
 * any landed bundle.
 */
export async function getJitoBundleForSignature(
  signature: string,
): Promise<JitoBundleInfo | null> {
  const bundles = await getBundlesForSignature(signature).catch(() => []);
  if (bundles.length === 0) return null;
  const bundle = bundles[0]!;
  return {
    bundleId: bundle.bundleId,
    signaturesInBundle: bundle.txSignatures,
    landedSlot: bundle.slot,
    tipLamports: BigInt(bundle.landedTipLamports ?? 0),
  };
}

function normalizeBundle(raw: any): JitoBundle {
  return {
    bundleId: raw.bundleId ?? raw.bundle_id,
    slot: Number(raw.slot),
    validator: raw.validator ?? null,
    tippers: raw.tippers ?? [],
    landedTipLamports: Number(raw.landedTipLamports ?? raw.landed_tip_lamports ?? 0),
    landedCu: raw.landedCu ?? raw.landed_cu ?? null,
    blockIndex: raw.blockIndex ?? raw.block_index ?? null,
    timestamp: raw.timestamp ?? null,
    txSignatures: raw.txSignatures ?? raw.transactions ?? raw.tx_signatures ?? [],
  };
}

async function getJson(url: string): Promise<any> {
  const response = await fetch(url, { signal: AbortSignal.timeout(10_000) });
  const json = await response.json();
  if (!response.ok) {
    throw new Error(`Jito fetch failed: ${JSON.stringify(json)}`);
  }
  return json;
}

export async function getBundlesForSignature(signature: string): Promise<JitoBundle[]> {
  const json = await getJson(`${JITO_BUNDLE_API}/transaction/${signature}`).catch((error) => {
    if (error instanceof Error && error.message.includes("Bundle not found")) return [];
    throw error;
  });
  if (!Array.isArray(json)) return [];

  const bundleIds = json.map((item) => item.bundleId ?? item.bundle_id).filter(Boolean);
  const bundles = await Promise.all(bundleIds.map((id) => getBundle(id)));
  return bundles.filter((bundle): bundle is JitoBundle => Boolean(bundle));
}

export async function getBundle(bundleId: string): Promise<JitoBundle | null> {
  const json = await getJson(`${JITO_BUNDLE_API}/bundle/${bundleId}`);
  if (!Array.isArray(json) || !json[0]) return null;
  return normalizeBundle(json[0]);
}

export async function getRecentBundles(limit: number): Promise<Array<{ bundleId: string; transactions: string[]; timestamp: string | null }>> {
  const url = new URL(`${JITO_BUNDLE_API}/recent`);
  url.searchParams.set("limit", String(limit));
  const json = await getJson(url.toString());
  if (!Array.isArray(json)) return [];
  return json
    .map((item) => ({
      bundleId: item.bundleId ?? item.bundle_id,
      transactions: item.transactions ?? item.txSignatures ?? item.tx_signatures ?? [],
      timestamp: item.timestamp ?? null,
    }))
    .filter((item) => item.bundleId);
}
