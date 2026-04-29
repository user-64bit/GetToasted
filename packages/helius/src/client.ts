const HELIUS_BASE = "https://api.helius.xyz/v0";

export type HeliusTokenTransfer = {
  fromUserAccount: string;
  toUserAccount: string;
  mint: string;
  tokenAmount: number;
};

export type HeliusNativeTransfer = {
  fromUserAccount: string;
  toUserAccount: string;
  amount: number;
};

export type HeliusSwapEvent = {
  nativeInput?: { account: string; amount: string };
  nativeOutput?: { account: string; amount: string };
  tokenInputs?: Array<{ userAccount: string; mint: string; rawTokenAmount: { tokenAmount: string } }>;
  tokenOutputs?: Array<{ userAccount: string; mint: string; rawTokenAmount: { tokenAmount: string } }>;
  tokenFees?: Array<{ userAccount: string; mint: string; rawTokenAmount: { tokenAmount: string } }>;
  nativeFees?: Array<{ account: string; amount: string }>;
  innerSwaps?: Array<{
    programInfo: { source: string; account: string; programName: string; instructionName: string };
    tokenInputs: Array<{ userAccount: string; mint: string; rawTokenAmount: { tokenAmount: string } }>;
    tokenOutputs: Array<{ userAccount: string; mint: string; rawTokenAmount: { tokenAmount: string } }>;
  }>;
};

export type HeliusParsedTx = {
  signature: string;
  slot: number;
  timestamp: number;
  feePayer: string;
  type: string; // SWAP | TRANSFER | UNKNOWN | ...
  source: string; // RAYDIUM | ORCA | JUPITER | ...
  fee: number;
  tokenTransfers?: HeliusTokenTransfer[];
  nativeTransfers?: HeliusNativeTransfer[];
  events?: {
    swap?: HeliusSwapEvent;
  };
  instructions?: Array<{
    accounts: string[];
    data: string;
    programId: string;
    innerInstructions: Array<{ accounts: string[]; data: string; programId: string }>;
  }>;
  transactionError: unknown | null;
};

export class HeliusClient {
  constructor(private apiKey: string) {}

  async getTransactionsForAddress(opts: {
    address: string;
    limit?: number; // 1–100
    before?: string;
    until?: string;
  }): Promise<HeliusParsedTx[]> {
    const params = new URLSearchParams({ "api-key": this.apiKey });
    if (opts.limit) params.set("limit", String(opts.limit));
    if (opts.before) params.set("before", opts.before);
    if (opts.until) params.set("until", opts.until);

    const url = `${HELIUS_BASE}/addresses/${opts.address}/transactions?${params}`;
    const res = await fetch(url);
    if (!res.ok) {
      throw new Error(`Helius getTransactionsForAddress failed: ${res.status} ${await res.text()}`);
    }
    return (await res.json()) as HeliusParsedTx[];
  }

  async getTransaction(signature: string): Promise<HeliusParsedTx | null> {
    const params = new URLSearchParams({ "api-key": this.apiKey });
    const url = `${HELIUS_BASE}/transactions/${signature}?${params}`;
    const res = await fetch(url);
    if (res.status === 404) return null;
    if (!res.ok) {
      throw new Error(`Helius getTransaction failed: ${res.status} ${await res.text()}`);
    }
    const data = (await res.json()) as HeliusParsedTx[];
    return data[0] ?? null;
  }
}
