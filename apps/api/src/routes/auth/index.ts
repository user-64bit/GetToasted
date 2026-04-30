import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { setCookie, deleteCookie } from "hono/cookie";
import { ed25519 } from "@noble/curves/ed25519";
import { SignJWT } from "jose";
import bs58 from "bs58";
import { z } from "zod";
import { serverEnv } from "@get-toasted/env";
import { redis } from "../../lib/connections.js";

export const auth = new Hono();

const VerifySchema = z.object({
  address: z.string().min(32).max(44),
  signature: z.string().min(1),
  signedMessage: z.string().min(1),
  nonce: z.string().min(16),
});

// GET /api/auth/nonce — generate a single-use nonce
auth.get("/nonce", async (c) => {
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  const nonce = bs58.encode(bytes);
  const expiresAt = new Date(Date.now() + 5 * 60 * 1000).toISOString();
  await redis.set(`siws:nonce:${nonce}`, "1", "EX", 300);
  return c.json({ nonce, expiresAt });
});

// POST /api/auth/verify — verify ed25519 SIWS signature and issue JWT
auth.post("/verify", zValidator("json", VerifySchema), async (c) => {
  const body = c.req.valid("json");

  const exists = await redis.get(`siws:nonce:${body.nonce}`);
  if (!exists) return c.json({ error: "invalid_or_expired_nonce" }, 401);
  await redis.del(`siws:nonce:${body.nonce}`);

  try {
    const sigBytes = bs58.decode(body.signature);
    const msgBytes = new TextEncoder().encode(body.signedMessage);
    const pubKeyBytes = bs58.decode(body.address);
    const ok = ed25519.verify(sigBytes, msgBytes, pubKeyBytes);
    if (!ok) return c.json({ error: "invalid_signature" }, 401);
  } catch {
    return c.json({ error: "invalid_signature" }, 401);
  }

  const secret = new TextEncoder().encode(serverEnv.JWT_SECRET);
  const token = await new SignJWT({ sub: body.address })
    .setProtectedHeader({ alg: "HS256" })
    .setExpirationTime("7d")
    .setIssuedAt()
    .sign(secret);

  setCookie(c, "mev_token", token, {
    httpOnly: true,
    secure: serverEnv.NODE_ENV === "production",
    sameSite: "Lax",
    maxAge: 60 * 60 * 24 * 7,
    path: "/",
  });

  return c.json({ address: body.address, authenticated: true });
});

// POST /api/auth/logout
auth.post("/logout", (c) => {
  deleteCookie(c, "mev_token", { path: "/" });
  return c.json({ success: true });
});
