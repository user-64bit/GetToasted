# Helius Solana MEV Report - Notes

Source: https://www.helius.dev/blog/solana-mev-report

- Helius describes the canonical sandwich as an attacker front-run buy, the victim executing at a worse price, and an attacker back-run sell; detection should therefore look for a bracketing inventory round trip, not an isolated front-run.
- The example criteria include this short verbatim criterion: "The signer of the middle transaction is different from the first and last transactions." The other criteria require the same bought/sold token and a vulnerable illiquid/new token context.
- The `vpeNAL..oax38b` sandwich program is a major known-bot seed, but Helius also notes multiple sandwich programs and private mempool activity, so a registry can boost confidence but cannot be the detector.
- Jito bundles are strong ordering evidence, but Helius warns Jito data does not cover all MEV, especially alternative/private mempool activity. Bundle matching should be high confidence, not the only classifier.
- The Komeko example reports attacker profit in SOL. For user-facing loss, the product must distinguish true victim counterfactual loss from attacker-profit proxy and convert honestly to USD only when price data exists.
