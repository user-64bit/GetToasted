import { z } from "zod";

export const SolanaAddressSchema = z
  .string()
  .regex(/^[1-9A-HJ-NP-Za-km-z]{32,44}$/, "invalid solana address");

export const ScanRequestSchema = z.object({
  address: SolanaAddressSchema,
});

export const SimulateRequestSchema = z.object({
  wallet: SolanaAddressSchema,
  inputMint: SolanaAddressSchema,
  outputMint: SolanaAddressSchema,
  amount: z.string().regex(/^\d+$/, "amount must be a u64 string"),
});

export const SiwsVerifySchema = z.object({
  address: SolanaAddressSchema,
  signature: z.string(),
  signedMessage: z.string(),
  nonce: z.string().min(16),
});

export type ScanRequest = z.infer<typeof ScanRequestSchema>;
export type SimulateRequest = z.infer<typeof SimulateRequestSchema>;
