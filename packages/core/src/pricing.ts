export const SOL_MINT = "So11111111111111111111111111111111111111112";
export const USDC_MINT = "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v";
export const USDT_MINT = "Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB";

export function computeLossUsd(
  lossRaw: bigint,
  decimals: number,
  priceUsd: number | null,
): number | null {
  if (priceUsd === null || priceUsd <= 0) return null;
  if (lossRaw <= 0n) return 0;
  if (decimals < 0 || decimals > 18) return null;
  const denom = 10 ** decimals;
  const lossFloat = Number(lossRaw) / denom;
  const usd = lossFloat * priceUsd;
  return Math.round(usd * 100) / 100;
}
