# Joel Obafemi B91 Case Study - Notes

Source: https://medium.com/@joel_28760/breaking-down-mev-sandwich-attacks-on-solana-the-b91-bot-case-study-3e1c1ba35556

- The study begins from a known bot program (`B91piBSfCBRs5rUxCMRdJEGv7tNEnFxweWcdQJHJoFpi`) and uses sample transactions plus Jito Bundle Explorer to label front-run, victim, and back-run transactions.
- Bot-specific instruction prefixes can identify B91 front/back legs, but that approach should live in a known-bot matcher, not the primary detector, because it will not generalize.
- The SQL-style victim join uses same block plus front-run adjacency (`front_tx_index = victim_tx_index - 1`), which is a strong tight-sandwich signal and should feed an adjacency matcher.
- Profit is calculated as back-run output minus front-run input, then Jito tip is subtracted for net profit. That is a useful attacker-profit proxy, but it is not the same as CPMM victim counterfactual loss.
- The case study's pool analysis emphasizes PumpSwap/Pump.fun-style memecoin pools, so validation fixtures must include bonding-curve/memecoin attacks and not only Raydium constant-product pools.
