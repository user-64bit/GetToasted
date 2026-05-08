import { SOL_MINT } from "./constants.ts";
import type { HarnessDetection } from "./types.ts";

const JUPITER_PRICE_URL = "https://lite-api.jup.ag/price/v3";

function amountToUi(raw: string, decimals: number): number {
  return Number(raw) / 10 ** decimals;
}

function proxyDecimals(detection: HarnessDetection): number | null {
  const proxy = detection.loss.lossInProxyToken;
  if (!proxy) return null;
  if (proxy.mint === SOL_MINT) return 9;
  if (proxy.mint === detection.loss.outputTokenMint) return detection.loss.outputTokenDecimals;
  return null;
}

export async function enrichDetectionPrices(detections: HarnessDetection[]): Promise<HarnessDetection[]> {
  const mints = new Set<string>();
  for (const detection of detections) {
    if (detection.loss.outputTokenMint) mints.add(detection.loss.outputTokenMint);
    if (detection.loss.lossInProxyToken?.mint) mints.add(detection.loss.lossInProxyToken.mint);
  }

  if (!mints.size) return detections;

  const url = new URL(JUPITER_PRICE_URL);
  url.searchParams.set("ids", [...mints].join(","));
  const response = await fetch(url, { signal: AbortSignal.timeout(10_000) });
  if (!response.ok) return detections;
  const prices = (await response.json()) as Record<string, { usdPrice?: number }>;

  for (const detection of detections) {
    const outputPrice = prices[detection.loss.outputTokenMint]?.usdPrice ?? null;
    detection.loss.outputTokenPriceAtSlot = outputPrice;

    const proxy = detection.loss.lossInProxyToken;
    if (!proxy) continue;

    const proxyPrice = prices[proxy.mint]?.usdPrice ?? null;
    proxy.usdPrice = proxyPrice;
    const decimals = proxyDecimals(detection);
    if (proxyPrice !== null && decimals !== null) {
      detection.loss.lossUsd = amountToUi(proxy.amount, decimals) * proxyPrice;
    }
  }

  return detections;
}
