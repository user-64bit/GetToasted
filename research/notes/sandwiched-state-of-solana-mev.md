# sandwiched.me State of Solana MEV - Notes

Source: https://sandwiched.me/research/state-of-solana-mev-may-2025-analysis

- Tight sandwiches are ordering-guaranteed attacks, either via Jito bundles or direct validator ordering, so the detector should keep "bundle ordered" and "adjacent in block" as explicit evidence layers.
- Wide, optimistic, or blind sandwiches are non-consecutive and can be sent tens to hundreds of milliseconds apart, so an adjacency-only detector will systematically miss them.
- The report's validator metric is sandwiches attributed divided by blocks produced, which means detections need durable slot leader attribution plus enough denominator context to compute validator rates later.
- Validator sandwich rates are highly skewed: most validators are low-rate, but some are extreme outliers. Validator evidence is useful for attribution and review, not sufficient as a victim-level detector by itself.
- The rise of wide sandwiches after anti-sandwich mechanisms means the classifier should treat tight bundle triples as high-confidence positives while still supporting lower-confidence same-slot non-adjacent patterns.
