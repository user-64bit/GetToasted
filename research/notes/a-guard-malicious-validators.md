# a-guard/malicious-validators - Notes

Source: https://github.com/a-guard/malicious-validators

- `find_sigs.py` starts from a known sandwicher signer (`Ec9xymGeMuURLQfpMsMPkEwy5ktAiQSaFSjF5oJ3kERa`) and collects successful signatures with slots, establishing a known-actor seed set.
- `filter_sigs.py` fetches raw transactions, drops transactions touching Jito tip accounts, and drops non-Raydium transactions, intentionally focusing on likely direct-validator or non-Jito Raydium sandwich activity.
- The core signal computes the non-WSOL Raydium authority token balance delta and groups by `slot -> mint -> absolute raw amount`.
- Keeping only groups with exactly two bot transactions captures the kinetic signature: the bot acquires X units of a token and later disposes of exactly X units in the same slot.
- `find_leaders.py` maps detected slots to block leaders using `getBlock` rewards; follow-up code maps identities/vote accounts/stake authority. Production should cache leader schedules instead of making uncached attribution calls per slot.
