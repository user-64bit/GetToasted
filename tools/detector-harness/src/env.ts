import "dotenv/config";

export function getHeliusRpcUrl(): string {
  if (process.env.HELIUS_RPC_URL) return process.env.HELIUS_RPC_URL;
  if (!process.env.HELIUS_API_KEY) {
    throw new Error("HELIUS_API_KEY or HELIUS_RPC_URL is required");
  }

  return `https://mainnet.helius-rpc.com/?api-key=${process.env.HELIUS_API_KEY}`;
}
