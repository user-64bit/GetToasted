export type ParsedSwap = {
  signature: string;
  slot: number;
  txIndexInBlock: number;
  signer: string;
  pool: string;
  programId: string;
  inputMint: string;
  outputMint: string;
  inputAmount: bigint;
  outputAmount: bigint;
  jitoBundled: boolean;
  jitoTipLamports?: bigint;
  failed: boolean;
};

export type Sandwich = {
  slot: number;
  pool: string;
  attacker: string;
  victim: string;
  front: ParsedSwap;
  victimSwap: ParsedSwap;
  back: ParsedSwap;
  attackerProfitRaw: bigint; // in `inputMint` base units
  jitoBundled: boolean;
  confidence: number;
  failed: boolean;
};

function groupBy<T, K extends string>(arr: T[], key: (t: T) => K): Map<K, T[]> {
  const out = new Map<K, T[]>();
  for (const item of arr) {
    const k = key(item);
    const bucket = out.get(k) ?? [];
    bucket.push(item);
    out.set(k, bucket);
  }
  return out;
}

export function detectSandwichesInSlot(swaps: ParsedSwap[]): Sandwich[] {
  const sorted = [...swaps].sort((a, b) => a.txIndexInBlock - b.txIndexInBlock);
  const byPool = groupBy(sorted, (s) => `${s.slot}:${s.pool}` as const);
  const results: Sandwich[] = [];

  for (const [, poolSwaps] of byPool) {
    if (poolSwaps.length < 3) continue;

    for (let i = 0; i < poolSwaps.length - 2; i++) {
      for (let j = i + 1; j < poolSwaps.length - 1; j++) {
        for (let k = j + 1; k < poolSwaps.length; k++) {
          const front = poolSwaps[i]!;
          const victim = poolSwaps[j]!;
          const back = poolSwaps[k]!;

          const sameAttacker = front.signer === back.signer;
          const differentVictim = victim.signer !== front.signer;
          const sameDirAV =
            front.inputMint === victim.inputMint &&
            front.outputMint === victim.outputMint;
          const reversedBack =
            back.inputMint === front.outputMint &&
            back.outputMint === front.inputMint;

          if (sameAttacker && differentVictim && sameDirAV && reversedBack) {
            // Profit proxy: back.outputAmount - front.inputAmount - tip
            const profitRaw =
              back.outputAmount - front.inputAmount - (front.jitoTipLamports ?? 0n);

            results.push({
              slot: front.slot,
              pool: front.pool,
              attacker: front.signer,
              victim: victim.signer,
              front,
              victimSwap: victim,
              back,
              attackerProfitRaw: profitRaw,
              jitoBundled: front.jitoBundled || back.jitoBundled,
              confidence: 1.0,
              failed: back.failed,
            });
          }
        }
      }
    }
  }

  return results;
}

export function detectSandwichesAcrossSlots(swaps: ParsedSwap[]): Sandwich[] {
  const bySlot = groupBy(swaps, (s) => String(s.slot) as `${number}`);
  const all: Sandwich[] = [];
  for (const [, slotSwaps] of bySlot) {
    all.push(...detectSandwichesInSlot(slotSwaps));
  }
  return all;
}
