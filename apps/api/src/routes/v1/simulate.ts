import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { SimulateRequestSchema } from "@get-toasted/schemas";
import { detectedSandwiches, pools as poolsTbl } from "@get-toasted/db";
import { eq, and, gte, avg, count } from "drizzle-orm";
import { db, redis } from "../../lib/connections.js";

const JUPITER_QUOTE_URL = "https://lite-api.jup.ag/swap/v1/quote";
const JUPITER_PRICE_URL = "https://lite-api.jup.ag/price/v2";

export const simulate = new Hono();

// POST /api/v1/simulate — MEV risk estimate for a proposed swap
simulate.post("/", zValidator("json", SimulateRequestSchema), async (c) => {
  const { inputMint, outputMint, amount } = c.req.valid("json");

  // 1. Jupiter quote
  const quoteParams = new URLSearchParams({
    inputMint,
    outputMint,
    amount,
    slippageBps: "50",
    restrictIntermediateTokens: "true",
  });
  const quoteRes = await fetch(`${JUPITER_QUOTE_URL}?${quoteParams}`);
  if (!quoteRes.ok) {
    return c.json({ error: "jupiter_quote_failed" }, 502);
  }
  const quote = (await quoteRes.json()) as {
    outAmount: string;
    priceImpactPct: string;
    routePlan: Array<{ swapInfo: { ammKey: string } }>;
  };

  const priceImpactPct = parseFloat(quote.priceImpactPct ?? "0");
  const ammKey = quote.routePlan[0]?.swapInfo?.ammKey ?? "";

  // 2. Pool risk from DB
  const [pool] = await db
    .select()
    .from(poolsTbl)
    .where(eq(poolsTbl.address, ammKey))
    .limit(1);

  // 3. Sandwich stats last 7 days on this pool
  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
  const [stats] = await db
    .select({
      avgLoss: avg(detectedSandwiches.lossUsd),
      sandwichCount: count(),
    })
    .from(detectedSandwiches)
    .where(
      and(
        eq(detectedSandwiches.pool, ammKey),
        gte(detectedSandwiches.blockTime, sevenDaysAgo),
      ),
    );

  const sandwichCount7d = Number(stats?.sandwichCount ?? 0);
  const avgLossUsd = parseFloat(stats?.avgLoss ?? "0");

  // 4. Jupiter price for input mint (cached 1hr)
  const priceKey = `price:${inputMint}:${Math.floor(Date.now() / 3_600_000)}`;
  let tokenPriceUsd = 0;
  const cached = await redis.get(priceKey);
  if (cached) {
    tokenPriceUsd = parseFloat(cached);
  } else {
    try {
      const priceRes = await fetch(`${JUPITER_PRICE_URL}?ids=${inputMint}`);
      if (priceRes.ok) {
        const priceData = (await priceRes.json()) as {
          data: Record<string, { price: number }>;
        };
        tokenPriceUsd = priceData.data[inputMint]?.price ?? 0;
        await redis.set(priceKey, String(tokenPriceUsd), "EX", 3600);
      }
    } catch {
      // price unavailable — proceed without USD sizing
    }
  }

  // 5. Compute risk estimate
  const amountUsd = (Number(amount) / 1e9) * tokenPriceUsd;
  const avgLossBps = amountUsd > 0 ? (avgLossUsd / amountUsd) * 10000 : 0;
  const estimatedMevRiskUsd =
    amountUsd * (priceImpactPct / 100 + (2 * avgLossBps) / 10000);

  // 6. Verdict
  let recommendation: "PROCEED" | "PROCEED_WITH_CAUTION" | "USE_MEV_PROTECTED_ROUTE";
  if (sandwichCount7d === 0) {
    recommendation = "PROCEED";
  } else if (estimatedMevRiskUsd < 1) {
    recommendation = "PROCEED_WITH_CAUTION";
  } else {
    recommendation = "USE_MEV_PROTECTED_ROUTE";
  }

  return c.json({
    expectedOut: quote.outAmount,
    priceImpactPct,
    poolRisk: pool?.riskScore ?? null,
    estimatedMevRiskUsd: estimatedMevRiskUsd.toFixed(4),
    recommendation,
    pool: ammKey,
    sandwichCount7d,
  });
});
