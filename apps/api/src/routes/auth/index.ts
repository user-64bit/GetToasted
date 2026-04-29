import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { SiwsVerifySchema } from "@get-toasted/schemas";

export const auth = new Hono();

// POST /api/auth/siws/verify — Sign In With Solana verification
auth.post(
  "/siws/verify",
  zValidator("json", SiwsVerifySchema),
  async (c) => {
    const body = c.req.valid("json");
    // TODO: verify ed25519 signature with @noble/curves, issue JWT via jose
    return c.json({ address: body.address, token: "TODO" });
  },
);

// POST /api/auth/siws/nonce — generate a fresh nonce for SIWS
auth.get("/siws/nonce", async (c) => {
  const nonce = crypto.randomUUID().replace(/-/g, "");
  // TODO: store nonce in Redis with TTL
  return c.json({ nonce });
});
