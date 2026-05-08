import { getHeliusRpcUrl } from "./env.ts";

export async function heliusRpc<T>(method: string, params: unknown[]): Promise<T> {
  const response = await fetch(getHeliusRpcUrl(), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
  });

  const json = (await response.json()) as {
    result?: T;
    error?: { code: number; message: string };
  };

  if (!response.ok || json.error) {
    throw new Error(`${method} failed: ${json.error?.message ?? response.statusText}`);
  }

  return json.result as T;
}

export async function getTransaction(signature: string): Promise<any> {
  return heliusRpc("getTransaction", [
    signature,
    { encoding: "jsonParsed", maxSupportedTransactionVersion: 0 },
  ]);
}

export async function getBlock(slot: number): Promise<any> {
  return heliusRpc("getBlock", [
    slot,
    {
      encoding: "jsonParsed",
      transactionDetails: "full",
      rewards: true,
      maxSupportedTransactionVersion: 0,
    },
  ]);
}

export async function getSignaturesForAddress(address: string, limit: number): Promise<any[]> {
  const signatures: any[] = [];
  let before: string | undefined;

  while (signatures.length < limit) {
    const pageLimit = Math.min(1000, limit - signatures.length);
    const page = await heliusRpc<any[]>("getSignaturesForAddress", [
      address,
      { limit: pageLimit, ...(before ? { before } : {}) },
    ]);

    if (!page.length) break;
    signatures.push(...page);
    before = page.at(-1)?.signature;
  }

  return signatures;
}
