import {
  HeliusError,
  HeliusNetworkError,
  HeliusRateLimitError,
  HeliusServerError,
} from "./errors.js";
import { TokenBucket, jitteredBackoffMs } from "./rate-limit.js";

const HELIUS_PARSE_BASE = "https://api.helius.xyz/v0";

export type HeliusTokenAmount = {
  tokenAmount: string;
  decimals: number;
};

export type HeliusTokenInput = {
  userAccount: string;
  mint: string;
  rawTokenAmount: HeliusTokenAmount;
};

export type HeliusTokenTransfer = {
  fromUserAccount: string;
  toUserAccount: string;
  fromTokenAccount?: string;
  toTokenAccount?: string;
  mint: string;
  tokenAmount: number;
};

export type HeliusNativeTransfer = {
  fromUserAccount: string;
  toUserAccount: string;
  amount: number;
};

export type HeliusInnerSwap = {
  programInfo: {
    source: string;
    account: string;
    programName: string;
    instructionName: string;
  };
  tokenInputs: HeliusTokenInput[];
  tokenOutputs: HeliusTokenInput[];
};

export type HeliusSwapEvent = {
  nativeInput?: { account: string; amount: string } | null;
  nativeOutput?: { account: string; amount: string } | null;
  tokenInputs?: HeliusTokenInput[];
  tokenOutputs?: HeliusTokenInput[];
  tokenFees?: HeliusTokenInput[];
  nativeFees?: Array<{ account: string; amount: string }>;
  innerSwaps?: HeliusInnerSwap[];
};

export type HeliusInstruction = {
  accounts: string[];
  data: string;
  programId: string;
  innerInstructions: Array<{
    accounts: string[];
    data: string;
    programId: string;
  }>;
};

export type HeliusEnhancedTransaction = {
  signature: string;
  slot: number;
  timestamp: number;
  feePayer: string;
  type: string;
  source: string;
  fee: number;
  tokenTransfers?: HeliusTokenTransfer[];
  nativeTransfers?: HeliusNativeTransfer[];
  events?: { swap?: HeliusSwapEvent };
  instructions?: HeliusInstruction[];
  transactionError: unknown | null;
};

// Backward-compat alias used elsewhere in the codebase
export type HeliusParsedTx = HeliusEnhancedTransaction;

export type WebhookConfig = {
  webhookURL: string;
  transactionTypes: string[];
  accountAddresses: string[];
  webhookType: "enhanced" | "raw";
  authHeader?: string;
};

export type GetTransactionsOpts = {
  address: string;
  limit?: number;
  before?: string;
  until?: string;
  type?: string;
  commitment?: "confirmed" | "finalized";
};

const MAX_RETRIES = 3;

export class HeliusClient {
  private readonly bucket: TokenBucket;

  constructor(
    private readonly apiKey: string,
    private readonly rpcUrl: string = `https://mainnet.helius-rpc.com/?api-key=${apiKey}`,
  ) {
    if (!apiKey) {
      throw new HeliusError("HELIUS_MISSING_KEY", "HELIUS_API_KEY is required");
    }
    // 50 tokens/sec sustained, 100 burst. Helius free tier handles ~50 RPS comfortably.
    this.bucket = new TokenBucket(100, 50);
  }

  private async request(
    url: string,
    init?: RequestInit,
    context?: Record<string, unknown>,
  ): Promise<Response> {
    let lastErr: unknown;

    for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
      await this.bucket.acquire();
      try {
        const res = await fetch(url, init);

        if (res.status === 429) {
          if (attempt === MAX_RETRIES) {
            throw new HeliusRateLimitError({ url, attempt, ...context });
          }
          await sleep(jitteredBackoffMs(attempt));
          continue;
        }

        if (res.status >= 500) {
          if (attempt === MAX_RETRIES) {
            throw new HeliusServerError(res.status, await res.text(), { url, ...context });
          }
          await sleep(jitteredBackoffMs(attempt));
          continue;
        }

        return res;
      } catch (err) {
        lastErr = err;
        if (
          err instanceof HeliusError ||
          attempt === MAX_RETRIES ||
          !isRetryableNetworkError(err)
        ) {
          if (err instanceof HeliusError) throw err;
          throw new HeliusNetworkError(err, { url, attempt, ...context });
        }
        await sleep(jitteredBackoffMs(attempt));
      }
    }

    throw new HeliusNetworkError(lastErr, { url, ...context });
  }

  private async rpcCall<T>(method: string, params: unknown[]): Promise<T> {
    const res = await this.request(this.rpcUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
    });
    if (!res.ok) {
      throw new HeliusServerError(res.status, await res.text(), { method });
    }
    const json = (await res.json()) as { result?: T; error?: { message: string } };
    if (json.error) {
      throw new HeliusError("HELIUS_RPC_ERROR", json.error.message, { method });
    }
    if (json.result === undefined) {
      throw new HeliusError("HELIUS_RPC_NO_RESULT", `No result for ${method}`, { method });
    }
    return json.result;
  }

  async getTransactionsForAddress(
    opts: GetTransactionsOpts,
  ): Promise<HeliusEnhancedTransaction[]> {
    const params = new URLSearchParams({ "api-key": this.apiKey });
    if (opts.limit) params.set("limit", String(Math.min(opts.limit, 100)));
    if (opts.before) params.set("before", opts.before);
    if (opts.until) params.set("until", opts.until);
    if (opts.type) params.set("type", opts.type);
    if (opts.commitment) params.set("commitment", opts.commitment);

    const url = `${HELIUS_PARSE_BASE}/addresses/${opts.address}/transactions?${params}`;
    const res = await this.request(url, undefined, { address: opts.address });
    if (!res.ok) {
      throw new HeliusServerError(res.status, await res.text(), { address: opts.address });
    }
    return (await res.json()) as HeliusEnhancedTransaction[];
  }

  async getTransaction(signature: string): Promise<HeliusEnhancedTransaction | null> {
    const res = await this.parseTransactions([signature]);
    return res[0] ?? null;
  }

  async parseTransactions(signatures: string[]): Promise<HeliusEnhancedTransaction[]> {
    if (signatures.length === 0) return [];
    if (signatures.length > 100) {
      throw new HeliusError(
        "HELIUS_BATCH_TOO_LARGE",
        "parseTransactions accepts at most 100 signatures",
      );
    }
    const url = `${HELIUS_PARSE_BASE}/transactions?api-key=${this.apiKey}`;
    const res = await this.request(
      url,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ transactions: signatures }),
      },
      { count: signatures.length },
    );
    if (!res.ok) {
      throw new HeliusServerError(res.status, await res.text(), {
        count: signatures.length,
      });
    }
    return (await res.json()) as HeliusEnhancedTransaction[];
  }

  async getEpochInfo(): Promise<{ epoch: number; absoluteSlot: number; slotIndex: number }> {
    return this.rpcCall("getEpochInfo", []);
  }

  async getLeaderSchedule(
    firstSlotOfEpoch?: bigint,
  ): Promise<Record<string, number[]>> {
    const params = firstSlotOfEpoch !== undefined ? [Number(firstSlotOfEpoch)] : [];
    const result = await this.rpcCall<Record<string, number[]> | null>(
      "getLeaderSchedule",
      params,
    );
    return result ?? {};
  }

  async getVoteAccounts(): Promise<{
    current: Array<{ votePubkey: string; nodePubkey: string; activatedStake: number }>;
  }> {
    return this.rpcCall("getVoteAccounts", []);
  }

  async createWebhook(config: WebhookConfig): Promise<string> {
    const url = `https://api.helius.xyz/v0/webhooks?api-key=${this.apiKey}`;
    const res = await this.request(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(config),
    });
    if (!res.ok) {
      throw new HeliusServerError(res.status, await res.text(), { op: "createWebhook" });
    }
    const json = (await res.json()) as { webhookID: string };
    return json.webhookID;
  }

  async getWebhook(
    webhookId: string,
  ): Promise<{ webhookID: string; accountAddresses: string[] } & WebhookConfig> {
    const url = `https://api.helius.xyz/v0/webhooks/${webhookId}?api-key=${this.apiKey}`;
    const res = await this.request(url);
    if (!res.ok) {
      throw new HeliusServerError(res.status, await res.text(), { op: "getWebhook" });
    }
    return (await res.json()) as { webhookID: string; accountAddresses: string[] } & WebhookConfig;
  }

  async editWebhook(webhookId: string, patch: Partial<WebhookConfig>): Promise<void> {
    const url = `https://api.helius.xyz/v0/webhooks/${webhookId}?api-key=${this.apiKey}`;
    const res = await this.request(url, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(patch),
    });
    if (!res.ok) {
      throw new HeliusServerError(res.status, await res.text(), { op: "editWebhook" });
    }
  }

  async addWebhookAddresses(webhookId: string, addresses: string[]): Promise<void> {
    if (addresses.length === 0) return;
    const current = await this.getWebhook(webhookId);
    const next = Array.from(new Set([...(current.accountAddresses ?? []), ...addresses]));
    await this.editWebhook(webhookId, { accountAddresses: next });
  }

  async removeWebhookAddresses(webhookId: string, addresses: string[]): Promise<void> {
    if (addresses.length === 0) return;
    const current = await this.getWebhook(webhookId);
    const drop = new Set(addresses);
    const next = (current.accountAddresses ?? []).filter((a) => !drop.has(a));
    await this.editWebhook(webhookId, { accountAddresses: next });
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isRetryableNetworkError(err: unknown): boolean {
  if (err instanceof HeliusError) return false;
  if (err instanceof TypeError) return true;
  return false;
}
