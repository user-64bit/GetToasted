import type { Context, MiddlewareHandler } from "hono";
import { jwtVerify } from "jose";
import { getCookie } from "hono/cookie";
import { serverEnv } from "@get-toasted/env";

export const authMiddleware: MiddlewareHandler = async (c: Context, next) => {
  const token = getCookie(c, "mev_token");
  if (!token) return c.json({ error: "unauthorized" }, 401);

  try {
    const secret = new TextEncoder().encode(serverEnv.JWT_SECRET);
    const { payload } = await jwtVerify(token, secret);
    c.set("wallet", payload.sub as string);
    return next();
  } catch {
    return c.json({ error: "unauthorized" }, 401);
  }
};
