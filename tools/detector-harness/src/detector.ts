import { DEX_PROGRAMS, KNOWN_SANDWICH_BOTS, PROGRAM_TO_DEX, SOL_MINT, WSOL_MINT } from "./constants.ts";
import type { HarnessDetection, JitoBundle, TokenDelta, TxSummary } from "./types.ts";

function abs(value: bigint): bigint {
  return value < 0n ? -value : value;
}

function formatTokenAmount(raw: bigint, decimals: number): string {
  const negative = raw < 0n;
  const value = negative ? -raw : raw;
  const scale = 10n ** BigInt(decimals);
  const whole = value / scale;
  const fraction = value % scale;
  const fractionText = fraction.toString().padStart(decimals, "0").replace(/0+$/, "");
  return `${negative ? "-" : ""}${whole.toString()}${fractionText ? `.${fractionText}` : ""}`;
}

function signer(summary: TxSummary): string {
  return summary.signers[0] ?? summary.feePayer;
}

type TokenDirection = "buy" | "sell";

function attackedTokenDeltas(summary: TxSummary, direction: TokenDirection, mint?: string): TokenDelta[] {
  return summary.tokenDeltas.filter((delta) => {
    if (delta.mint === WSOL_MINT) return false;
    if (mint && delta.mint !== mint) return false;
    return direction === "buy" ? delta.amount > 0n : delta.amount < 0n;
  });
}

function quoteCandidatesForOwner(params: {
  summary: TxSummary;
  owner: string | null;
  direction: "input" | "output";
  excludeMint: string;
}): TokenDelta[] {
  const candidates = params.summary.tokenDeltas.filter((delta) => {
    if (delta.mint === params.excludeMint) return false;
    if (params.owner && delta.owner !== params.owner) return false;
    return params.direction === "input" ? delta.amount < 0n : delta.amount > 0n;
  });

  return candidates.sort((a, b) => {
    if (a.mint === WSOL_MINT && b.mint !== WSOL_MINT) return -1;
    if (a.mint !== WSOL_MINT && b.mint === WSOL_MINT) return 1;
    return Number(abs(b.amount) - abs(a.amount));
  });
}

function quoteDeltaPair(front: TxSummary, back: TxSummary, frontToken: TokenDelta) {
  const frontQuotes = quoteCandidatesForOwner({
    summary: front,
    owner: frontToken.owner,
    direction: "input",
    excludeMint: frontToken.mint,
  });
  const backQuotes = quoteCandidatesForOwner({
    summary: back,
    owner: frontToken.owner,
    direction: "output",
    excludeMint: frontToken.mint,
  });

  for (const frontQuote of frontQuotes) {
    const backQuote = backQuotes.find((candidate) => candidate.mint === frontQuote.mint);
    if (backQuote) return { frontQuote, backQuote };
  }

  return null;
}

function poolSideQuoteDeltaPair(front: TxSummary, back: TxSummary, frontToken: TokenDelta) {
  const frontSign = frontToken.amount > 0n ? 1n : -1n;
  const frontQuotes = front.tokenDeltas
    .filter((delta) => delta.mint !== frontToken.mint && delta.amount * frontSign > 0n)
    .sort((a, b) => {
      if (a.mint === WSOL_MINT && b.mint !== WSOL_MINT) return -1;
      if (a.mint !== WSOL_MINT && b.mint === WSOL_MINT) return 1;
      return Number(abs(b.amount) - abs(a.amount));
    });
  const backQuotes = back.tokenDeltas
    .filter((delta) => delta.mint !== frontToken.mint && delta.amount * frontSign < 0n)
    .sort((a, b) => {
      if (a.mint === WSOL_MINT && b.mint !== WSOL_MINT) return -1;
      if (a.mint !== WSOL_MINT && b.mint === WSOL_MINT) return 1;
      return Number(abs(b.amount) - abs(a.amount));
    });

  for (const frontQuote of frontQuotes) {
    const backQuote = backQuotes.find((candidate) => candidate.mint === frontQuote.mint);
    if (backQuote) return { frontQuote, backQuote };
  }

  return null;
}

function lamportQuoteDeltaPair(front: TxSummary, back: TxSummary, owner: string | null) {
  if (!owner) return null;

  const frontLamports = front.lamportDeltas.find((delta) => delta.account === owner && delta.amount < 0n);
  const backLamports = back.lamportDeltas.find((delta) => delta.account === owner && delta.amount > 0n);
  if (!frontLamports || !backLamports) return null;

  return { frontLamports, backLamports };
}

function similarRoundTrip(frontAmount: bigint, backAmount: bigint): boolean {
  const larger = frontAmount > backAmount ? frontAmount : backAmount;
  const diff = abs(frontAmount - backAmount);
  return diff * 100n <= larger;
}

function oppositeDirection(direction: TokenDirection): TokenDirection {
  return direction === "buy" ? "sell" : "buy";
}

function sameOwner(left: string | null, right: string | null): boolean {
  return left === right || !left || !right;
}

function pickDex(summaries: TxSummary[]): string {
  for (const summary of summaries) {
    if (summary.dex !== "unknown") return summary.dex;
  }

  return "unknown";
}

function pickProgramId(summaries: TxSummary[], dex: string): string | null {
  if (dex !== "unknown") {
    return DEX_PROGRAMS[dex as keyof typeof DEX_PROGRAMS] ?? null;
  }

  for (const summary of summaries) {
    for (const program of summary.programs) {
      if (PROGRAM_TO_DEX.has(program)) return program;
    }
  }

  return null;
}

function pickQuoteMint(front: TxSummary, back: TxSummary, frontToken: TokenDelta): string | null {
  const quotePair = quoteDeltaPair(front, back, frontToken) ?? poolSideQuoteDeltaPair(front, back, frontToken);
  if (quotePair && "frontQuote" in quotePair) {
    return quotePair.frontQuote.mint === WSOL_MINT ? SOL_MINT : quotePair.frontQuote.mint;
  }

  const frontSign = frontToken.amount > 0n ? -1n : 1n;
  const candidate = front.tokenDeltas
    .filter((delta) => delta.mint !== frontToken.mint && delta.amount * frontSign > 0n)
    .sort((a, b) => Number(abs(b.amount) - abs(a.amount)))[0];

  return candidate ? (candidate.mint === WSOL_MINT ? SOL_MINT : candidate.mint) : null;
}

function poolKey(params: { dex: string; programId: string | null; attackedMint: string; quoteMint: string | null }): string {
  if (params.dex === "pumpfun_bonding") return `pumpfun_bonding:${params.attackedMint}`;

  const namespace = params.programId ?? params.dex;
  if (!params.quoteMint) return `${namespace}:${params.attackedMint}:unknown`;
  const [a, b] =
    params.attackedMint < params.quoteMint
      ? [params.attackedMint, params.quoteMint]
      : [params.quoteMint, params.attackedMint];
  return `${namespace}:${a}-${b}`;
}

function knownBotMatch(attacker: string): HarnessDetection["knownBotMatch"] {
  const registryName = KNOWN_SANDWICH_BOTS.get(attacker) ?? null;
  return {
    matched: registryName !== null,
    registryName,
    registryAddress: registryName ? attacker : null,
  };
}

function detectionLoss(front: TxSummary, back: TxSummary, frontToken: TokenDelta, bundle: JitoBundle | null) {
  const quotePair = quoteDeltaPair(front, back, frontToken);

  if (!quotePair) {
    const poolQuotePair = poolSideQuoteDeltaPair(front, back, frontToken);
    if (poolQuotePair) {
      const { frontQuote, backQuote } = poolQuotePair;
      const proxyRaw = abs(backQuote.amount) - abs(frontQuote.amount) + BigInt(bundle?.landedTipLamports ?? 0);

      return {
        method: "backrun-proxy" as const,
        confidence: 0.6,
        victimActualOutput: null,
        victimCounterfactualOutput: null,
        lossInOutputToken: null,
        outputTokenMint: frontToken.mint,
        outputTokenDecimals: frontToken.decimals,
        lossInProxyToken: {
          amount: proxyRaw.toString(),
          mint: backQuote.mint === WSOL_MINT ? SOL_MINT : backQuote.mint,
          usdPrice: null,
        },
        lossUsd: null,
        outputTokenPriceAtSlot: null,
        notes: bundle
          ? "bundle proxy from pool-side quote-token flow plus landed tip"
          : "same-slot proxy from pool-side quote-token flow; no Jito tip observed",
      };
    }

    const lamportPair = lamportQuoteDeltaPair(front, back, frontToken.owner);
    if (lamportPair) {
      const proxyRaw =
        lamportPair.backLamports.amount - abs(lamportPair.frontLamports.amount) + BigInt(bundle?.landedTipLamports ?? 0);

      return {
        method: "backrun-proxy" as const,
        confidence: 0.65,
        victimActualOutput: null,
        victimCounterfactualOutput: null,
        lossInOutputToken: null,
        outputTokenMint: frontToken.mint,
        outputTokenDecimals: frontToken.decimals,
        lossInProxyToken: {
          amount: proxyRaw.toString(),
          mint: SOL_MINT,
          usdPrice: null,
        },
        lossUsd: null,
        outputTokenPriceAtSlot: null,
        notes: bundle
          ? "bundle proxy: landed tip plus back-run lamport gain minus front-run lamport spend"
          : "same-slot proxy: back-run lamport gain minus front-run lamport spend; no Jito tip observed",
      };
    }

    return {
      method: "backrun-proxy" as const,
      confidence: 0.4,
      victimActualOutput: null,
      victimCounterfactualOutput: null,
      lossInOutputToken: null,
      outputTokenMint: frontToken.mint,
      outputTokenDecimals: frontToken.decimals,
      lossInProxyToken: null,
      lossUsd: null,
      outputTokenPriceAtSlot: null,
      notes: "proxy loss unavailable because quote-token flow could not be isolated",
    };
  }

  const { frontQuote, backQuote } = quotePair;
  const proxyRaw = backQuote.amount - abs(frontQuote.amount) + BigInt(bundle?.landedTipLamports ?? 0);

  return {
    method: "backrun-proxy" as const,
    confidence: 0.7,
    victimActualOutput: null,
    victimCounterfactualOutput: null,
    lossInOutputToken: null,
    outputTokenMint: frontToken.mint,
    outputTokenDecimals: frontToken.decimals,
    lossInProxyToken: {
      amount: proxyRaw.toString(),
      mint: backQuote.mint === WSOL_MINT ? SOL_MINT : backQuote.mint,
      usdPrice: null,
    },
    lossUsd: null,
    outputTokenPriceAtSlot: null,
    notes: bundle
      ? "bundle proxy: landed tip plus back-run WSOL output minus front-run WSOL input"
      : "same-slot proxy: back-run WSOL output minus front-run WSOL input; no Jito tip observed",
  };
}

function buildDetection(params: {
  classifier: HarnessDetection["classifier"];
  confidence: number;
  slot: number;
  bundle: JitoBundle | null;
  front: TxSummary;
  victim: TxSummary;
  back: TxSummary;
  frontToken: TokenDelta;
  victimToken: TokenDelta;
  backToken: TokenDelta;
  rules: string[];
  penalties?: string[];
}): HarnessDetection {
  const frontSigner = signer(params.front);
  const victimSigner = signer(params.victim);
  const backSigner = signer(params.back);
  const dex = pickDex([params.front, params.victim, params.back]);
  const quoteMint = pickQuoteMint(params.front, params.back, params.frontToken);
  const programId = pickProgramId([params.front, params.victim, params.back], dex);
  const pool = poolKey({
    dex,
    programId,
    attackedMint: params.frontToken.mint,
    quoteMint,
  });

  return {
    classifier: params.classifier,
    confidence: params.confidence,
    status: params.confidence >= 0.8 ? "confirmed" : "suspected",
    slot: params.slot,
    bundleId: params.bundle?.bundleId ?? null,
    attacker: frontSigner,
    frontRun: { signature: params.front.signature, signer: frontSigner, txIndex: params.front.txIndex },
    victim: { signature: params.victim.signature, signer: victimSigner, txIndex: params.victim.txIndex },
    backRun: { signature: params.back.signature, signer: backSigner, txIndex: params.back.txIndex },
    pool,
    dex,
    attackedMint: params.frontToken.mint,
    quoteMint,
    knownBotMatch: knownBotMatch(frontSigner),
    frontTokenAmount: abs(params.frontToken.amount).toString(),
    victimTokenAmount: abs(params.victimToken.amount).toString(),
    backTokenAmount: abs(params.backToken.amount).toString(),
    scoring: { rules: params.rules, penalties: params.penalties ?? [] },
    loss: detectionLoss(params.front, params.back, params.frontToken, params.bundle),
  };
}

export function detectAdjacencySandwiches(params: {
  slot: number;
  summaries: TxSummary[];
  onlyVictimSignatures?: Set<string>;
}): HarnessDetection[] {
  const landed = params.summaries
    .filter((summary) => !summary.err)
    .sort((a, b) => a.txIndex - b.txIndex);
  const detections: HarnessDetection[] = [];

  for (let victimIndex = 1; victimIndex < landed.length - 1; victimIndex += 1) {
    const victim = landed[victimIndex]!;
    if (params.onlyVictimSignatures && !params.onlyVictimSignatures.has(victim.signature)) continue;

    const front = landed[victimIndex - 1]!;
    const back = landed[victimIndex + 1]!;
    const frontSigner = signer(front);
    const victimSigner = signer(victim);
    const backSigner = signer(back);
    if (frontSigner !== backSigner || frontSigner === victimSigner) continue;

    const frontCandidates = [
      ...attackedTokenDeltas(front, "buy").map((delta) => ({ delta, direction: "buy" as const })),
      ...attackedTokenDeltas(front, "sell").map((delta) => ({ delta, direction: "sell" as const })),
    ];

    for (const { delta: frontToken, direction } of frontCandidates) {
      const victimToken = attackedTokenDeltas(victim, direction, frontToken.mint)[0];
      if (!victimToken) continue;

      const backToken = attackedTokenDeltas(back, oppositeDirection(direction), frontToken.mint).find((candidate) =>
        sameOwner(frontToken.owner, candidate.owner),
      );
      if (!backToken) continue;

      const tolerance = (abs(frontToken.amount) * 95n) / 100n;
      if (abs(backToken.amount) < tolerance) continue;

      const rules = [
        "front/victim/back are adjacent landed transactions in block order",
        "front-run and back-run share the same signer",
        "victim signer differs from attacker signer",
        "victim touches the same attacked mint in the same direction as the front-run",
        "back-run reverses the attacked mint and sells through at least 95% of the front-run amount",
      ];
      const penalties: string[] = [];
      const dex = pickDex([front, victim, back]);
      let confidence = 0.9;
      if (dex !== "unknown") {
        confidence = 0.92;
        rules.push("tracked DEX program observed in the transaction group");
      } else {
        penalties.push("DEX program could not be inferred from parsed instructions");
      }

      detections.push(
        buildDetection({
          classifier: "adjacency",
          confidence,
          slot: params.slot,
          bundle: null,
          front,
          victim,
          back,
          frontToken,
          victimToken,
          backToken,
          rules,
          penalties,
        }),
      );
    }
  }

  return detections;
}

export function detectBundleSandwiches(params: {
  block: any;
  summaries: TxSummary[];
  bundle: JitoBundle;
}): HarnessDetection[] {
  const bySignature = new Map(params.summaries.map((summary) => [summary.signature, summary]));
  const ordered = params.bundle.txSignatures.map((signature) => bySignature.get(signature)).filter(Boolean) as TxSummary[];
  const detections: HarnessDetection[] = [];

  for (let i = 0; i < ordered.length - 2; i += 1) {
    for (let j = i + 1; j < ordered.length - 1; j += 1) {
      for (let k = j + 1; k < ordered.length; k += 1) {
        const front = ordered[i]!;
        const victim = ordered[j]!;
        const back = ordered[k]!;
        const frontSigner = signer(front);
        const victimSigner = signer(victim);
        const backSigner = signer(back);
        const rules: string[] = ["transactions share Jito bundle membership"];
        const penalties: string[] = [];

        if (frontSigner !== backSigner) continue;
        rules.push("front-run and back-run share the same signer");

        if (frontSigner === victimSigner) continue;
        rules.push("victim signer differs from attacker signer");

        const frontBuys = attackedTokenDeltas(front, "buy");
        for (const frontToken of frontBuys) {
          const victimBuy = attackedTokenDeltas(victim, "buy", frontToken.mint)[0];
          if (!victimBuy) continue;

          const backSell = attackedTokenDeltas(back, "sell", frontToken.mint).find((delta) => {
            return delta.owner === frontToken.owner && similarRoundTrip(abs(frontToken.amount), abs(delta.amount));
          });
          if (!backSell) continue;

          rules.push("front and victim buy the same attacked mint");
          rules.push("back-run sells the same attacked mint from the attacker owner");
          rules.push("attacker token round trip is within 1% of front-run amount");

          let confidence = 0.95;
          if (front.txIndex + 1 === victim.txIndex && victim.txIndex + 1 === back.txIndex) {
            confidence = 0.97;
            rules.push("front/victim/back are adjacent in block order");
          }

          detections.push(
            buildDetection({
              classifier: "bundle",
              confidence,
              slot: params.bundle.slot,
              bundle: params.bundle,
              front,
              victim,
              back,
              frontToken,
              victimToken: victimBuy,
              backToken: backSell,
              rules,
              penalties,
            }),
          );
        }
      }
    }
  }

  return detections;
}

export function detectCoinFlowSandwiches(params: {
  slot: number;
  summaries: TxSummary[];
  onlyVictimSignatures?: Set<string>;
}): HarnessDetection[] {
  const landed = params.summaries
    .filter((summary) => !summary.err)
    .sort((a, b) => a.txIndex - b.txIndex);
  const detections: HarnessDetection[] = [];

  for (let frontIndex = 0; frontIndex < landed.length - 2; frontIndex += 1) {
    const front = landed[frontIndex]!;
    const frontSigner = signer(front);
    const frontCandidates = [
      ...attackedTokenDeltas(front, "buy").map((delta) => ({ delta, direction: "buy" as const })),
      ...attackedTokenDeltas(front, "sell").map((delta) => ({ delta, direction: "sell" as const })),
    ];

    for (const { delta: frontToken, direction: frontDirection } of frontCandidates) {
      const backDirection = oppositeDirection(frontDirection);

      for (let backIndex = frontIndex + 2; backIndex < landed.length; backIndex += 1) {
        const back = landed[backIndex]!;
        const backSigner = signer(back);
        if (frontSigner !== backSigner) continue;

        const backToken = attackedTokenDeltas(back, backDirection, frontToken.mint).find((candidate) => {
          return (
            sameOwner(frontToken.owner, candidate.owner) &&
            abs(candidate.amount) === abs(frontToken.amount)
          );
        });
        if (!backToken) continue;

        for (let victimIndex = frontIndex + 1; victimIndex < backIndex; victimIndex += 1) {
          const victim = landed[victimIndex]!;
          const victimSigner = signer(victim);
          if (victimSigner === frontSigner) continue;
          if (params.onlyVictimSignatures && !params.onlyVictimSignatures.has(victim.signature)) {
            continue;
          }

          const victimToken = attackedTokenDeltas(victim, frontDirection, frontToken.mint)[0];
          if (!victimToken) continue;

          const adjacent = front.txIndex + 1 === victim.txIndex && victim.txIndex + 1 === back.txIndex;
          const wide = !adjacent;
          const rules = [
            "same-slot attacker token inventory round trip",
            "front-run and back-run share the same signer",
            "front-run and back-run have identical raw token-flow magnitude",
            "victim signer differs from attacker signer",
            "victim touches the same mint in the same direction as the front-run",
          ];
          const penalties: string[] = [];
          let confidence = adjacent ? 0.9 : 0.76;

          if (adjacent) {
            rules.push("front/victim/back are adjacent in block order");
            if (pickDex([front, victim, back]) !== "unknown") confidence = 0.92;
          }
          if (wide) {
            const frontDistance = victim.txIndex - front.txIndex;
            const backDistance = back.txIndex - victim.txIndex;
            if (pickDex([front, victim, back]) !== "unknown") confidence += 0.01;
            if (frontDistance <= 5) confidence += 0.01;
            if (backDistance <= 20) confidence += 0.01;
            confidence = Math.min(confidence, 0.79);
            penalties.push("wide same-slot sandwich without bundle evidence is capped below confirmed");
          }

          detections.push(
            buildDetection({
              classifier: adjacent ? "adjacency" : "coin-flow",
              confidence,
              slot: params.slot,
              bundle: null,
              front,
              victim,
              back,
              frontToken,
              victimToken,
              backToken,
              rules,
              penalties,
            }),
          );
        }
      }
    }
  }

  return detections;
}

export function detectStatisticalWindowSandwiches(params: {
  fromSlot: number;
  toSlot: number;
  summaries: TxSummary[];
  onlyVictimSignatures?: Set<string>;
}): HarnessDetection[] {
  const landed = params.summaries
    .filter((summary) => !summary.err)
    .sort((a, b) => a.slot - b.slot || a.txIndex - b.txIndex);
  const detections: HarnessDetection[] = [];

  for (let frontIndex = 0; frontIndex < landed.length - 2; frontIndex += 1) {
    const front = landed[frontIndex]!;
    const frontSigner = signer(front);
    const frontCandidates = [
      ...attackedTokenDeltas(front, "buy").map((delta) => ({ delta, direction: "buy" as const })),
      ...attackedTokenDeltas(front, "sell").map((delta) => ({ delta, direction: "sell" as const })),
    ];

    for (const { delta: frontToken, direction: frontDirection } of frontCandidates) {
      const backDirection = oppositeDirection(frontDirection);

      for (let backIndex = frontIndex + 2; backIndex < landed.length; backIndex += 1) {
        const back = landed[backIndex]!;
        if (back.slot === front.slot) continue;
        if (back.slot > front.slot + 2) break;

        const backSigner = signer(back);
        if (frontSigner !== backSigner) continue;

        const backToken = attackedTokenDeltas(back, backDirection, frontToken.mint).find((candidate) => {
          return sameOwner(frontToken.owner, candidate.owner) && abs(candidate.amount) === abs(frontToken.amount);
        });
        if (!backToken) continue;

        for (let victimIndex = frontIndex + 1; victimIndex < backIndex; victimIndex += 1) {
          const victim = landed[victimIndex]!;
          const victimSigner = signer(victim);
          if (victimSigner === frontSigner) continue;
          if (params.onlyVictimSignatures && !params.onlyVictimSignatures.has(victim.signature)) {
            continue;
          }

          const victimToken = attackedTokenDeltas(victim, frontDirection, frontToken.mint)[0];
          if (!victimToken) continue;

          detections.push(
            buildDetection({
              classifier: "statistical",
              confidence: 0.68,
              slot: victim.slot,
              bundle: null,
              front,
              victim,
              back,
              frontToken,
              victimToken,
              backToken,
              rules: [
                "cross-slot attacker token inventory round trip",
                "front-run and back-run share the same signer",
                "front-run and back-run have identical raw token-flow magnitude",
                "victim signer differs from attacker signer",
                "victim touches the same mint in the same direction as the front-run",
                "front/back window is bounded to two slots",
              ],
              penalties: [
                "pure statistical cross-slot sandwich without bundle or validator evidence is capped below confirmed",
              ],
            }),
          );
        }
      }
    }
  }

  return detections;
}

export function renderDetection(detection: HarnessDetection): string {
  const lossProxy = detection.loss.lossInProxyToken;
  const lossText = lossProxy
    ? lossProxy.mint === SOL_MINT
      ? `${formatTokenAmount(BigInt(lossProxy.amount), 9)} SOL proxy${detection.loss.lossUsd === null ? "" : ` (~$${detection.loss.lossUsd.toFixed(2)})`}`
      : `${lossProxy.amount} ${lossProxy.mint} proxy`
    : "unknown";

  return [
    `classifier=${detection.classifier} confidence=${detection.confidence.toFixed(2)} status=${detection.status}`,
    `bundle=${detection.bundleId ?? "none"} slot=${detection.slot}`,
    `front=${detection.frontRun.signature} @${detection.frontRun.txIndex}`,
    `victim=${detection.victim.signature} @${detection.victim.txIndex}`,
    `back=${detection.backRun.signature} @${detection.backRun.txIndex}`,
    `attacker=${detection.attacker}`,
    `knownBot=${detection.knownBotMatch.matched ? `yes (${detection.knownBotMatch.registryName})` : "no"}`,
    `pool=${detection.pool}`,
    `dex=${detection.dex}`,
    `mint=${detection.attackedMint}`,
    `quoteMint=${detection.quoteMint ?? "unknown"}`,
    `loss=${lossText}`,
    "rules:",
    ...detection.scoring.rules.map((rule) => `  - ${rule}`),
  ].join("\n");
}
