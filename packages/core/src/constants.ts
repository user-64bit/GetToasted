// DEX program IDs
export const TRACKED_DEX_PROGRAMS = {
  RAYDIUM_AMM_V4: "675kPX9MHTjS2zt1qfr1NYHuzeLXfQM9H24wFSUt1Mp8",
  RAYDIUM_CLMM: "CAMMCzo5YL8w4VFF8KVHrK22GGUsp5VTaW7grrKgrWqK",
  RAYDIUM_CPMM: "CPMMoo8L3F4NbTegBCKVNunggL7H1ZpdTHKxQB5qKP1C",
  ORCA_WHIRLPOOL: "whirLbMiicVdio4qvUfM5KAg6Ct8VwpYzGff3uctyCc",
  METEORA_DLMM: "LBUZKhRxPF3XUpBCjp4YzTKgLccjZhTSDM9YuVaPwxo",
  METEORA_DAMM_V2: "cpamdpZCGKUy5JxQXB4dcpGPiikHawvSWAd6mEn1sGG",
  PHOENIX: "PhoeNiXZ8ByJGLkxNfZRnkUfjvmuYqLR89jjFHGqdXY",
  PUMPSWAP: "pAMMBay6oceH9fJKBRHGP5D4bD4sWpmSwMn52FMfXEA",
  PUMPFUN_BONDING: "6EF8rrecthR5Dkzon8Nwu78hRvfCKubJ14M5uBEwF6P",
  LIFINITY_V2: "2wT8Yq49kHgDzXuPxZSaeLaH1qbmGXtEyPy64bL7aD3c",
} as const;

export const TRACKED_DEX_PROGRAM_IDS = new Set(Object.values(TRACKED_DEX_PROGRAMS));

// Jito tip accounts
export const JITO_TIP_ACCOUNTS_INITIAL = new Set([
  "96gYZGLnJYVFmbjzopPSU6QiEV5fGqZNyN9nmNhvrZU5",
  "HFqU5x63VTqvQss8hp11i4wVV8bD44PvwucfZ2bU7gRe",
  "Cw8CFyM9FkoMi7K7Crf6HNQqf4uEMzpKw6QNghXLvLkY",
  "ADaUMid9yfUytqMBgopwjb2DTLSokTSzL1zt6iGPaS",
]);

// Known sandwich bots
export const KNOWN_SANDWICH_BOTS: Record<string, { name: string; confidence: number; program?: boolean }> = {
  "9973hWbcumZNeKd4UxW1wT892rcdHQNwjfnz8KwzyWp6": { name: "arsc-cold", confidence: 1.0 },
  "Ai4zqY7gjyAPhtUsGnCfabM5oHcZLt3htjpSoUKvxkkt": { name: "arsc-active", confidence: 1.0 },
  "B91piBSfCBRs5rUxCMRdJEGv7tNEnFxweWcdQJHJoFpi": { name: "B91", confidence: 1.0, program: true },
};
