// Jito tip account membership. Seed list is the four well-known accounts;
// runtime callers can hydrate the remaining four via Jito's
// /api/v1/getTipAccounts and pass the resulting Set into isJitoTipTransfer.
export const JITO_TIP_ACCOUNTS_SEED: ReadonlySet<string> = new Set([
  "96gYZGLnJYVFmbjzopPSU6QiEV5fGqZNyN9nmNhvrZU5",
  "HFqU5x63VTqvQss8hp11i4wVV8bD44PvwucfZ2bU7gRe",
  "Cw8CFyM9FkoMi7K7Crf6HNQqf4uEMzpKw6QNghXLvLkY",
  "ADaUMid9yfUytqMBgopwjb2DTLSokTSzL1zt6iGPaS49",
  "DfXygSm4jCyNCybVYYK6DwvWqjKee8pbDmJGcLWNDXjh",
  "ADuUkR4vqLUMWXxW9gh6D6L8pivKeVBBJjuXAvZ8grys",
  "DttWaMuVvTiduZRnguLF7jNxTgiMBZ1hyAumKUiL2KRL",
  "3AVi9Tg9Uo68tJfuvoKvqKNWKkC5wPdSSdeBnizKZ6jT",
]);

export function isJitoTipTransfer(
  toAddress: string,
  tipAccounts: ReadonlySet<string> = JITO_TIP_ACCOUNTS_SEED,
): boolean {
  return tipAccounts.has(toAddress);
}
