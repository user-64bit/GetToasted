# Helius Enhanced Transactions and getTransactionsForAddress - Notes

Sources:
- https://www.helius.dev/docs/api-reference/enhanced-transactions/gettransactionsbyaddress
- https://www.helius.dev/docs/rpc/gettransactionsforaddress
- https://www.helius.dev/docs/billing/credits

- Enhanced Transactions by Address REST returns parsed history with fields such as `description`, `type`, `source`, `fee`, `feePayer`, `signature`, `slot`, `timestamp`, transfers, account balance changes, instructions, and `events.swap`; its visible schema does not include transaction index.
- Helius's exclusive `getTransactionsForAddress` RPC now documents `transactionIndex` as the zero-based index of the transaction within its block, and says this field is exclusive to gTFA among similar endpoints.
- gTFA costs 50 Helius credits per request and returns either 100 full transactions or 1,000 signatures; `getBlock` costs 1 historical-data credit.
- Even with `transactionIndex`, wallet scanning still needs `getBlock` for each relevant slot because gTFA only returns transactions related to the scanned wallet, not the attacker's bracketing transactions or all same-pool swaps in the block.
- Recommended scan usage: gTFA with `transactionDetails: "full"`, limit 100, `status: "succeeded"`, `tokenAccounts: "balanceChanged"`, `maxSupportedTransactionVersion: 0`, then block-level enrichment with `getBlock` using full transaction details and `jsonParsed` when possible.
