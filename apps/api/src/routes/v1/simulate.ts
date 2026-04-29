import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { SimulateRequestSchema } from "@get-toasted/schemas";

export const simulate = new Hono();

// POST /api/v1/simulate — counterfactual loss simulation via Jupiter
simulate.post(
  "/",
  zValidator("json", SimulateRequestSchema),
  async (c) => {
    const body = c.req.valid("json");
    // TODO: call @get-toasted/jupiter getQuote at pre-sandwich slot vs current
    return c.json({
      wallet: body.wallet,
      inputMint: body.inputMint,
      outputMint: body.outputMint,
      amount: body.amount,
      simulatedOutAmount: "0",
      actualOutAmount: "0",
      lossEstimateUsd: "0",
    });
  },
);
