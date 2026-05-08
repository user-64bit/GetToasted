import { mkdir, readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import {
  detectSandwichesForWalletSwaps,
  isSandwichShape,
  type JitoBundleInfo,
  type JitoBundleResolver,
  type ParsedSwap,
  type SandwichDetection,
} from "@get-toasted/core";
import {
  HeliusClient,
  parseHeliusTxToSwaps,
  type HeliusBlock,
  type HeliusBlockTransaction,
  type HeliusEnhancedTransaction,
} from "@get-toasted/helius";
import { TRACKED_DEX_PROGRAM_IDS } from "@get-toasted/core";
import { getJitoBundleForSignature } from "./jito.ts";
import { getSignaturesForAddress } from "./rpc.ts";

const PARSE_BATCH = 100;

/**
 * Ground truth comes from two independent sources, intersected:
 *
 *   - Jito bundle membership — mechanical, verifiable, covers tight
 *     bundled sandwiches. For each wallet signature in a Jito bundle of
 *     size ≥3, we apply isSandwichShape against neighbouring same-pool
 *     swaps. If the shape predicate passes, the swap is a confirmed
 *     ground-truth positive regardless of whether our detector flagged it.
 *
 *   - User-pasted sandwiched.me listings — written to
 *     research/ground-truth/{wallet}.json by the operator after they
 *     check the wallet on sandwiched.me. Optional; loaded if the file
 *     exists, ignored otherwise.
 *
 * The harness explicitly does NOT trust its own production detector to
 * generate ground truth — that would be circular. Both sources above
 * are external to the algorithm under test.
 */
type GroundTruthAttack = {
  slot: number;
  victimSignature: string;
  attackerSignature?: string;
  attacker?: string;
  source: "jito-bundle" | "user-pasted";
  evidence?: unknown;
};

type WalletSwapSummary = {
  signature: string;
  slot: string;
  txIndexInBlock: number;
  pool: string;
  dex: string;
  programId: string;
  inputMint: string;
  outputMint: string;
  inputAmount: string;
  outputAmount: string;
  jitoBundled: boolean;
  jitoTipLamports: string | null;
  sameSlotSwapCount: number;
  samePoolSwapCount: number;
};

type ValidateWalletReport = {
  wallet: string;
  scannedSignatures: number;
  uniqueSlots: number;
  slotRange: { min: string; max: string } | null;
  walletSwapsParsed: number;
  detectedCount: number;
  groundTruthCount: number;
  truePositives: number;
  falsePositives: number;
  falseNegatives: number;
  matchRate: number; // TP / (TP + FN), aka recall against ground truth
  detections: Array<{
    layer: SandwichDetection["layer"];
    confidence: number;
    status: SandwichDetection["status"];
    slot: string;
    victim: string;
    frontRun: string;
    backRun: string;
    attacker: string;
    pool: string;
    jitoBundled: boolean;
    matchedGroundTruth: boolean;
  }>;
  walletSwaps: WalletSwapSummary[];
  groundTruth: GroundTruthAttack[];
  matches: {
    matched: string[]; // victim signatures present in both sets
    detectedOnly: string[];
    groundTruthOnly: string[];
  };
};

async function getBlock(helius: HeliusClient, slot: bigint): Promise<HeliusBlock | null> {
  return helius.getBlock(slot);
}

function txTouchesTrackedDex(tx: HeliusBlockTransaction): boolean {
  const seen = new Set<string>();
  const collect = (ixs: Array<{ programId?: string }> | undefined): void => {
    for (const ix of ixs ?? []) {
      if (typeof ix.programId === "string") seen.add(ix.programId);
    }
  };
  collect(tx.transaction?.message?.instructions);
  for (const group of tx.meta?.innerInstructions ?? []) {
    collect(group.instructions);
  }
  for (const pid of seen) {
    if (TRACKED_DEX_PROGRAM_IDS.has(pid)) return true;
  }
  return false;
}

async function expandSlot(
  helius: HeliusClient,
  slot: bigint,
): Promise<ParsedSwap[]> {
  const block = await getBlock(helius, slot);
  if (!block) return [];
  const txs = block.transactions ?? [];

  const sigToIndex = new Map<string, number>();
  const candidates: string[] = [];
  for (let i = 0; i < txs.length; i += 1) {
    const blockTx = txs[i];
    if (!blockTx) continue;
    const sig = blockTx.transaction?.signatures?.[0];
    if (!sig) continue;
    sigToIndex.set(sig, i);
    if (txTouchesTrackedDex(blockTx)) candidates.push(sig);
  }
  if (candidates.length === 0) return [];

  const enriched = [];
  for (let i = 0; i < candidates.length; i += PARSE_BATCH) {
    const chunk = candidates.slice(i, i + PARSE_BATCH);
    const batch = await helius.parseTransactions(chunk);
    enriched.push(...batch);
  }

  const out: ParsedSwap[] = [];
  for (const tx of enriched) {
    const trueIndex = sigToIndex.get(tx.signature);
    if (trueIndex === undefined) continue;
    const parsed = parseHeliusTxToSwaps(tx, { txIndexInBlock: trueIndex });
    for (const ps of parsed) out.push(ps);
  }
  out.sort((a, b) => a.txIndexInBlock - b.txIndexInBlock);
  return out;
}

/**
 * Per-run in-memory Jito client — wraps the harness's local fetcher and
 * memoises lookups so the validator doesn't refetch the same signature
 * across the run. Production uses runtime/jito-bundle.ts (Redis-backed);
 * this is the harness equivalent.
 */
function createHarnessJitoClient(): JitoBundleResolver & { stats(): { hits: number; misses: number } } {
  const cache = new Map<string, JitoBundleInfo | null>();
  let hits = 0;
  let misses = 0;
  return {
    async getBundleForTx(signature: string): Promise<JitoBundleInfo | null> {
      if (!signature) return null;
      const cached = cache.get(signature);
      if (cached !== undefined) {
        hits += 1;
        return cached;
      }
      const info = await getJitoBundleForSignature(signature);
      cache.set(signature, info);
      misses += 1;
      return info;
    },
    stats() {
      return { hits, misses };
    },
  };
}

async function loadUserGroundTruth(wallet: string): Promise<GroundTruthAttack[]> {
  const path = resolve(`research/ground-truth/${wallet}.json`);
  try {
    const raw = await readFile(path, "utf8");
    const parsed = JSON.parse(raw) as { attacks?: GroundTruthAttack[] };
    if (!Array.isArray(parsed.attacks)) return [];
    return parsed.attacks.map((a) => ({ ...a, source: "user-pasted" as const }));
  } catch {
    return [];
  }
}

async function deriveJitoGroundTruth(params: {
  walletSwaps: ParsedSwap[];
  blockSwapsBySlot: Map<string, ParsedSwap[]>;
  jito: JitoBundleResolver;
  wallet: string;
}): Promise<GroundTruthAttack[]> {
  const out: GroundTruthAttack[] = [];

  for (const victim of params.walletSwaps) {
    if (victim.signer !== params.wallet) continue;
    if (victim.failed) continue;

    const bundle = await params.jito.getBundleForTx(victim.signature).catch(() => null);
    if (!bundle) continue;
    if (bundle.signaturesInBundle.length < 3) continue;

    const victimIdx = bundle.signaturesInBundle.indexOf(victim.signature);
    if (victimIdx <= 0) continue;
    if (victimIdx === bundle.signaturesInBundle.length - 1) continue;

    const frontSig = bundle.signaturesInBundle[victimIdx - 1];
    const backSig = bundle.signaturesInBundle[victimIdx + 1];
    if (!frontSig || !backSig) continue;

    const slotSwaps = params.blockSwapsBySlot.get(victim.slot.toString()) ?? [];
    const frontRun = slotSwaps.find((s) => s.signature === frontSig);
    const backRun = slotSwaps.find((s) => s.signature === backSig);
    if (!frontRun || !backRun) continue;

    if (!isSandwichShape(victim, frontRun, backRun)) continue;

    out.push({
      slot: Number(victim.slot),
      victimSignature: victim.signature,
      attackerSignature: frontSig,
      attacker: frontRun.signer,
      source: "jito-bundle",
      evidence: {
        bundleId: bundle.bundleId,
        bundleSize: bundle.signaturesInBundle.length,
        tipLamports: bundle.tipLamports.toString(),
      },
    });
  }
  return out;
}

export async function validateWallet(opts: {
  wallet: string;
  limit: number;
  helius: HeliusClient;
  groundTruthOverride?: GroundTruthAttack[];
}): Promise<ValidateWalletReport> {
  const { wallet, limit, helius } = opts;

  const signatures = await getSignaturesForAddress(wallet, limit);
  const bySlot = new Map<bigint, Set<string>>();
  for (const row of signatures) {
    const slot = BigInt(row.slot);
    const set = bySlot.get(slot) ?? new Set();
    set.add(row.signature);
    bySlot.set(slot, set);
  }

  const blockSwapsBySlot = new Map<string, ParsedSwap[]>();
  const allWalletSwaps: ParsedSwap[] = [];

  let processed = 0;
  for (const slot of bySlot.keys()) {
    const swaps = await expandSlot(helius, slot);
    blockSwapsBySlot.set(slot.toString(), swaps);
    for (const s of swaps) {
      if (s.signer === wallet && !s.failed) allWalletSwaps.push(s);
    }
    processed += 1;
    if (processed % 5 === 0) {
      // eslint-disable-next-line no-console
      console.log(
        `expandedSlots=${processed}/${bySlot.size} walletSwapsSoFar=${allWalletSwaps.length}`,
      );
    }
  }

  const jito = createHarnessJitoClient();

  // Run production detector against every wallet swap in its block.
  const detections: SandwichDetection[] = [];
  for (const [slotKey, slotSwaps] of blockSwapsBySlot) {
    const walletSwapsInSlot = allWalletSwaps.filter(
      (s) => s.slot.toString() === slotKey,
    );
    if (walletSwapsInSlot.length === 0) continue;
    const slotDetections = await detectSandwichesForWalletSwaps({
      wallet,
      walletSwaps: walletSwapsInSlot,
      blockSwaps: slotSwaps,
      jito,
    });
    detections.push(...slotDetections);
  }

  // Mechanical ground truth from Jito.
  const jitoGroundTruth = await deriveJitoGroundTruth({
    walletSwaps: allWalletSwaps,
    blockSwapsBySlot,
    jito,
    wallet,
  });

  // User-pasted ground truth (optional, takes precedence on overlap).
  const userGroundTruth =
    opts.groundTruthOverride ?? (await loadUserGroundTruth(wallet));

  // Union, dedup by victim signature.
  const groundTruthByVictim = new Map<string, GroundTruthAttack>();
  for (const a of jitoGroundTruth) groundTruthByVictim.set(a.victimSignature, a);
  for (const a of userGroundTruth) groundTruthByVictim.set(a.victimSignature, a);
  const groundTruth = [...groundTruthByVictim.values()];

  const detectedVictims = new Set(detections.map((d) => d.victim.signature));
  const groundTruthVictims = new Set(groundTruth.map((a) => a.victimSignature));

  const matched = [...detectedVictims].filter((s) => groundTruthVictims.has(s));
  const detectedOnly = [...detectedVictims].filter((s) => !groundTruthVictims.has(s));
  const groundTruthOnly = [...groundTruthVictims].filter((s) => !detectedVictims.has(s));

  const matchRate =
    groundTruthVictims.size === 0
      ? 0
      : matched.length / groundTruthVictims.size;

  const slots = [...bySlot.keys()];
  const slotRange =
    slots.length === 0
      ? null
      : {
          min: slots.reduce((a, b) => (a < b ? a : b)).toString(),
          max: slots.reduce((a, b) => (a > b ? a : b)).toString(),
        };

  const walletSwaps: WalletSwapSummary[] = allWalletSwaps.map((s) => {
    const slotKey = s.slot.toString();
    const sameSlot = blockSwapsBySlot.get(slotKey) ?? [];
    const samePool = sameSlot.filter((c) => c.pool === s.pool && c.signature !== s.signature);
    return {
      signature: s.signature,
      slot: slotKey,
      txIndexInBlock: s.txIndexInBlock,
      pool: s.pool,
      dex: s.dex,
      programId: s.programId,
      inputMint: s.inputMint,
      outputMint: s.outputMint,
      inputAmount: s.inputAmount.toString(),
      outputAmount: s.outputAmount.toString(),
      jitoBundled: s.jitoBundled,
      jitoTipLamports: s.jitoTipLamports?.toString() ?? null,
      sameSlotSwapCount: sameSlot.length,
      samePoolSwapCount: samePool.length,
    };
  });

  return {
    wallet,
    scannedSignatures: signatures.length,
    uniqueSlots: bySlot.size,
    slotRange,
    walletSwapsParsed: allWalletSwaps.length,
    detectedCount: detections.length,
    groundTruthCount: groundTruth.length,
    truePositives: matched.length,
    falsePositives: detectedOnly.length,
    falseNegatives: groundTruthOnly.length,
    matchRate,
    detections: detections.map((d) => ({
      layer: d.layer,
      confidence: d.confidence,
      status: d.status,
      slot: d.victim.slot.toString(),
      victim: d.victim.signature,
      frontRun: d.frontRun.signature,
      backRun: d.backRun.signature,
      attacker: d.attacker,
      pool: d.pool,
      jitoBundled: d.jitoBundled,
      matchedGroundTruth: groundTruthVictims.has(d.victim.signature),
    })),
    walletSwaps,
    groundTruth,
    matches: { matched, detectedOnly, groundTruthOnly },
  };
}

/**
 * Mine victim wallets from recent Jito bundles. Walks the recent-bundles
 * endpoint, picks 3-tx bundles whose middle tx's signer differs from
 * tx[0]/tx[2] (attacker's classic shape), parses all three with the
 * production Helius parser, and verifies isSandwichShape against any
 * common pool. The middle signer is the victim wallet — the kind of
 * mechanically-confirmed validation target the brief asks for.
 *
 * Returns up to opts.target wallets, deduped. If a single wallet appears
 * in multiple bundles only the first is kept (we want diversity, not
 * concentration on one frequent victim).
 */
export type MinedVictim = {
  wallet: string;
  bundleId: string;
  slot: number;
  attacker: string;
  pool: string;
  dex: string;
  victimSignature: string;
  frontSignature: string;
  backSignature: string;
};

export async function mineVictimWalletsFromJito(opts: {
  helius: HeliusClient;
  scanBundles: number;
  target: number;
}): Promise<MinedVictim[]> {
  const { helius, scanBundles, target } = opts;
  const { getBundle, getRecentBundles } = await import("./jito.ts");

  const recent = await getRecentBundles(scanBundles);
  // eslint-disable-next-line no-console
  console.log(`recentBundlesScanned=${recent.length}`);

  const out: MinedVictim[] = [];
  const seenWallets = new Set<string>();

  for (const record of recent) {
    if (out.length >= target) break;
    if (record.transactions.length !== 3) continue; // tightest sandwich shape

    const [frontSig, victimSig, backSig] = record.transactions;
    if (!frontSig || !victimSig || !backSig) continue;

    const bundle = await getBundle(record.bundleId).catch(() => null);
    if (!bundle) continue;
    if (bundle.txSignatures.length !== 3) continue;

    let parsed;
    try {
      parsed = await helius.parseTransactions([frontSig, victimSig, backSig]);
    } catch {
      continue;
    }
    if (parsed.length < 3) continue;

    const bySig = new Map<string, HeliusEnhancedTransaction>(
      parsed.map((p) => [p.signature, p]),
    );
    const front = bySig.get(frontSig);
    const victim = bySig.get(victimSig);
    const back = bySig.get(backSig);
    if (!front || !victim || !back) continue;

    // Quick signer check before spending RPC on swap parsing.
    if (front.feePayer !== back.feePayer) continue;
    if (front.feePayer === victim.feePayer) continue;

    const frontSwaps = parseHeliusTxToSwaps(front, { txIndexInBlock: 0 });
    const victimSwaps = parseHeliusTxToSwaps(victim, { txIndexInBlock: 1 });
    const backSwaps = parseHeliusTxToSwaps(back, { txIndexInBlock: 2 });

    let matchedPool: { pool: string; dex: string; attacker: string } | null = null;
    for (const v of victimSwaps) {
      const f = frontSwaps.find((s) => s.pool === v.pool);
      const b = backSwaps.find((s) => s.pool === v.pool);
      if (!f || !b) continue;
      if (!isSandwichShape(v, f, b)) continue;
      matchedPool = { pool: v.pool, dex: v.dex, attacker: f.signer };
      break;
    }
    if (!matchedPool) continue;

    const victimWallet = victim.feePayer;
    if (seenWallets.has(victimWallet)) continue;
    seenWallets.add(victimWallet);

    out.push({
      wallet: victimWallet,
      bundleId: bundle.bundleId,
      slot: bundle.slot,
      attacker: matchedPool.attacker,
      pool: matchedPool.pool,
      dex: matchedPool.dex,
      victimSignature: victimSig,
      frontSignature: frontSig,
      backSignature: backSig,
    });
    // eslint-disable-next-line no-console
    console.log(
      `mined wallet=${victimWallet} dex=${matchedPool.dex} pool=${matchedPool.pool} bundle=${bundle.bundleId}`,
    );
  }

  return out;
}

/**
 * Validate the production detector against an exact known sandwich.
 * Given (wallet, slot, victim-sig), expands the slot via the production
 * pipeline and asks: does detectSandwichesForWalletSwaps fire on the
 * known-sandwiched wallet swap? Returns detected / not-detected with
 * the layer + confidence when detected.
 *
 * This is the most direct measure of "given a Jito-bundle-confirmed
 * sandwich, does our detector see it?" — no recent-activity dependence.
 */
export type BundleValidationResult = {
  wallet: string;
  slot: number;
  victimSignature: string;
  detected: boolean;
  layer: SandwichDetection["layer"] | null;
  confidence: number | null;
  status: SandwichDetection["status"] | null;
  detectedVictims: string[];
  reason: string | null;
};

export async function validateBundle(opts: {
  wallet: string;
  slot: bigint;
  victimSignature: string;
  helius: HeliusClient;
}): Promise<BundleValidationResult> {
  const { wallet, slot, victimSignature, helius } = opts;

  const swaps = await expandSlot(helius, slot);
  const walletSwapsInSlot = swaps.filter((s) => s.signer === wallet && !s.failed);
  if (walletSwapsInSlot.length === 0) {
    return {
      wallet,
      slot: Number(slot),
      victimSignature,
      detected: false,
      layer: null,
      confidence: null,
      status: null,
      detectedVictims: [],
      reason: "wallet has no parsed swap in this slot (parser miss or failed tx)",
    };
  }

  const jito = createHarnessJitoClient();

  // Verbose tracing — when a known sandwich is missed, dump the candidate
  // set and the bundle structure so we can see exactly what L1 saw.
  if (process.env.HARNESS_TRACE === "1") {
    for (const v of walletSwapsInSlot) {
      const samePool = swaps.filter(
        (s) => s.pool === v.pool && s.signature !== v.signature,
      );
      // eslint-disable-next-line no-console
      console.log(
        `  [trace] victimSig=${v.signature} signer=${v.signer} pool=${v.pool} samePoolCandidates=${samePool.length}`,
      );
      for (const c of samePool) {
        // eslint-disable-next-line no-console
        console.log(`    [trace] cand sig=${c.signature} idx=${c.txIndexInBlock} signer=${c.signer}`);
      }
      const bundle = await jito.getBundleForTx(v.signature).catch(() => null);
      if (bundle) {
        // eslint-disable-next-line no-console
        console.log(
          `    [trace] bundleId=${bundle.bundleId} sigs=${bundle.signaturesInBundle.join(",")}`,
        );
      } else {
        // eslint-disable-next-line no-console
        console.log("    [trace] no bundle");
      }
    }
  }

  const detections = await detectSandwichesForWalletSwaps({
    wallet,
    walletSwaps: walletSwapsInSlot,
    blockSwaps: swaps,
    jito,
  });

  const matchingDetection = detections.find(
    (d) => d.victim.signature === victimSignature,
  );

  if (matchingDetection) {
    return {
      wallet,
      slot: Number(slot),
      victimSignature,
      detected: true,
      layer: matchingDetection.layer,
      confidence: matchingDetection.confidence,
      status: matchingDetection.status,
      detectedVictims: detections.map((d) => d.victim.signature),
      reason: null,
    };
  }

  // The wallet has a swap in this slot but the detector didn't flag it.
  return {
    wallet,
    slot: Number(slot),
    victimSignature,
    detected: false,
    layer: null,
    confidence: null,
    status: null,
    detectedVictims: detections.map((d) => d.victim.signature),
    reason: "wallet swap parsed, detector did not flag it (L1-L4 all returned null)",
  };
}

/**
 * Mine victim wallets via known-bot signers. For each address in
 * KNOWN_SANDWICH_BOTS, fetch recent signatures, look up Jito bundle
 * membership, and any bundle of size 3+ where the bot is the
 * tx[0]/tx[2] signer and someone else is in the middle is a sandwich
 * candidate. The middle signer is the victim.
 *
 * This is faster than scanning random recent bundles because every
 * bundle a known sandwich bot is in IS a sandwich by construction.
 */
export async function mineVictimWalletsFromKnownBots(opts: {
  helius: HeliusClient;
  bots: string[];
  perBotSigLimit: number;
  target: number;
}): Promise<MinedVictim[]> {
  const { helius, bots, perBotSigLimit, target } = opts;
  const { getJitoBundleForSignature } = await import("./jito.ts");
  const { getSignaturesForAddress } = await import("./rpc.ts");

  const out: MinedVictim[] = [];
  const seenWallets = new Set<string>();
  const seenBundles = new Set<string>();

  for (const bot of bots) {
    if (out.length >= target) break;
    // eslint-disable-next-line no-console
    console.log(`scanning bot=${bot} sigLimit=${perBotSigLimit}`);
    const sigs = await getSignaturesForAddress(bot, perBotSigLimit).catch(() => []);
    // eslint-disable-next-line no-console
    console.log(`  signatures=${sigs.length}`);

    for (const row of sigs) {
      if (out.length >= target) break;

      const bundle = await getJitoBundleForSignature(row.signature).catch(() => null);
      if (!bundle) continue;
      if (bundle.signaturesInBundle.length < 3) continue;
      if (seenBundles.has(bundle.bundleId)) continue;
      seenBundles.add(bundle.bundleId);

      // Walk every 3-window in the bundle and apply sandwich shape.
      for (let i = 0; i + 2 < bundle.signaturesInBundle.length; i += 1) {
        const frontSig = bundle.signaturesInBundle[i]!;
        const victimSig = bundle.signaturesInBundle[i + 1]!;
        const backSig = bundle.signaturesInBundle[i + 2]!;

        let parsed;
        try {
          parsed = await helius.parseTransactions([frontSig, victimSig, backSig]);
        } catch {
          continue;
        }
        if (parsed.length < 3) continue;

        const bySig = new Map<string, HeliusEnhancedTransaction>(
          parsed.map((p) => [p.signature, p]),
        );
        const front = bySig.get(frontSig);
        const victim = bySig.get(victimSig);
        const back = bySig.get(backSig);
        if (!front || !victim || !back) continue;

        if (front.feePayer !== back.feePayer) continue;
        if (front.feePayer === victim.feePayer) continue;

        const frontSwaps = parseHeliusTxToSwaps(front, { txIndexInBlock: i });
        const victimSwaps = parseHeliusTxToSwaps(victim, { txIndexInBlock: i + 1 });
        const backSwaps = parseHeliusTxToSwaps(back, { txIndexInBlock: i + 2 });

        let matched: { pool: string; dex: string; attacker: string } | null = null;
        for (const v of victimSwaps) {
          const f = frontSwaps.find((s) => s.pool === v.pool);
          const b = backSwaps.find((s) => s.pool === v.pool);
          if (!f || !b) continue;
          if (!isSandwichShape(v, f, b)) continue;
          matched = { pool: v.pool, dex: v.dex, attacker: f.signer };
          break;
        }
        if (!matched) continue;

        const victimWallet = victim.feePayer;
        if (seenWallets.has(victimWallet)) continue;
        seenWallets.add(victimWallet);

        out.push({
          wallet: victimWallet,
          bundleId: bundle.bundleId,
          slot: bundle.landedSlot,
          attacker: matched.attacker,
          pool: matched.pool,
          dex: matched.dex,
          victimSignature: victimSig,
          frontSignature: frontSig,
          backSignature: backSig,
        });
        // eslint-disable-next-line no-console
        console.log(
          `  mined wallet=${victimWallet} dex=${matched.dex} bundle=${bundle.bundleId}`,
        );
      }
    }
  }

  return out;
}

/**
 * Per-slot, per-victim deep diagnostic. Walks every layer (L1 → L4)
 * of the production classifier against a single wallet swap and
 * explains why each layer did or did not fire. Used to answer "the
 * wallet's swap is in a slot with same-pool activity but the detector
 * returned nothing — what is L4 actually evaluating?".
 */
export async function diagnoseSlot(opts: {
  wallet: string;
  slot: bigint;
  helius: HeliusClient;
}): Promise<void> {
  const { wallet, slot, helius } = opts;
  // eslint-disable-next-line no-console
  console.log(`diagnoseSlot wallet=${wallet} slot=${slot}`);

  const swaps = await expandSlot(helius, slot);
  // eslint-disable-next-line no-console
  console.log(`parsedSwapsInSlot=${swaps.length}`);

  const walletSwaps = swaps.filter((s) => s.signer === wallet && !s.failed);
  // eslint-disable-next-line no-console
  console.log(`walletSwapsInSlot=${walletSwaps.length}`);

  for (const victim of walletSwaps) {
    // eslint-disable-next-line no-console
    console.log(
      `\nVICTIM sig=${victim.signature} idx=${victim.txIndexInBlock} pool=${victim.pool}`,
    );
    // eslint-disable-next-line no-console
    console.log(
      `  in=${victim.inputMint.slice(0, 6)}.. out=${victim.outputMint.slice(0, 6)}.. inAmt=${victim.inputAmount} outAmt=${victim.outputAmount}`,
    );

    const samePool = swaps.filter(
      (s) => s.pool === victim.pool && s.signature !== victim.signature,
    );
    // eslint-disable-next-line no-console
    console.log(`  samePoolCandidates=${samePool.length}`);
    for (const c of samePool) {
      const dir = c.inputMint === victim.inputMint ? "same-dir" : "reverse-dir";
      // eslint-disable-next-line no-console
      console.log(
        `    idx=${c.txIndexInBlock} signer=${c.signer.slice(0, 8)} ${dir} in=${c.inputMint.slice(0, 6)}.. out=${c.outputMint.slice(0, 6)}.. inAmt=${c.inputAmount} outAmt=${c.outputAmount} failed=${c.failed}`,
      );
    }

    // L2 nearest-neighbor sandwich-shape probe
    const sameSigner = new Map<string, ParsedSwap[]>();
    for (const c of samePool) {
      if (c.signer === victim.signer) continue;
      const list = sameSigner.get(c.signer) ?? [];
      list.push(c);
      sameSigner.set(c.signer, list);
    }
    // eslint-disable-next-line no-console
    console.log(`  distinctNonVictimSigners=${sameSigner.size}`);
    for (const [signer, list] of sameSigner) {
      const fronts = list.filter(
        (s) =>
          s.txIndexInBlock < victim.txIndexInBlock &&
          s.inputMint === victim.inputMint &&
          s.outputMint === victim.outputMint &&
          !s.failed,
      );
      const backs = list.filter(
        (s) =>
          s.txIndexInBlock > victim.txIndexInBlock &&
          s.inputMint === victim.outputMint &&
          s.outputMint === victim.inputMint,
      );
      // eslint-disable-next-line no-console
      console.log(
        `  signer=${signer.slice(0, 8)} fronts=${fronts.length} backs=${backs.length}`,
      );
      for (const f of fronts) {
        for (const b of backs) {
          const sellTolerance = (f.outputAmount * 85n) / 100n;
          const sellOk = b.failed || b.inputAmount >= sellTolerance;
          const profit = b.outputAmount - f.inputAmount;
          const ratio =
            victim.inputAmount > 0n && f.inputAmount > 0n
              ? Number(f.inputAmount) / Number(victim.inputAmount)
              : NaN;
          const frontDist = victim.txIndexInBlock - f.txIndexInBlock;
          const backDist = b.txIndexInBlock - victim.txIndexInBlock;
          const sandwichShapeOk = isSandwichShape(victim, f, b);
          // eslint-disable-next-line no-console
          console.log(
            `    candidate front=${f.txIndexInBlock} back=${b.txIndexInBlock} sellOk=${sellOk} profit=${profit} ratio=${ratio.toFixed(3)} frontDist=${frontDist} backDist=${backDist} shapeOk=${sandwichShapeOk}`,
          );
        }
      }
    }
  }
}

export async function writeValidationReport(
  report: ValidateWalletReport,
  outDir: string = "research/validation-runs",
): Promise<string> {
  await mkdir(resolve(outDir), { recursive: true });
  const ts = new Date().toISOString().replace(/[:.]/g, "-");
  const path = resolve(outDir, `${report.wallet}-${ts}.json`);
  await writeFile(path, `${JSON.stringify(report, null, 2)}\n`);
  return path;
}

export function renderValidationReport(report: ValidateWalletReport): string {
  return [
    `wallet=${report.wallet}`,
    `scannedSignatures=${report.scannedSignatures} uniqueSlots=${report.uniqueSlots} walletSwapsParsed=${report.walletSwapsParsed}`,
    `slotRange=${report.slotRange ? `${report.slotRange.min}..${report.slotRange.max}` : "none"}`,
    "",
    "Wallet swaps (parsed from tracked-DEX programs):",
    ...report.walletSwaps.map(
      (s) =>
        `  slot=${s.slot} idx=${s.txIndexInBlock} dex=${s.dex} pool=${s.pool} sameSlotSwaps=${s.sameSlotSwapCount} samePool=${s.samePoolSwapCount} jito=${s.jitoBundled} sig=${s.signature}`,
    ),
    "",
    `detectedCount=${report.detectedCount} groundTruthCount=${report.groundTruthCount}`,
    `truePositives=${report.truePositives} falsePositives=${report.falsePositives} falseNegatives=${report.falseNegatives}`,
    report.groundTruthCount === 0
      ? "matchRate=n/a (no ground truth — Jito has no bundle for any wallet swap, no user-pasted listings)"
      : `matchRate=${(report.matchRate * 100).toFixed(1)}% (${report.truePositives}/${report.groundTruthCount} ground-truth victims detected)`,
    "",
    "Detections:",
    ...report.detections.map(
      (d) =>
        `  ${d.layer} ${d.confidence.toFixed(2)} ${d.status} slot=${d.slot} pool=${d.pool} victim=${d.victim} ${d.matchedGroundTruth ? "[matched]" : "[unconfirmed]"}`,
    ),
    "",
    "Ground truth (independent of detector):",
    ...report.groundTruth.map(
      (a) => `  ${a.source} slot=${a.slot} victim=${a.victimSignature} attacker=${a.attacker ?? "?"}`,
    ),
    "",
    `False negatives (in ground truth, detector missed): ${report.matches.groundTruthOnly.length}`,
    ...report.matches.groundTruthOnly.map((s) => `  ${s}`),
    "",
    `False positives (detector flagged, no ground truth confirmation): ${report.matches.detectedOnly.length}`,
    ...report.matches.detectedOnly.map((s) => `  ${s}`),
  ].join("\n");
}
