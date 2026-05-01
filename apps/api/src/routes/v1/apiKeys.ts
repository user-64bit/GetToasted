import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import { randomBytes, createHash } from "node:crypto";
import { ApiKeys } from "@get-toasted/db";
import { db } from "../../lib/connections.js";
import { authMiddleware } from "../../middleware/auth.js";

const KEY_PREFIX = "gt_live_";

const CreateBody = z.object({
  name: z.string().min(1).max(80),
  expiresAt: z.string().datetime().optional(),
  rateLimit: z.number().int().min(1).max(10_000).optional(),
});

const IdParam = z.object({ id: z.string().uuid() });

function generateKey(): { plaintext: string; hash: string; prefix: string } {
  const random = randomBytes(32).toString("base64url");
  const plaintext = `${KEY_PREFIX}${random}`;
  const hash = createHash("sha256").update(plaintext).digest("hex");
  const prefix = plaintext.slice(0, KEY_PREFIX.length + 8);
  return { plaintext, hash, prefix };
}

function serialize(row: ApiKeys.ApiKeyRow) {
  return {
    id: row.id,
    name: row.name,
    prefix: row.keyPrefix,
    rateLimit: row.rateLimit,
    revokedAt: row.revokedAt,
    lastUsedAt: row.lastUsedAt,
    expiresAt: row.expiresAt,
    createdAt: row.createdAt,
  };
}

export const apiKeysRoute = new Hono();

apiKeysRoute.use("*", authMiddleware);

apiKeysRoute.post("/", zValidator("json", CreateBody), async (c) => {
  const wallet = c.get("wallet");
  const body = c.req.valid("json");

  const ownerUserId = await ApiKeys.getOrCreateUserIdForWallet(db, wallet);
  const { plaintext, hash, prefix } = generateKey();

  const row = await ApiKeys.createApiKey(db, {
    ownerUserId,
    name: body.name,
    keyHash: hash,
    keyPrefix: prefix,
    rateLimit: body.rateLimit,
    expiresAt: body.expiresAt ? new Date(body.expiresAt) : null,
  });

  return c.json({ ...serialize(row), key: plaintext }, 201);
});

apiKeysRoute.get("/", async (c) => {
  const wallet = c.get("wallet");
  const ownerUserId = await ApiKeys.getOrCreateUserIdForWallet(db, wallet);
  const rows = await ApiKeys.listApiKeysForUser(db, ownerUserId);
  return c.json({ data: rows.map(serialize) });
});

apiKeysRoute.delete("/:id", zValidator("param", IdParam), async (c) => {
  const wallet = c.get("wallet");
  const { id } = c.req.valid("param");
  const ownerUserId = await ApiKeys.getOrCreateUserIdForWallet(db, wallet);
  const ok = await ApiKeys.revokeApiKey(db, ownerUserId, id);
  if (!ok) return c.json({ error: "not_found_or_already_revoked" }, 404);
  return c.json({ success: true });
});
