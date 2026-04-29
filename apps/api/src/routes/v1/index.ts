import { Hono } from "hono";
import { wallets } from "./wallets.js";
import { simulate } from "./simulate.js";

export const v1 = new Hono()
  .route("/wallets", wallets)
  .route("/simulate", simulate);
