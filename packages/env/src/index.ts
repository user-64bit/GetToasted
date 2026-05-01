import { createEnv } from "@t3-oss/env-core";
import { z } from "zod";

export const serverEnv = createEnv({
  server: {
    NODE_ENV: z
      .enum(["development", "test", "production"])
      .default("development"),
    DATABASE_URL: z.string().url(),
    REDIS_URL: z.string().url(),
    HELIUS_API_KEY: z.string().min(1),
    HELIUS_WEBHOOK_SECRET: z.string().min(1),
    HELIUS_RPC_URL: z.string().url().optional(),
    HELIUS_WEBHOOK_ID: z.string().min(1).optional(),
    JWT_SECRET: z.string().min(32),
    JUPITER_API_KEY: z.string().min(1).optional(),
    VALIDATORS_APP_TOKEN: z.string().min(1).optional(),
    APP_URL: z.string().url(),
    API_BASE_URL: z.string().url().optional(),
    CORS_ORIGIN: z.string().url().optional(),
    SIWS_DOMAIN: z.string().min(1).optional(),
    PORT: z.coerce.number().default(3001),
  },
  runtimeEnv: process.env,
  emptyStringAsUndefined: true,
});

export type ServerEnv = typeof serverEnv;
