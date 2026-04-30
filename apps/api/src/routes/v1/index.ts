import { Hono } from "hono";
import { wallets } from "./wallets.js";
import { simulate } from "./simulate.js";
import { health } from "./health.js";
import { stream } from "./stream.js";
import { validatorsRoute } from "./validators.js";

export const v1 = new Hono()
  .route("/health", health)
  .route("/wallets", wallets)
  .route("/simulate", simulate)
  .route("/stream", stream)
  .route("/validators", validatorsRoute);
