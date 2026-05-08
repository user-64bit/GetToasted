export const WSOL_MINT = "So11111111111111111111111111111111111111112";

export const JITO_TIP_ACCOUNTS = new Set([
  "3AVi9Tg9Uo68tJfuvoKvqKNWKkC5wPdSSdeBnizKZ6jT",
  "DfXygSm4jCyNCybVYYK6DwvWqjKee8pbDmJGcLWNDXjh",
  "HFqU5x63VTqvQss8hp11i4wVV8bD44PvwucfZ2bU7gRe",
  "ADaUMid9yfUytqMBgopwjb2DTLSokTSzL1zt6iGPaS49",
  "ADuUkR4vqLUMWXxW9gh6D6L8pMSawimctcNZ5pGwDcEt",
  "DttWaMuVvTiduZRnguLF7jNxTgiMBZ1hyAumKUiL2KRL",
  "Cw8CFyM9FkoMi7K7Crf6HNQqf4uEMzpKw6QNghXLvLkY",
  "96gYZGLnJYVFmbjzopPSU6QiEV5fGqZNyN9nmNhvrZU5",
]);

export const SOL_MINT = WSOL_MINT;

export const DEX_PROGRAMS = {
  raydium_amm_v4: "675kPX9MHTjS2zt1qfr1NYHuzeLXfQM9H24wFSUt1Mp8",
  raydium_clmm: "CAMMCzo5YL8w4VFF8KVHrK22GGUsp5VTaW7grrKgrWqK",
  raydium_cpmm: "CPMMoo8L3F4NbTegBCKVNunggL7H1ZpdTHKxQB5qKP1C",
  orca_whirlpool: "whirLbMiicVdio4qvUfM5KAg6Ct8VwpYzGff3uctyCc",
  meteora_dlmm: "LBUZKhRxPF3XUpBCjp4YzTKgLccjZhTSDM9YuVaPwxo",
  meteora_damm_v2: "cpamdpZCGKUy5JxQXB4dcpGPiikHawvSWAd6mEn1sGG",
  phoenix: "PhoeNiXZ8ByJGLkxNfZRnkUfjvmuYqLR89jjFHGqdXY",
  pumpswap: "pAMMBay6oceH9fJKBRHGP5D4bD4sWpmSwMn52FMfXEA",
  pumpfun_bonding: "6EF8rrecthR5Dkzon8Nwu78hRvfCKubJ14M5uBEwF6P",
  lifinity_v2: "2wT8Yq49kHgDzXuPxZSaeLaH1qbmGXtEyPy64bL7aD3c",
} as const;

export type DexName = keyof typeof DEX_PROGRAMS | "unknown";

export const PROGRAM_TO_DEX = new Map<string, DexName>(
  Object.entries(DEX_PROGRAMS).map(([dex, programId]) => [programId, dex as DexName]),
);

export const KNOWN_SANDWICH_BOTS = new Map<string, string>([
  ["9973hWbcumZNeKd4UxW1wT892rcdHQNwjfnz8KwzyWp6", "arsc-cold"],
  ["Ai4zqY7gjyAPhtUsGnCfabM5oHcZLt3htjpSoUKvxkkt", "arsc-active"],
  ["BCbrpBpttAvwJBhJiXUcptyW9rRVWMcHFJzr6vi58q", "arsc-warm-unverified"],
  ["B91piBSfCBRs5rUxCMRdJEGv7tNEnFxweWcdQJHJoFpi", "b91"],
  ["vpeNALD85GyYAcK4ms5kKqfJrJxVQuCwf24gWjNoax38b", "deeznode-vpe-registry"],
  ["vpeNALD89BZ4KxNUFjdLmFXBCwtyqBDQ85ouNoax38b", "deeznode-vpe-user-supplied"],
]);
