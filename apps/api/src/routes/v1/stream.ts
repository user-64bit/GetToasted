import { Hono } from "hono";
import { streamSSE } from "hono/streaming";
import { zValidator } from "@hono/zod-validator";
import { SolanaAddressSchema } from "@get-toasted/schemas";
import { scanJobs } from "@get-toasted/db";
import { eq, desc } from "drizzle-orm";
import { z } from "zod";
import IORedis from "ioredis";
import { db, redis } from "../../lib/connections.js";
import { serverEnv } from "@get-toasted/env";

export const stream = new Hono();

// GET /api/v1/stream/:address — SSE scan progress for a wallet
stream.get(
  "/:address",
  zValidator("param", z.object({ address: SolanaAddressSchema })),
  async (c) => {
    const { address } = c.req.valid("param");

    return streamSSE(c, async (sseStream) => {
      // Dedicated connection for blocking XREAD — must not block the shared redis client
      const reader = new IORedis(serverEnv.REDIS_URL, {
        maxRetriesPerRequest: null,
        enableReadyCheck: false,
      });

      let lastId = "$";
      let heartbeatTimer: ReturnType<typeof setInterval> | null = null;
      let progressTimer: ReturnType<typeof setInterval> | null = null;
      let closed = false;

      const cleanup = () => {
        closed = true;
        if (heartbeatTimer) clearInterval(heartbeatTimer);
        if (progressTimer) clearInterval(progressTimer);
        reader.disconnect();
      };

      // Heartbeat every 15s
      heartbeatTimer = setInterval(async () => {
        if (closed) return;
        await sseStream.writeSSE({ data: JSON.stringify({ type: "heartbeat" }) });
      }, 15_000);

      // Poll scan_jobs every 2s
      progressTimer = setInterval(async () => {
        if (closed) return;
        const [job] = await db
          .select()
          .from(scanJobs)
          .where(eq(scanJobs.wallet, address))
          .orderBy(desc(scanJobs.startedAt))
          .limit(1);
        if (job) {
          await sseStream.writeSSE({
            data: JSON.stringify({
              type: "progress",
              progress: job.progressPct ?? 0,
              sandwichesFound: job.sandwichesFound ?? 0,
              status: job.status,
            }),
          });
        }
      }, 2_000);

      // Stream Redis alerts
      while (!closed) {
        try {
          const result = await reader.xread(
            "BLOCK",
            5000,
            "STREAMS",
            `alerts:queue:${address}`,
            lastId,
          );
          if (!result) continue;
          for (const [, messages] of result as [string, [string, string[]][]][]) {
            for (const [id, fields] of messages) {
              lastId = id;
              const obj: Record<string, string> = {};
              for (let i = 0; i < fields.length; i += 2) {
                obj[fields[i]!] = fields[i + 1]!;
              }
              await sseStream.writeSSE({ data: JSON.stringify(obj) });
            }
          }
        } catch {
          break;
        }
      }

      cleanup();
    });
  },
);
