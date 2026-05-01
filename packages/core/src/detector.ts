import { isKnownBot } from "./known-bots.js";
import type {
  ParsedSwap,
  SandwichCandidate,
  SandwichDetection,
} from "./types.js";

export type { ParsedSwap, SandwichCandidate, SandwichDetection } from "./types.js";

const DUST_INPUT_THRESHOLD = 1_000_000n;

function groupBy<T, K>(arr: T[], key: (t: T) => K): Map<K, T[]> {
  const out = new Map<K, T[]>();
  for (const item of arr) {
    const k = key(item);
    const bucket = out.get(k);
    if (bucket) bucket.push(item);
    else out.set(k, [item]);
  }
  return out;
}

function poolKey(s: ParsedSwap): string {
  return `${s.slot.toString()}:${s.pool}`;
}

export function scoreSandwich(
  candidate: SandwichCandidate,
  validatorVoteAccount: string | null,
): SandwichDetection {
  const { front, victim, back } = candidate;
  const tip = front.jitoTipLamports ?? back.jitoTipLamports ?? 0n;

  const failed = back.failed;
  const attackerProfitRaw = failed
    ? 0n
    : back.outputAmount - front.inputAmount - tip;

  const victimLossRaw = attackerProfitRaw > 0n ? attackerProfitRaw : 0n;
  const jitoBundled = front.jitoBundled || back.jitoBundled;

  const bot = isKnownBot(front.signer);

  let confidence = 0.7;
  if (jitoBundled) confidence += 0.2;
  if (bot) confidence += 0.1;
  if (failed) confidence -= 0.2;
  confidence = Math.max(0, Math.min(1, confidence));
  confidence = Math.round(confidence * 100) / 100;

  return {
    candidate,
    victimLossRaw,
    attackerProfitRaw,
    lossUsd: null,
    confidenceScore: confidence,
    validatorVoteAccount,
    isKnownBot: bot !== null,
    knownBotName: bot?.name ?? null,
    jitoBundled,
    failed,
  };
}

export function detectSandwichesInSlot(
  swaps: ParsedSwap[],
  validatorVoteAccount: string | null = null,
): SandwichDetection[] {
  if (swaps.length < 3) return [];

  const sorted = [...swaps].sort((a, b) => a.txIndexInBlock - b.txIndexInBlock);
  const byPool = groupBy(sorted, poolKey);
  const out: SandwichDetection[] = [];

  for (const poolSwaps of byPool.values()) {
    if (poolSwaps.length < 3) continue;

    for (let i = 0; i < poolSwaps.length - 2; i++) {
      const front = poolSwaps[i]!;
      if (front.failed) continue;
      if (front.inputAmount < DUST_INPUT_THRESHOLD) continue;

      for (let j = i + 1; j < poolSwaps.length - 1; j++) {
        const victim = poolSwaps[j]!;
        if (victim.signer === front.signer) continue;

        const sameDirAV =
          front.inputMint === victim.inputMint &&
          front.outputMint === victim.outputMint;
        if (!sameDirAV) continue;

        for (let k = j + 1; k < poolSwaps.length; k++) {
          const back = poolSwaps[k]!;
          if (back.signer !== front.signer) continue;
          if (back.pool !== front.pool) continue;

          const reversedBack =
            back.inputMint === front.outputMint &&
            back.outputMint === front.inputMint;
          if (!reversedBack) continue;

          const candidate: SandwichCandidate = {
            front,
            victim,
            back,
            pool: front.pool,
            slot: front.slot,
          };

          out.push(scoreSandwich(candidate, validatorVoteAccount));
        }
      }
    }
  }

  return out;
}

export function detectSandwichesAcrossSlots(
  swaps: ParsedSwap[],
  validatorBySlot: (slot: bigint) => string | null = () => null,
): SandwichDetection[] {
  const bySlot = groupBy(swaps, (s) => s.slot.toString());
  const out: SandwichDetection[] = [];
  for (const [slotStr, slotSwaps] of bySlot) {
    out.push(...detectSandwichesInSlot(slotSwaps, validatorBySlot(BigInt(slotStr))));
  }
  return out;
}
