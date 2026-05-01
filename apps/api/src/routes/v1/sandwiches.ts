import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { Sandwiches, Validators } from "@get-toasted/db";
import { isKnownBot } from "@get-toasted/core";
import { z } from "zod";
import { db } from "../../lib/connections.js";

export const sandwiches = new Hono();

const IdParam = z.object({
  id: z
    .string()
    .regex(/^\d+$/)
    .transform((v) => BigInt(v)),
});

sandwiches.get("/:id", zValidator("param", IdParam), async (c) => {
  const { id } = c.req.valid("param");
  const row = await Sandwiches.getSandwichById(db, id);
  if (!row) return c.json({ error: "not_found" }, 404);

  let validatorName: string | null = null;
  if (row.validatorVote) {
    const validator = await Validators.getValidator(db, row.validatorVote);
    validatorName = validator?.name ?? null;
  }
  const bot = isKnownBot(row.attacker);

  return c.json({
    id: row.id.toString(),
    slot: row.slot.toString(),
    blockTime: row.blockTime,
    pool: row.pool,
    dex: row.dex,
    attacker: {
      address: row.attacker,
      knownBot: bot
        ? { name: bot.name, source: bot.source, isProgram: bot.isProgram }
        : null,
    },
    victimWallet: row.victimWallet,
    validator: row.validatorVote
      ? { voteAccount: row.validatorVote, name: validatorName }
      : null,
    timeline: {
      front: { signature: row.frontSig },
      victim: {
        signature: row.victimSig,
        inAmount: row.victimInAmt,
        outAmount: row.victimOutAmt,
      },
      back: { signature: row.backSig, failed: row.failed },
    },
    inputMint: row.inputMint,
    outputMint: row.outputMint,
    attackerProfitRaw: row.attackerProfitRaw,
    lossUsd: row.lossUsd,
    confidence: row.confidence,
    jitoBundled: row.jitoBundled,
    jitoTipLamports: row.jitoTipLamports?.toString() ?? null,
    isKnownBot: row.isKnownBot,
    knownBotName: row.knownBotName,
    detectedAt: row.detectedAt,
  });
});
