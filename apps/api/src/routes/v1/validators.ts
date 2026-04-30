import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { validators } from "@get-toasted/db";
import { desc } from "drizzle-orm";
import { z } from "zod";
import { db } from "../../lib/connections.js";

export const validatorsRoute = new Hono();

const Query = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(20),
  offset: z.coerce.number().int().min(0).default(0),
});

// GET /api/v1/validators — validator leaderboard by sandwich count
validatorsRoute.get("/", zValidator("query", Query), async (c) => {
  const { limit, offset } = c.req.valid("query");

  const data = await db
    .select()
    .from(validators)
    .orderBy(desc(validators.sandwichCount))
    .limit(limit)
    .offset(offset);

  return c.json({ data, limit, offset });
});
