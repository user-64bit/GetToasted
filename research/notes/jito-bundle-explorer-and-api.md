# Jito Bundle Explorer and API - Notes

Sources:
- https://explorer.jito.wtf/
- https://docs.jito.wtf/lowlatencytxnsend/

- Official Jito JSON-RPC exposes bundle methods under `/api/v1`, including `sendBundle`, `getBundleStatuses`, `getInflightBundleStatuses`, and `getTipAccounts`.
- `getBundleStatuses` is bundle-id based and returns transaction signatures, slot, confirmation status, and errors when available; `getInflightBundleStatuses` is explicitly recent-window status only.
- The Explorer frontend currently uses `https://bundles.jito.wtf/api/v1/bundles/transaction/{signature}` for signature-to-bundle lookup and `https://bundles.jito.wtf/api/v1/bundles/bundle/{bundleId}` for historical bundle details.
- Live check: the Helius Komeko victim signature `3k35bPRTDZssneWhpbEptK27JjXVGvsv9ZWWnCJvn8PNA5pgKSNpMACPnmh3ogPbgpHKuFDo9ZKzLipM9kXianVY` returned bundle `17232d2f4dd1164648bd70f31be26dbfbf9561a899dfd031fa568cf31f7435fd`; that bundle endpoint returned slot `307871111`, four signatures, and a `148236` lamport tip.
- Bundle membership is ordering evidence, not a sandwich label: many bundles are benign or arbitrage, and Jito's docs warn that uncled blocks can cause bundle transactions to appear on chain without normal bundle atomicity.
