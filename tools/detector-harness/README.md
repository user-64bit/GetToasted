# Detector Harness

Standalone Phase 2 CLI for validating sandwich-detection ideas against real Solana blocks before production integration.

Usage:

```bash
pnpm harness analyze <signature>
pnpm harness analyze-block <slot>
pnpm harness analyze-wallet <wallet> --limit 50
```

For the canonical Helius Komeko fixture:

```bash
pnpm harness analyze 3k35bPRTDZssneWhpbEptK27JjXVGvsv9ZWWnCJvn8PNA5pgKSNpMACPnmh3ogPbgpHKuFDo9ZKzLipM9kXianVY --write-fixture
```
