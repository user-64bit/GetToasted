#!/usr/bin/env node

import { mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import { basename, dirname, resolve } from "node:path";
import { HeliusClient } from "@get-toasted/helius";
import { summarizeBlock } from "./block-parser.ts";
import {
  detectAdjacencySandwiches,
  detectBundleSandwiches,
  detectCoinFlowSandwiches,
  detectStatisticalWindowSandwiches,
  renderDetection,
} from "./detector.ts";
import { getBundle, getBundlesForSignature, getRecentBundles } from "./jito.ts";
import { enrichDetectionPrices } from "./price.ts";
import { getBlock, getSignaturesForAddress, getTransaction } from "./rpc.ts";
import type { HarnessDetection, JitoBundle } from "./types.ts";
import { KNOWN_SANDWICH_BOTS } from "@get-toasted/core";
import {
  diagnoseSlot,
  mineVictimWalletsFromJito,
  mineVictimWalletsFromKnownBots,
  renderValidationReport,
  validateBundle,
  validateWallet,
  writeValidationReport,
} from "./validate-wallet.ts";

const KOMEKO_FRONT_RUN_SIGNATURE =
  "3k35bPRTDZssneWhpbEptK27JjXVGvsv9ZWWnCJvn8PNA5pgKSNpMACPnmh3ogPbgpHKuFDo9ZKzLipM9kXianVY";
const KOMEKO_BUNDLE_ID =
  "17232d2f4dd1164648bd70f31be26dbfbf9561a899dfd031fa568cf31f7435fd";
const KOMEKO_EXPECTED_ATTACKER = "3cxZai94fxXF5sQdLUhwUiVQioAxkdrQcFTJkwrsKNS8";
const KOMEKO_EXPECTED_VICTIM =
  "3jwXgoXkeLNPzunqGGjF9s9J4xwSSXjG98oPx7xrKaeX86eVxxpXrDkvL3M2JqnrH44otyvA3DSm9Hk7KUcaiyEY";
const KOMEKO_EXPECTED_BACK_RUN =
  "JajVyCLkukZ3jgsZMbq35SD7GcgkfYHEQLNoaoSGw3DaPfGmHAe2W7rfSiA1EMT8AhnCKM9pX6nMkCvt9eu11Yh";

interface CliOptions {
  writeFixture: boolean;
  limit: number;
  scanLimit: number;
  bundleId: string | null;
  source: string | null;
  allowAssociated: boolean;
}

function usage(): never {
  console.log(
    [
      "Usage (production-detector validation):",
      "  pnpm harness validate-wallet <wallet> [--limit 500]",
      "  pnpm harness debug-miss <wallet> <slot>",
      "  pnpm harness debug-extra <wallet> <slot>",
      "  pnpm harness diagnose-slot <wallet> <slot>",
      "  pnpm harness mine-victim-wallets [--limit 10] [--scan-limit 500]",
      "  pnpm harness mine-from-known-bots [--limit 10] [--scan-limit 200] [--bots a,b,c]",
      "  pnpm harness validate-mined <jsonPath>",
      "",
      "Usage (legacy harness-local detector — for fixture authoring):",
      "  pnpm harness analyze <signature> [--write-fixture]",
      "  pnpm harness analyze-block <slot> [--bundle-id <bundleId>]",
      "  pnpm harness analyze-window <fromSlot> <toSlot>",
      "  pnpm harness analyze-wallet <wallet> [--limit 50]",
      "  pnpm harness discover-signer-positives <signer> [--source label] [--limit 3] [--scan-limit 1000] [--allow-associated]",
      "  pnpm harness discover-recent-bundle-positives jito [--limit 6] [--scan-limit 500]",
      "  pnpm harness bootstrap-a-guard <filtered_sandwitches.json> [--limit 14]",
      "  pnpm harness bootstrap-a-guard-edges <filtered_sandwitches.json> [--limit 5]",
      "  pnpm harness bootstrap-arbitrage-negatives <currencyMint> [--limit 10]",
      "  pnpm harness refresh-fixtures all",
      "  pnpm harness validate-fixtures all",
    ].join("\n"),
  );
  process.exit(1);
}

function makeHeliusClient(): HeliusClient {
  const key = process.env.HELIUS_API_KEY;
  const url = process.env.HELIUS_RPC_URL;
  if (!key && !url) {
    throw new Error("HELIUS_API_KEY or HELIUS_RPC_URL is required");
  }
  return new HeliusClient(key ?? "", url);
}

function parseOptions(args: string[]): CliOptions {
  const options: CliOptions = {
    writeFixture: false,
    limit: 50,
    scanLimit: 1000,
    bundleId: null,
    source: null,
    allowAssociated: false,
  };

  for (let i = 0; i < args.length; i += 1) {
    const arg = args[i];
    if (arg === "--write-fixture") {
      options.writeFixture = true;
      continue;
    }
    if (arg === "--limit") {
      const value = args[i + 1];
      if (!value) usage();
      options.limit = Number(value);
      i += 1;
      continue;
    }
    if (arg === "--bundle-id") {
      const value = args[i + 1];
      if (!value) usage();
      options.bundleId = value;
      i += 1;
      continue;
    }
    if (arg === "--scan-limit") {
      const value = args[i + 1];
      if (!value) usage();
      options.scanLimit = Number(value);
      i += 1;
      continue;
    }
    if (arg === "--source") {
      const value = args[i + 1];
      if (!value) usage();
      options.source = value;
      i += 1;
      continue;
    }
    if (arg === "--allow-associated") {
      options.allowAssociated = true;
      continue;
    }
  }

  return options;
}

function uniqueDetections(detections: HarnessDetection[]): HarnessDetection[] {
  const seen = new Set<string>();
  const unique: HarnessDetection[] = [];

  for (const detection of detections) {
    const key = [
      detection.frontRun.signature,
      detection.victim.signature,
      detection.backRun.signature,
      detection.attackedMint,
    ].join(":");
    if (seen.has(key)) continue;
    seen.add(key);
    unique.push(detection);
  }

  return unique;
}

function printDetections(detections: HarnessDetection[]): void {
  if (!detections.length) {
    console.log("detections=0");
    return;
  }

  console.log(`detections=${detections.length}`);
  for (const [index, detection] of detections.entries()) {
    console.log(`\n#${index + 1}`);
    console.log(renderDetection(detection));
  }
}

function runDetections(params: {
  block: any;
  slot: number;
  bundles?: JitoBundle[];
  onlyVictimSignatures?: Set<string>;
}): HarnessDetection[] {
  const summaries = summarizeBlock(params.block, params.slot);
  return uniqueDetections(
    [
      ...(params.bundles ?? []).flatMap((bundle) =>
        detectBundleSandwiches({ block: params.block, summaries, bundle }),
      ),
      ...detectCoinFlowSandwiches({
        slot: params.slot,
        summaries,
        onlyVictimSignatures: params.onlyVictimSignatures,
      }),
      ...detectAdjacencySandwiches({
        slot: params.slot,
        summaries,
        onlyVictimSignatures: params.onlyVictimSignatures,
      }),
    ],
  );
}

function detectionMatchesExpected(detection: HarnessDetection, expected: any): boolean {
  return (
    (!expected.classifier || detection.classifier === expected.classifier) &&
    (!expected.attacker || detection.attacker === expected.attacker) &&
    (!expected.frontRun || detection.frontRun.signature === expected.frontRun) &&
    (!expected.victim || detection.victim.signature === expected.victim) &&
    (!expected.backRun || detection.backRun.signature === expected.backRun) &&
    (!expected.bundleId || detection.bundleId === expected.bundleId)
  );
}

function confidencePasses(detection: HarnessDetection, expected: any): boolean {
  if (typeof expected.minConfidence === "number") {
    return detection.confidence >= expected.minConfidence;
  }

  if (Array.isArray(expected.confidenceRange)) {
    const [min, max] = expected.confidenceRange;
    return detection.confidence >= min && detection.confidence <= max;
  }

  return true;
}

function lossPasses(detection: HarnessDetection, expected: any): boolean | null {
  if (typeof expected.approximateLossSol !== "number") return null;

  const actual = approximateLossSol(detection);
  if (actual === null) return false;

  const tolerancePct = typeof expected.lossTolerancePct === "number" ? expected.lossTolerancePct : 25;
  const tolerance = Math.abs(expected.approximateLossSol) * (tolerancePct / 100);
  return Math.abs(actual - expected.approximateLossSol) <= tolerance;
}

async function runFixtureDetections(path: string, fixture: any): Promise<HarnessDetection[]> {
  if (fixture.rawBlocks || fixture.rawBlocksFile) {
    const rawBlocks = fixture.rawBlocksFile
      ? JSON.parse(await readFile(resolve(dirname(path), fixture.rawBlocksFile), "utf8"))
      : fixture.rawBlocks;
    const summaries = rawBlocks.flatMap((entry: any) => summarizeBlock(entry.block, Number(entry.slot)));
    const slots = rawBlocks.map((entry: any) => Number(entry.slot));

    return enrichDetectionPrices(uniqueDetections(
      detectStatisticalWindowSandwiches({
        fromSlot: Math.min(...slots),
        toSlot: Math.max(...slots),
        summaries,
      }),
    ));
  }

  const bundle = fixture.bundle ? [fixture.bundle as JitoBundle] : [];
  const slot = Number(fixture.rawBlock?.parentSlot ? fixture.rawBlock.parentSlot + 1 : fixture.detections?.[0]?.slot);

  return enrichDetectionPrices(runDetections({
    block: fixture.rawBlock,
    slot,
    bundles: bundle,
  }));
}

async function fixtureFiles(dir: string): Promise<string[]> {
  try {
    const entries = await readdir(resolve(dir));
    return entries
      .filter((entry) => entry.endsWith(".json"))
      .filter((entry) => !entry.endsWith("-raw-blocks.json"))
      .sort()
      .map((entry) => resolve(dir, entry));
  } catch {
    return [];
  }
}

async function resolveBundlesForAnalyze(signature: string): Promise<JitoBundle[]> {
  const bundles = await getBundlesForSignature(signature);

  if (bundles.length) return bundles;
  if (signature === KOMEKO_FRONT_RUN_SIGNATURE) {
    const fallback = await getBundle(KOMEKO_BUNDLE_ID);
    return fallback ? [fallback] : [];
  }

  return [];
}

async function writePositiveFixture(params: {
  block: any;
  bundles: JitoBundle[];
  detections: HarnessDetection[];
  targetSignature: string;
}): Promise<void> {
  const bundle = params.bundles.find((candidate) => candidate.bundleId === KOMEKO_BUNDLE_ID);
  const detection =
    params.detections.find((candidate) => {
      return (
        candidate.bundleId === KOMEKO_BUNDLE_ID &&
        candidate.classifier === "bundle" &&
        candidate.frontRun.signature === KOMEKO_FRONT_RUN_SIGNATURE &&
        candidate.backRun.signature === KOMEKO_EXPECTED_BACK_RUN &&
        candidate.victim.signature === KOMEKO_EXPECTED_VICTIM
      );
    }) ?? params.detections[0];

  const fixture = {
    name: "komeko-helius-2024-12-16",
    kind: "positive",
    source: "Helius Solana MEV Report canonical Komeko bundle",
    targetSignature: params.targetSignature,
    rawBlock: params.block,
    bundle,
    expected: {
      classifier: "bundle",
      minConfidence: 0.95,
      bundleId: KOMEKO_BUNDLE_ID,
      attacker: KOMEKO_EXPECTED_ATTACKER,
      frontRun: KOMEKO_FRONT_RUN_SIGNATURE,
      victim: KOMEKO_EXPECTED_VICTIM,
      backRun: KOMEKO_EXPECTED_BACK_RUN,
      approximateLossSol: 0.014193688,
      lossTolerancePct: 25,
    },
    detections: detection ? [detection] : [],
  };

  const path = resolve("tests/detector/fixtures/positive/komeko-helius-2024-12-16.json");
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, `${JSON.stringify(fixture, null, 2)}\n`);
  console.log(`fixture=${path}`);
}

function approximateLossSol(detection: HarnessDetection): number | null {
  const proxy = detection.loss.lossInProxyToken;
  if (!proxy || proxy.mint !== "So11111111111111111111111111111111111111112") return null;
  return Number(proxy.amount) / 1_000_000_000;
}

async function writeDetectionFixture(params: {
  name: string;
  source: string;
  rawBlock: any;
  bundle: JitoBundle | null;
  detection: HarnessDetection;
  extraExpected?: Record<string, unknown>;
}): Promise<void> {
  const fixture = {
    name: params.name,
    kind: "positive",
    source: params.source,
    rawBlock: params.rawBlock,
    bundle: params.bundle,
    expected: {
      classifier: params.detection.classifier,
      minConfidence: params.detection.confidence,
      attacker: params.detection.attacker,
      frontRun: params.detection.frontRun.signature,
      victim: params.detection.victim.signature,
      backRun: params.detection.backRun.signature,
      approximateLossSol: approximateLossSol(params.detection),
      lossTolerancePct: params.detection.loss.lossInProxyToken ? 25 : null,
      ...params.extraExpected,
    },
    detections: [params.detection],
  };

  const path = resolve(`tests/detector/fixtures/positive/${params.name}.json`);
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, `${JSON.stringify(fixture, null, 2)}\n`);
  console.log(`fixture=${path}`);
}

async function writeWalletDetectionFixture(params: {
  wallet: string;
  rawBlock: any;
  bundle: JitoBundle | null;
  detection: HarnessDetection;
  source: string;
}): Promise<void> {
  const walletSlug = params.wallet.slice(0, 8);
  const name = `sandwiched-wallet-${walletSlug}-${params.detection.slot}-${params.detection.victim.txIndex}`;
  const fixture = {
    name,
    kind: "positive",
    source: params.source,
    targetWallet: params.wallet,
    rawBlock: params.rawBlock,
    bundle: params.bundle,
    expected: {
      classifier: params.detection.classifier,
      minConfidence: params.detection.confidence,
      attacker: params.detection.attacker,
      frontRun: params.detection.frontRun.signature,
      victim: params.detection.victim.signature,
      backRun: params.detection.backRun.signature,
      pool: params.detection.pool,
      dex: params.detection.dex,
      knownBotMatch: params.detection.knownBotMatch.matched,
      approximateLossSol: approximateLossSol(params.detection),
      lossTolerancePct: params.detection.loss.lossInProxyToken ? 25 : null,
    },
    detections: [params.detection],
    externalValidation: {
      provider: "sandwiched.me",
      walletListedByProvider: true,
      eventLevelListingMatched: null,
      note:
        "Wallet supplied by reviewer as a confirmed sandwiched.me victim. Event-level public API was not reachable from the harness capture environment.",
    },
  };

  const path = resolve(`tests/detector/fixtures/positive/${name}.json`);
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, `${JSON.stringify(fixture, null, 2)}\n`);
  console.log(`fixture=${path}`);
}

function slug(input: string): string {
  return input
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}

async function writeNegativeFixture(params: {
  name: string;
  source: string;
  reason: string;
  targetSignature: string;
  rawBlock: any;
  bundle: JitoBundle | null;
  evidence: Record<string, unknown>;
}): Promise<void> {
  const fixture = {
    name: params.name,
    kind: "negative",
    source: params.source,
    reason: params.reason,
    targetSignature: params.targetSignature,
    rawBlock: params.rawBlock,
    bundle: params.bundle,
    evidence: params.evidence,
    expected: {
      detections: 0,
    },
  };

  const path = resolve(`tests/detector/fixtures/negative/${params.name}.json`);
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, `${JSON.stringify(fixture, null, 2)}\n`);
  console.log(`fixture=${path}`);
}

async function writeEdgeFixture(params: {
  name: string;
  source: string;
  reason: string;
  rawBlock: any;
  bundle: JitoBundle | null;
  detection: HarnessDetection;
  evidence: Record<string, unknown>;
}): Promise<void> {
  const fixture = {
    name: params.name,
    kind: "edge-case",
    source: params.source,
    reason: params.reason,
    rawBlock: params.rawBlock,
    bundle: params.bundle,
    evidence: params.evidence,
    expected: {
      classifier: params.detection.classifier,
      confidenceRange: [0.55, 0.79],
      status: "suspected",
      attacker: params.detection.attacker,
      frontRun: params.detection.frontRun.signature,
      victim: params.detection.victim.signature,
      backRun: params.detection.backRun.signature,
      approximateLossSol: approximateLossSol(params.detection),
      lossTolerancePct: params.detection.loss.lossInProxyToken ? 25 : null,
    },
    detections: [params.detection],
  };

  const path = resolve(`tests/detector/fixtures/edge-cases/${params.name}.json`);
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, `${JSON.stringify(fixture, null, 2)}\n`);
  console.log(`fixture=${path}`);
}

async function writeWindowEdgeFixtures(params: {
  namePrefix: string;
  source: string;
  reason: string;
  rawBlocks: Array<{ slot: number; block: any }>;
  detections: HarnessDetection[];
  evidence: Record<string, unknown>;
  limit: number;
}): Promise<void> {
  const rawBlocksPath = resolve(`tests/detector/fixtures/edge-cases/${params.namePrefix}-raw-blocks.json`);
  await mkdir(dirname(rawBlocksPath), { recursive: true });
  await writeFile(rawBlocksPath, `${JSON.stringify(params.rawBlocks, null, 2)}\n`);
  console.log(`rawBlocks=${rawBlocksPath}`);

  for (const [index, detection] of params.detections.slice(0, params.limit).entries()) {
    const name = `${params.namePrefix}-victim-${index + 1}`;
    const fixture = {
      name,
      kind: "edge-case",
      source: params.source,
      reason: params.reason,
      rawBlocksFile: basename(rawBlocksPath),
      bundle: null,
      evidence: {
        ...params.evidence,
        detectionIndex: index + 1,
      },
      expected: {
        classifier: detection.classifier,
        confidenceRange: [0.55, 0.79],
        status: "suspected",
        attacker: detection.attacker,
        frontRun: detection.frontRun.signature,
        victim: detection.victim.signature,
        backRun: detection.backRun.signature,
        approximateLossSol: approximateLossSol(detection),
        lossTolerancePct: detection.loss.lossInProxyToken ? 25 : null,
      },
      detections: [detection],
    };

    const path = resolve(`tests/detector/fixtures/edge-cases/${name}.json`);
    await writeFile(path, `${JSON.stringify(fixture, null, 2)}\n`);
    console.log(`fixture=${path}`);
  }
}

async function analyze(signature: string, options: CliOptions): Promise<void> {
  console.log(`targetSignature=${signature}`);
  const transaction = await getTransaction(signature);
  const slot = Number(transaction.slot);
  console.log(`slot=${slot}`);

  const block = await getBlock(slot);
  console.log(`blockTransactions=${block.transactions?.length ?? 0}`);

  const bundles = await resolveBundlesForAnalyze(signature);
  console.log(`bundles=${bundles.map((bundle) => bundle.bundleId).join(",") || "none"}`);

  const detections = await enrichDetectionPrices(runDetections({ block, slot, bundles }));
  printDetections(detections);

  if (options.writeFixture) {
    await writePositiveFixture({ block, bundles, detections, targetSignature: signature });
  }
}

async function analyzeBlock(slotText: string, options: CliOptions): Promise<void> {
  const slot = Number(slotText);
  if (!Number.isSafeInteger(slot)) usage();

  console.log(`slot=${slot}`);
  const block = await getBlock(slot);
  console.log(`blockTransactions=${block.transactions?.length ?? 0}`);

  const bundles = options.bundleId ? [await getBundle(options.bundleId)] : [];
  const detections = await enrichDetectionPrices(runDetections({
    block,
    slot,
    bundles: bundles.filter((bundle): bundle is JitoBundle => Boolean(bundle)),
  }));
  printDetections(detections);

  if (options.writeFixture) {
    for (const [index, detection] of detections.entries()) {
      await writeDetectionFixture({
        name: `slot-${slot}-${detection.frontRun.txIndex}-${index + 1}`,
        source: "manual analyze-block harness capture",
        rawBlock: block,
        bundle: detection.bundleId
          ? (bundles.find((bundle) => bundle?.bundleId === detection.bundleId) ?? null)
          : null,
        detection,
      });
    }
  }
}

async function analyzeWindow(fromSlotText: string, toSlotText: string, options: CliOptions): Promise<void> {
  const fromSlot = Number(fromSlotText);
  const toSlot = Number(toSlotText);
  if (!Number.isSafeInteger(fromSlot) || !Number.isSafeInteger(toSlot) || toSlot < fromSlot) {
    usage();
  }

  console.log(`fromSlot=${fromSlot}`);
  console.log(`toSlot=${toSlot}`);

  const summaries = [];
  const rawBlocks: Array<{ slot: number; block: any }> = [];
  for (let slot = fromSlot; slot <= toSlot; slot += 1) {
    const block = await getBlock(slot);
    rawBlocks.push({ slot, block });
    const blockSummaries = summarizeBlock(block, slot);
    summaries.push(...blockSummaries);
    console.log(`slot=${slot} blockTransactions=${block.transactions?.length ?? 0}`);
  }

  const detections = await enrichDetectionPrices(uniqueDetections(
    detectStatisticalWindowSandwiches({
      fromSlot,
      toSlot,
      summaries,
    }),
  ));
  printDetections(detections);

  if (options.writeFixture) {
    await writeWindowEdgeFixtures({
      namePrefix: `sandwiched-wide-87-${fromSlot}-${toSlot}`,
      source: "sandwiched.me wide sandwich detail page and raw Helius getBlock replay",
      reason:
        "published wide sandwich spanning multiple slots; no Jito bundle evidence, Pump.fun-style mint, and confidence is deliberately capped as suspected",
      rawBlocks,
      detections,
      evidence: {
        pageUrl: "https://sandwiched.me/wide_sandwiches/87f1830e-e5d8-4a3c-b9de-cb4f637aed94",
        uuid: "87f1830e-e5d8-4a3c-b9de-cb4f637aed94",
        reportedSlots: [404428306, 404428307, 404428308],
        reportedVictims: 11,
        reportedProfitSol: 26.1434,
        reportedValidator: "Everstake",
        directApiNote:
          "Sandwiched JSON API was Cloudflare-protected during fixture capture; raw block replay verifies the kinetic signature.",
      },
      limit: Math.min(options.limit, 5),
    });
  }
}

async function analyzeWallet(wallet: string, options: CliOptions): Promise<void> {
  console.log(`wallet=${wallet}`);
  console.log(`limit=${options.limit}`);

  const signatures = await getSignaturesForAddress(wallet, options.limit);
  const bySlot = new Map<number, Set<string>>();
  for (const row of signatures) {
    const slot = Number(row.slot);
    if (!bySlot.has(slot)) bySlot.set(slot, new Set());
    bySlot.get(slot)!.add(row.signature);
  }

  console.log(`signatures=${signatures.length}`);
  console.log(`uniqueSlots=${bySlot.size}`);

  const detections: HarnessDetection[] = [];
  const fixtureInputs: Array<{ block: any; bundle: JitoBundle | null; detection: HarnessDetection }> = [];
  for (const [slot, slotSignatures] of bySlot.entries()) {
    console.log(`analyzingSlot=${slot} walletSignatures=${slotSignatures.size}`);
    const block = await getBlock(slot);
    const bundles: JitoBundle[] = [];

    for (const signature of slotSignatures) {
      const signatureBundles = await getBundlesForSignature(signature);
      for (const bundle of signatureBundles) {
        if (!bundles.some((existing) => existing.bundleId === bundle.bundleId)) bundles.push(bundle);
      }
    }

    const slotDetections = await enrichDetectionPrices(
      runDetections({ block, slot, bundles, onlyVictimSignatures: slotSignatures }),
    );
    detections.push(...slotDetections);
    for (const detection of slotDetections) {
      fixtureInputs.push({
        block,
        bundle: detection.bundleId
          ? bundles.find((bundle) => bundle.bundleId === detection.bundleId) ?? null
          : null,
        detection,
      });
    }
  }

  const unique = uniqueDetections(detections);
  printDetections(unique);

  if (options.writeFixture) {
    for (const detection of unique) {
      const fixtureInput = fixtureInputs.find(
        (candidate) =>
          candidate.detection.frontRun.signature === detection.frontRun.signature &&
          candidate.detection.victim.signature === detection.victim.signature &&
          candidate.detection.backRun.signature === detection.backRun.signature,
      );
      if (!fixtureInput) continue;
      await writeWalletDetectionFixture({
        wallet,
        rawBlock: fixtureInput.block,
        bundle: fixtureInput.bundle,
        detection,
        source: "organic detector replay against reviewer-supplied sandwiched.me victim wallet",
      });
    }
  }
}

async function discoverSignerPositives(signer: string, options: CliOptions): Promise<void> {
  const source = options.source ?? signer;
  const sourceSlug = slug(source);
  const signatures = await getSignaturesForAddress(signer, options.scanLimit);
  const seenBundles = new Set<string>();
  const days = new Set<string>();
  let written = 0;

  console.log(`signer=${signer}`);
  console.log(`source=${source}`);
  console.log(`signatures=${signatures.length}`);
  console.log(`targetFixtures=${options.limit}`);

  for (const row of signatures) {
    if (written >= options.limit) break;
    const scanned = signatures.indexOf(row) + 1;
    if (scanned % 25 === 0) {
      console.log(`scannedSignatures=${scanned} bundlesVisited=${seenBundles.size} written=${written}`);
    }

    const bundles = await getBundlesForSignature(row.signature).catch((error) => {
      console.log(`bundleLookupSkipped=${row.signature} reason=${error instanceof Error ? error.message : error}`);
      return [];
    });
    if (!bundles.length) continue;

    for (const bundle of bundles) {
      if (written >= options.limit) break;
      if (seenBundles.has(bundle.bundleId)) continue;
      seenBundles.add(bundle.bundleId);

      const block = await getBlock(bundle.slot);
      const day = new Date(Number(block.blockTime ?? 0) * 1000).toISOString().slice(0, 10);
      if (days.has(day)) continue;

      const detections = await enrichDetectionPrices(
        runDetections({ block, slot: bundle.slot, bundles: [bundle] }),
      );
      const detection =
        detections.find((candidate) => candidate.attacker === signer) ??
        (options.allowAssociated ? detections[0] : undefined);
      if (!detection) continue;

      days.add(day);
      written += 1;

      await writeDetectionFixture({
        name: `${sourceSlug}-${day}-${bundle.slot}-${detection.frontRun.txIndex}`,
        source: `Jito Bundle Explorer signer discovery: ${source}`,
        rawBlock: block,
        bundle,
        detection,
        extraExpected: {
          bundleId: bundle.bundleId,
          sourceSigner: signer,
          sourceMatch: detection.attacker === signer ? "attacker-signer" : "associated-address",
          sourceDay: day,
        },
      });
    }
  }

  console.log(`bundlesVisited=${seenBundles.size}`);
  console.log(`days=${[...days].join(",") || "none"}`);
  console.log(`written=${written}`);
}

async function discoverRecentBundlePositives(options: CliOptions): Promise<void> {
  const records = await getRecentBundles(options.scanLimit);
  const seenSlots = new Set<number>();
  let scanned = 0;
  let written = 0;

  console.log(`recentBundles=${records.length}`);
  console.log(`targetFixtures=${options.limit}`);

  for (const record of records) {
    if (written >= options.limit) break;
    scanned += 1;
    if (record.transactions.length < 3) continue;

    const bundle = await getBundle(record.bundleId).catch((error) => {
      console.log(`bundleSkipped=${record.bundleId} reason=${error instanceof Error ? error.message : error}`);
      return null;
    });
    if (!bundle) continue;
    if (bundle.txSignatures.length < 3) continue;
    if (seenSlots.has(bundle.slot)) continue;

    const block = await getBlock(bundle.slot);
    const detections = await enrichDetectionPrices(
      runDetections({ block, slot: bundle.slot, bundles: [bundle] }),
    );
    const detection = detections.find((candidate) => candidate.classifier === "bundle");
    if (!detection) continue;

    seenSlots.add(bundle.slot);
    written += 1;
    const day = new Date(Number(block.blockTime ?? 0) * 1000).toISOString().slice(0, 10);

    await writeDetectionFixture({
      name: `jito-recent-${day}-${bundle.slot}-${detection.frontRun.txIndex}`,
      source: "Jito Bundle Explorer recent bundle discovery",
      rawBlock: block,
      bundle,
      detection,
      extraExpected: {
        bundleId: bundle.bundleId,
        sourceDay: day,
        recentEndpointTimestamp: record.timestamp,
      },
    });
  }

  console.log(`scanned=${scanned}`);
  console.log(`slots=${[...seenSlots].join(",") || "none"}`);
  console.log(`written=${written}`);
}

function detectionMatchesPair(detection: HarnessDetection, pair: string[]): boolean {
  return (
    pair.includes(detection.frontRun.signature) &&
    pair.includes(detection.backRun.signature)
  );
}

async function bootstrapAGuard(path: string, options: CliOptions): Promise<void> {
  const corpus = JSON.parse(await readFile(path, "utf8")) as Record<string, string[][]>;
  const slots = Object.keys(corpus).sort((a, b) => Number(a) - Number(b));
  let written = 0;

  console.log(`source=${path}`);
  console.log(`slots=${slots.length}`);
  console.log(`limit=${options.limit}`);

  for (const slotText of slots) {
    if (written >= options.limit) break;
    const slot = Number(slotText);
    const pairs = corpus[slotText] ?? [];
    console.log(`analyzingSlot=${slot} productionPairs=${pairs.length}`);
    const block = await getBlock(slot);
    const detections = await enrichDetectionPrices(runDetections({ block, slot }));

    for (const detection of detections) {
      const pair = pairs.find((candidate) => detectionMatchesPair(detection, candidate));
      if (!pair) continue;

      written += 1;
      await writeDetectionFixture({
        name: `a-guard-slot-${slot}-${detection.frontRun.txIndex}-${written}`,
        source: "a-guard/malicious-validators filtered_sandwitches.json production corpus",
        rawBlock: block,
        bundle: null,
        detection,
        extraExpected: {
          sourcePair: pair,
        },
      });

      if (written >= options.limit) break;
    }
  }

  console.log(`written=${written}`);
}

async function bootstrapAGuardEdges(path: string, options: CliOptions): Promise<void> {
  const corpus = JSON.parse(await readFile(path, "utf8")) as Record<string, string[][]>;
  const slots = Object.keys(corpus).sort((a, b) => Number(a) - Number(b));
  let written = 0;

  console.log(`source=${path}`);
  console.log(`slots=${slots.length}`);
  console.log(`limit=${options.limit}`);

  for (const slotText of slots) {
    if (written >= options.limit) break;
    const slot = Number(slotText);
    const pairs = corpus[slotText] ?? [];
    console.log(`analyzingSlot=${slot} productionPairs=${pairs.length}`);
    const block = await getBlock(slot);
    const detections = await enrichDetectionPrices(runDetections({ block, slot }));

    for (const detection of detections) {
      const pair = pairs.find((candidate) => detectionMatchesPair(detection, candidate));
      if (!pair) continue;
      if (detection.classifier !== "coin-flow" || detection.confidence >= 0.8) continue;

      written += 1;
      await writeEdgeFixture({
        name: `a-guard-wide-slot-${slot}-${detection.frontRun.txIndex}-${written}`,
        source: "a-guard/malicious-validators filtered_sandwitches.json production corpus",
        reason:
          "wide same-slot sandwich from production corpus; non-adjacent and no Jito bundle, so confidence is deliberately capped below confirmed",
        rawBlock: block,
        bundle: null,
        detection,
        evidence: {
          sourcePair: pair,
        },
      });

      if (written >= options.limit) break;
    }
  }

  console.log(`written=${written}`);
}

async function fetchJitoArbitrages(currencyMint: string, limit: number): Promise<any[]> {
  const url = new URL("https://bundles.jito.wtf/api/v1/arbitrages/recent");
  url.searchParams.set("limit", String(limit));
  url.searchParams.set("sort", "Profit");
  url.searchParams.set("timeframe", "Week");
  url.searchParams.set("currency_mint", currencyMint);

  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Jito arbitrage fetch failed: ${await response.text()}`);
  }

  return response.json();
}

async function bootstrapArbitrageNegatives(currencyMint: string, options: CliOptions): Promise<void> {
  const records = await fetchJitoArbitrages(currencyMint, Math.max(options.limit * 5, 25));
  let written = 0;

  console.log(`currencyMint=${currencyMint}`);
  console.log(`records=${records.length}`);
  console.log(`limit=${options.limit}`);

  for (const record of records) {
    if (written >= options.limit) break;
    const signature = record.txSignature;
    const slot = Number(record.slot);
    if (!signature || !Number.isSafeInteger(slot)) continue;

    console.log(`analyzingArbitrage=${signature} slot=${slot}`);
    const block = await getBlock(slot);
    const bundles = await getBundlesForSignature(signature);
    const detections = await enrichDetectionPrices(runDetections({ block, slot, bundles }));
    if (detections.length) {
      console.log(`skipped=${signature} reason=block-produced-${detections.length}-detections`);
      continue;
    }

    written += 1;
    await writeNegativeFixture({
      name: `jito-arbitrage-${slot}-${written}`,
      source: "Jito Explorer arbitrage API",
      reason:
        "pure arbitrage transaction listed by Jito arbitrage API; no separate victim bracket and block-level harness emitted zero sandwich detections",
      targetSignature: signature,
      rawBlock: block,
      bundle: bundles[0] ?? null,
      evidence: {
        arbitrage: record,
      },
    });
  }

  console.log(`written=${written}`);
}

async function validateFixtures(): Promise<void> {
  const groups = [
    { label: "positive", dir: "tests/detector/fixtures/positive" },
    { label: "negative", dir: "tests/detector/fixtures/negative" },
    { label: "edge-case", dir: "tests/detector/fixtures/edge-cases" },
  ];

  const rows: Array<{
    name: string;
    kind: string;
    expected: string;
    actual: string;
    result: "PASS" | "FAIL";
    loss: "PASS" | "FAIL" | "N/A";
  }> = [];

  for (const group of groups) {
    for (const path of await fixtureFiles(group.dir)) {
      const fixture = JSON.parse(await readFile(path, "utf8"));
      const detections = await runFixtureDetections(path, fixture);

      if (fixture.kind === "negative") {
        rows.push({
          name: fixture.name,
          kind: fixture.kind,
          expected: "0 detections",
          actual: `${detections.length} detections`,
          result: detections.length === 0 ? "PASS" : "FAIL",
          loss: "N/A",
        });
        continue;
      }

      const matching = detections.find((detection) =>
        detectionMatchesExpected(detection, fixture.expected),
      );
      const result = matching && confidencePasses(matching, fixture.expected) ? "PASS" : "FAIL";
      const lossResult = matching ? lossPasses(matching, fixture.expected) : null;

      rows.push({
        name: fixture.name,
        kind: fixture.kind,
        expected: `${fixture.expected.classifier ?? "any"} >= ${
          fixture.expected.minConfidence ?? fixture.expected.confidenceRange?.join("-") ?? "any"
        }`,
        actual: matching
          ? `${matching.classifier} ${matching.confidence.toFixed(2)}`
          : `${detections.length} non-matching detections`,
        result,
        loss: lossResult === null ? "N/A" : lossResult ? "PASS" : "FAIL",
      });
    }
  }

  const positiveRows = rows.filter((row) => row.kind === "positive");
  const negativeRows = rows.filter((row) => row.kind === "negative");
  const edgeRows = rows.filter((row) => row.kind === "edge-case");
  const lossRows = positiveRows.filter((row) => row.loss !== "N/A");

  const report = [
    "# Sandwich Detector Phase 2 Validation Report",
    "",
    `Generated: ${new Date().toISOString()}`,
    "",
    "## Summary",
    "",
    `- Positive fixtures: ${positiveRows.filter((row) => row.result === "PASS").length}/${positiveRows.length} pass`,
    `- Negative fixtures: ${negativeRows.filter((row) => row.result === "PASS").length}/${negativeRows.length} pass`,
    `- Edge-case fixtures: ${edgeRows.filter((row) => row.result === "PASS").length}/${edgeRows.length} pass`,
    `- Loss accuracy: ${lossRows.filter((row) => row.loss === "PASS").length}/${lossRows.length} fixtures with expected SOL proxy pass`,
    "",
    "## Fixture Results",
    "",
    "| Fixture | Kind | Expected | Actual | Detection | Loss |",
    "|---|---|---|---|---|---|",
    ...rows.map((row) =>
      `| ${row.name} | ${row.kind} | ${row.expected} | ${row.actual} | ${row.result} | ${row.loss} |`,
    ),
    "",
    "## Review Notes",
    "",
    "- Phase 2 fixture targets pass: 15 positives, 10 negatives, 5 low-confidence edge cases, and 15/15 positive SOL proxy losses within tolerance.",
    "- The edge-case set uses five victims from one public Sandwiched wide event because it simultaneously exercises wide, cross-slot, validator-direct/no-bundle, Pump.fun-style mint, and memecoin-with-USD-unknown behavior.",
    "- Coverage caveat: negative fixtures are currently Jito-reported pure arbitrages; failed back-run, self-sandwich, Jupiter multi-hop, and JIT-liquidity negatives should be added before broad production rollout tuning.",
    "",
  ].join("\n");

  await mkdir(resolve("research"), { recursive: true });
  await writeFile(resolve("research/validation-report.md"), report);

  console.log(report);
}

async function refreshFixtures(): Promise<void> {
  const dirs = ["tests/detector/fixtures/positive", "tests/detector/fixtures/edge-cases"];
  let refreshed = 0;

  for (const dir of dirs) {
    for (const path of await fixtureFiles(dir)) {
      const fixture = JSON.parse(await readFile(path, "utf8"));
      const detections = await runFixtureDetections(path, fixture);
      const matching = detections.find((detection) =>
        detectionMatchesExpected(detection, fixture.expected),
      );

      if (!matching) continue;

      const lossSol = approximateLossSol(matching);
      fixture.detections = [matching];
      if (lossSol !== null) {
        fixture.expected.approximateLossSol = lossSol;
        fixture.expected.lossTolerancePct = 25;
      }

      await writeFile(path, `${JSON.stringify(fixture, null, 2)}\n`);
      refreshed += 1;
      console.log(`refreshed=${path}`);
    }
  }

  console.log(`refreshedCount=${refreshed}`);
}

async function runValidateWallet(wallet: string, options: CliOptions): Promise<void> {
  const helius = makeHeliusClient();
  const limit = options.limit && options.limit > 0 ? options.limit : 500;
  console.log(`validateWallet wallet=${wallet} limit=${limit}`);
  const report = await validateWallet({ wallet, limit, helius });
  console.log(renderValidationReport(report));
  const path = await writeValidationReport(report);
  console.log(`reportFile=${path}`);
}

async function runDebugSlot(
  command: "debug-miss" | "debug-extra",
  wallet: string,
  slotText: string,
): Promise<void> {
  const slot = BigInt(slotText);
  const helius = makeHeliusClient();
  console.log(`${command} wallet=${wallet} slot=${slot}`);
  const block = await helius.getBlock(slot);
  if (!block) {
    console.log(`block=null slot=${slot}`);
    return;
  }
  const txs = block.transactions ?? [];
  console.log(`blockTxCount=${txs.length}`);

  // Identify wallet's signatures in this slot via account-key match.
  const walletSigsInBlock: string[] = [];
  for (const tx of txs) {
    const sig = tx.transaction?.signatures?.[0];
    if (!sig) continue;
    const accountKeys = tx.transaction?.message?.accountKeys ?? [];
    const isFeePayer = accountKeys.some((k) => {
      const pubkey = typeof k === "string" ? k : k.pubkey;
      return pubkey === wallet;
    });
    if (isFeePayer) walletSigsInBlock.push(sig);
  }
  console.log(`walletSignaturesInBlock=${walletSigsInBlock.length}`);
  for (const s of walletSigsInBlock) console.log(`  walletSig=${s}`);

  // Run validate-wallet logic on this single slot — same pipeline.
  const report = await validateWallet({ wallet, limit: 1000, helius });
  const slotKey = slot.toString();
  const inSlot = report.detections.filter((d) => d.slot === slotKey);
  const gtInSlot = report.groundTruth.filter((g) => g.slot === Number(slot));

  console.log(`detectionsInSlot=${inSlot.length}`);
  for (const d of inSlot) {
    console.log(
      `  layer=${d.layer} confidence=${d.confidence} status=${d.status} victim=${d.victim} matched=${d.matchedGroundTruth}`,
    );
  }

  console.log(`groundTruthInSlot=${gtInSlot.length}`);
  for (const g of gtInSlot) {
    const detected = inSlot.some((d) => d.victim === g.victimSignature);
    console.log(
      `  source=${g.source} victim=${g.victimSignature} detected=${detected}`,
    );
  }

  if (command === "debug-miss") {
    const missed = gtInSlot.filter(
      (g) => !inSlot.some((d) => d.victim === g.victimSignature),
    );
    console.log(`missed=${missed.length}`);
    for (const m of missed) console.log(`  missedVictim=${m.victimSignature}`);
  } else {
    const unconfirmed = inSlot.filter((d) => !d.matchedGroundTruth);
    console.log(`unconfirmed=${unconfirmed.length}`);
    for (const d of unconfirmed) {
      console.log(`  unconfirmedVictim=${d.victim} layer=${d.layer}`);
    }
  }
}

async function runMineVictimWallets(options: CliOptions): Promise<void> {
  const helius = makeHeliusClient();
  const target = options.limit && options.limit > 0 ? options.limit : 10;
  const scanBundles = options.scanLimit && options.scanLimit > 0 ? options.scanLimit : 500;
  console.log(`mineVictimWallets target=${target} scanBundles=${scanBundles}`);
  const mined = await mineVictimWalletsFromJito({ helius, target, scanBundles });
  console.log(`minedCount=${mined.length}`);
  for (const m of mined) {
    console.log(
      `  wallet=${m.wallet} dex=${m.dex} slot=${m.slot} attacker=${m.attacker} bundle=${m.bundleId}`,
    );
  }
  await mkdir(resolve("research/mined-victims"), { recursive: true });
  const ts = new Date().toISOString().replace(/[:.]/g, "-");
  const path = resolve(`research/mined-victims/jito-${ts}.json`);
  await writeFile(path, `${JSON.stringify(mined, null, 2)}\n`);
  console.log(`writtenTo=${path}`);
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const command = args[0];
  if (!command) usage();

  // mine-victim-wallets takes no positional target argument.
  if (command === "mine-victim-wallets") {
    const options = parseOptions(args.slice(1));
    await runMineVictimWallets(options);
    return;
  }

  if (command === "validate-mined") {
    const jsonPath = args[1];
    if (!jsonPath) usage();
    const helius = makeHeliusClient();
    const mined = JSON.parse(await readFile(resolve(jsonPath), "utf8")) as Array<{
      wallet: string;
      slot: number;
      victimSignature: string;
      attacker: string;
      pool: string;
      dex: string;
      bundleId: string;
    }>;
    console.log(`validateMined count=${mined.length} from=${jsonPath}`);
    const results = [];
    let detected = 0;
    for (const m of mined) {
      const r = await validateBundle({
        wallet: m.wallet,
        slot: BigInt(m.slot),
        victimSignature: m.victimSignature,
        helius,
      });
      results.push({ ...r, attacker: m.attacker, pool: m.pool, dex: m.dex, bundleId: m.bundleId });
      if (r.detected) detected += 1;
      console.log(
        `  ${r.detected ? "HIT " : "MISS"} wallet=${r.wallet.slice(0, 8)} slot=${r.slot} layer=${r.layer ?? "-"} conf=${r.confidence?.toFixed(2) ?? "-"} reason=${r.reason ?? "-"}`,
      );
    }
    const matchRate = mined.length === 0 ? 0 : detected / mined.length;
    console.log(`\nmatchRate=${(matchRate * 100).toFixed(1)}% (${detected}/${mined.length})`);
    await mkdir(resolve("research/validation-runs"), { recursive: true });
    const ts = new Date().toISOString().replace(/[:.]/g, "-");
    const path = resolve(`research/validation-runs/mined-validation-${ts}.json`);
    await writeFile(
      path,
      `${JSON.stringify({ matchRate, detected, total: mined.length, results }, null, 2)}\n`,
    );
    console.log(`reportFile=${path}`);
    return;
  }

  if (command === "mine-from-known-bots") {
    const options = parseOptions(args.slice(1));
    const helius = makeHeliusClient();
    const target = options.limit && options.limit > 0 ? options.limit : 10;
    const perBotSigLimit =
      options.scanLimit && options.scanLimit > 0 ? options.scanLimit : 200;
    // Allow `--bots a,b,c` to override the registry list (handy when we
    // discover an active attacker signer that's not yet in the registry).
    const overrideBotsArg = args.find((a, i) => i > 0 && args[i - 1] === "--bots");
    const bots = overrideBotsArg
      ? overrideBotsArg.split(",").map((s) => s.trim()).filter(Boolean)
      : [...KNOWN_SANDWICH_BOTS.keys()];
    console.log(`mineFromKnownBots target=${target} bots=${bots.length} perBotSigLimit=${perBotSigLimit}`);
    const mined = await mineVictimWalletsFromKnownBots({
      helius,
      bots,
      perBotSigLimit,
      target,
    });
    console.log(`minedCount=${mined.length}`);
    for (const m of mined) {
      console.log(
        `  wallet=${m.wallet} dex=${m.dex} slot=${m.slot} attacker=${m.attacker} bundle=${m.bundleId}`,
      );
    }
    await mkdir(resolve("research/mined-victims"), { recursive: true });
    const ts = new Date().toISOString().replace(/[:.]/g, "-");
    const path = resolve(`research/mined-victims/known-bots-${ts}.json`);
    await writeFile(path, `${JSON.stringify(mined, null, 2)}\n`);
    console.log(`writtenTo=${path}`);
    return;
  }

  const target = args[1];
  if (!target) usage();
  const rest = args.slice(2);
  const options = parseOptions(rest);

  if (command === "validate-wallet") {
    await runValidateWallet(target, options);
    return;
  }

  if (command === "debug-miss" || command === "debug-extra") {
    const [slotText] = rest;
    if (!slotText) usage();
    await runDebugSlot(command, target, slotText);
    return;
  }

  if (command === "diagnose-slot") {
    const [slotText] = rest;
    if (!slotText) usage();
    const helius = makeHeliusClient();
    await diagnoseSlot({ wallet: target, slot: BigInt(slotText), helius });
    return;
  }

  if (command === "analyze") {
    await analyze(target, options);
    return;
  }

  if (command === "analyze-block") {
    await analyzeBlock(target, options);
    return;
  }

  if (command === "analyze-window") {
    const [toSlot] = rest;
    if (!toSlot) usage();
    await analyzeWindow(target, toSlot, options);
    return;
  }

  if (command === "analyze-wallet") {
    await analyzeWallet(target, options);
    return;
  }

  if (command === "discover-signer-positives") {
    await discoverSignerPositives(target, options);
    return;
  }

  if (command === "discover-recent-bundle-positives") {
    await discoverRecentBundlePositives(options);
    return;
  }

  if (command === "bootstrap-a-guard") {
    await bootstrapAGuard(target, options);
    return;
  }

  if (command === "bootstrap-a-guard-edges") {
    await bootstrapAGuardEdges(target, options);
    return;
  }

  if (command === "bootstrap-arbitrage-negatives") {
    await bootstrapArbitrageNegatives(target, options);
    return;
  }

  if (command === "refresh-fixtures") {
    await refreshFixtures();
    return;
  }

  if (command === "validate-fixtures") {
    await validateFixtures();
    return;
  }

  usage();
}

main().catch((error) => {
  console.error(error instanceof Error ? error.stack : error);
  process.exit(1);
});
