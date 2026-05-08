# Jito DontFront - Notes

Sources:
- https://solana.com/developers/guides/advanced/mev-protection
- https://docs.jito.wtf/lowlatencytxnsend/

- DontFront works by adding any valid Solana public key beginning with `jitodontfront` as a read-only, non-signer account to an instruction; the account does not need to exist on chain.
- When the Jito block engine sees a transaction with that sentinel in a bundle, it requires the protected transaction to appear at index 0 or rejects the bundle.
- Multiple protected transactions can appear together only when they are contiguous at the front and satisfy signer-overlap rules; non-front protected transactions or disjoint protected signers are rejected.
- DontFront is scoped to the Jito block engine. It does not protect transactions submitted directly to validators, private mempools, or other ordering systems.
- Detector implication: a `jitodontfront` victim appearing between front/back legs is strong evidence of non-Jito ordering, an uncled-bundle edge case, or a protection bypass; it should be surfaced in metadata for review.
