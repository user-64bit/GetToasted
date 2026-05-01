import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { Sandwiches, Validators } from "@get-toasted/db";
import { z } from "zod";
import { db } from "../../lib/connections.js";

export const validatorsRoute = new Hono();

const ListQuery = z.object({
  sort: z
    .enum(["sandwiches", "extracted_usd", "sandwich_rate"])
    .default("sandwiches"),
  jitoOnly: z
    .union([z.literal("true"), z.literal("false")])
    .optional()
    .transform((v) => v === "true"),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  offset: z.coerce.number().int().min(0).default(0),
});

const VoteParam = z.object({
  voteAccount: z.string().min(32).max(64),
});

validatorsRoute.get("/", zValidator("query", ListQuery), async (c) => {
  const { sort, jitoOnly, limit, offset } = c.req.valid("query");
  const data = await Validators.getValidatorLeaderboard(db, {
    sort,
    jitoOnly,
    limit,
    offset,
  });
  return c.json({ data, limit, offset });
});

validatorsRoute.get(
  "/:voteAccount",
  zValidator("param", VoteParam),
  async (c) => {
    const { voteAccount } = c.req.valid("param");
    const validator = await Validators.getValidator(db, voteAccount);
    if (!validator) return c.json({ error: "not_found" }, 404);

    const [recent, daily] = await Promise.all([
      Validators.getValidatorRecentSandwiches(db, voteAccount, 25),
      Sandwiches.getDailySandwichCountsForValidator(db, voteAccount, 30),
    ]);

    return c.json({
      validator,
      recent: recent.map((r) => ({
        id: r.id.toString(),
        slot: r.slot.toString(),
        blockTime: r.blockTime,
        attacker: r.attacker,
        victimWallet: r.victimWallet,
        lossUsd: r.lossUsd,
        confidence: r.confidence,
      })),
      dailyHistory: daily,
    });
  },
);
