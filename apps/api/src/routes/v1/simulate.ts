import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { SimulateRequestSchema } from "@get-toasted/schemas";
import { Pools, Sandwiches } from "@get-toasted/db";
import { logger } from "@get-toasted/runtime";
import { db, priceClient } from "../../lib/connections.js";

const JUPITER_QUOTE_URL = "https://lite-api.jup.ag/swap/v1/quote";
const SIMULATE_TIMEOUT_MS = 8_000;

export const simulate = new Hono();

type Verdict = "PROCEED" | "PROCEED_WITH_CAUTION" | "USE_MEV_PROTECTED_ROUTE";

simulate.post("/", zValidator("json", SimulateRequestSchema), async (c) => {
  const { inputMint, outputMint, amount } = c.req.valid("json");
  const slippageBps = 50;

  const ac = new AbortController();
  const timeout = setTimeout(() => ac.abort(), SIMULATE_TIMEOUT_MS);

  try {
    const params = new URLSearchParams({
      inputMint,
      outputMint,
      amount,
      slippageBps: String(slippageBps),
      restrictIntermediateTokens: "true",
    });

    const quoteRes = await fetch(`${JUPITER_QUOTE_URL}?${params}`, { signal: ac.signal });
    if (!quoteRes.ok) {
      return c.json(
        { error: "jupiter_quote_failed", code: "JUPITER_UNAVAILABLE" },
        502,
      );
    }
    const quote = (await quoteRes.json()) as {
      outAmount: string;
      priceImpactPct: string;
      routePlan: Array<{ swapInfo: { ammKey: string } }>;
    };

    const priceImpactPct = parseFloat(quote.priceImpactPct ?? "0");
    const ammKey = quote.routePlan[0]?.swapInfo?.ammKey ?? null;

    const [pool, poolStats] = ammKey
      ? await Promise.all([
          Pools.getPool(db, ammKey),
          Sandwiches.getPoolSandwichStats(db, ammKey, 7),
        ])
      : [null, { count: 0, avgLossUsd: null, lastSeen: null }];

    const tokenPriceUsd = await priceClient.getTokenPriceUsd(inputMint, new Date());
    const amountFloat = Number(amount) / 1e9;
    const amountUsd = tokenPriceUsd ? amountFloat * tokenPriceUsd : null;

    const avgLossUsd = poolStats.avgLossUsd ?? 0;
    const avgLossBps =
      amountUsd && amountUsd > 0 ? (avgLossUsd / amountUsd) * 10_000 : 0;
    const estimatedMevRiskUsd =
      amountUsd !== null
        ? amountUsd * (priceImpactPct / 100 + (2 * avgLossBps) / 10_000)
        : null;

    let recommendation: Verdict;
    if (poolStats.count === 0) {
      recommendation = "PROCEED";
    } else if (estimatedMevRiskUsd !== null && estimatedMevRiskUsd < 1) {
      recommendation = "PROCEED_WITH_CAUTION";
    } else if (poolStats.count > 5 || (estimatedMevRiskUsd ?? 0) >= 5) {
      recommendation = "USE_MEV_PROTECTED_ROUTE";
    } else {
      recommendation = "PROCEED_WITH_CAUTION";
    }

    return c.json({
      expectedOut: quote.outAmount,
      priceImpactPct,
      pool: ammKey,
      poolRiskScore: pool?.riskScore ?? null,
      sandwichCount7d: poolStats.count,
      avgLossUsd7d: poolStats.avgLossUsd,
      tokenPriceUsd: tokenPriceUsd ?? null,
      amountUsd,
      estimatedMevRiskUsd:
        estimatedMevRiskUsd !== null
          ? Number(estimatedMevRiskUsd.toFixed(4))
          : null,
      recommendation,
    });
  } catch (err) {
    if ((err as Error).name === "AbortError") {
      return c.json({ error: "simulation_timeout", code: "SIM_TIMEOUT" }, 504);
    }
    logger.error({ err }, "simulate: unexpected error");
    return c.json({ error: "internal_server_error" }, 500);
  } finally {
    clearTimeout(timeout);
  }
});
